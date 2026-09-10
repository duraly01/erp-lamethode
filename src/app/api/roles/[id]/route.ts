import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { roles } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, noContent, notFound, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { roleUpdateSchema } from "@/lib/schemas/roles";
import {
  assertAdministrationPreservee,
  assertRoleInutilise,
} from "@/lib/services/roles";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

async function findRole(id: number) {
  const [row] = await db.select().from(roles).where(eq(roles.id, id));
  return row ?? null;
}

export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "roles", "read");
  const { id } = idParamSchema.parse(await params);
  const row = await findRole(id);
  if (!row) throw notFound("Rôle introuvable.");
  return ok(row);
});

export const PATCH = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "roles", "update");
  const { id } = idParamSchema.parse(await params);
  const patch = roleUpdateSchema.parse(await req.json());

  const before = await findRole(id);
  if (!before) throw notFound("Rôle introuvable.");

  if (patch.permissions) {
    await assertAdministrationPreservee(id, patch.permissions);
  }

  const [row] = await db
    .update(roles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(roles.id, id))
    .returning();

  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "roles",
    entiteId: id,
    diff: { avant: before, apres: row },
    ip: clientIp(req),
  });

  return ok(row);
});

export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "roles", "delete");
  const { id } = idParamSchema.parse(await params);

  const before = await findRole(id);
  if (!before) throw notFound("Rôle introuvable.");

  await assertRoleInutilise(id);
  await assertAdministrationPreservee(id, null);

  await db.delete(roles).where(eq(roles.id, id));

  await writeAudit({
    userId: user.id,
    action: "DELETE",
    entite: "roles",
    entiteId: id,
    diff: { avant: before },
    ip: clientIp(req),
  });

  return noContent();
});
