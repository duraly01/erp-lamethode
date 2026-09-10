import { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { contribuables } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, noContent, notFound, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import {
  contribuableUpdateSchema,
  normaliseClasseIgs,
} from "@/lib/schemas/contribuables";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

async function findActive(id: number) {
  const [row] = await db
    .select()
    .from(contribuables)
    .where(and(eq(contribuables.id, id), isNull(contribuables.deletedAt)));
  return row ?? null;
}

export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "contribuables", "read");
  const { id } = idParamSchema.parse(await params);
  const row = await findActive(id);
  if (!row) throw notFound("Contribuable introuvable.");
  return ok(row);
});

export const PATCH = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(
    await getSessionUser(),
    "contribuables",
    "update",
  );
  const { id } = idParamSchema.parse(await params);
  const parsed = contribuableUpdateSchema.parse(await req.json());

  const before = await findActive(id);
  if (!before) throw notFound("Contribuable introuvable.");

  // Régime effectif après application du patch : il arbitre la classe IGS.
  const patch = normaliseClasseIgs(
    parsed,
    parsed.regimeFiscal ?? before.regimeFiscal,
  );

  const [row] = await db
    .update(contribuables)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(contribuables.id, id))
    .returning();

  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "contribuables",
    entiteId: id,
    diff: { avant: before, apres: row },
    ip: clientIp(req),
  });

  return ok(row);
});

export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(
    await getSessionUser(),
    "contribuables",
    "delete",
  );
  const { id } = idParamSchema.parse(await params);

  const before = await findActive(id);
  if (!before) throw notFound("Contribuable introuvable.");

  // Soft-delete : on marque deleted_at plutôt que de supprimer physiquement.
  await db
    .update(contribuables)
    .set({ deletedAt: new Date(), actif: false })
    .where(eq(contribuables.id, id));

  await writeAudit({
    userId: user.id,
    action: "DELETE",
    entite: "contribuables",
    entiteId: id,
    diff: { avant: before },
    ip: clientIp(req),
  });

  return noContent();
});
