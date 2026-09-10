import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { declarations } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, noContent, notFound, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { declarationUpdateSchema } from "@/lib/schemas/declarations";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

async function findById(id: number) {
  const [row] = await db
    .select()
    .from(declarations)
    .where(eq(declarations.id, id));
  return row ?? null;
}

export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "declarations", "read");
  const { id } = idParamSchema.parse(await params);
  const row = await findById(id);
  if (!row) throw notFound("Déclaration introuvable.");
  return ok(row);
});

export const PATCH = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(
    await getSessionUser(),
    "declarations",
    "update",
  );
  const { id } = idParamSchema.parse(await params);
  const patch = declarationUpdateSchema.parse(await req.json());

  const before = await findById(id);
  if (!before) throw notFound("Déclaration introuvable.");

  const [row] = await db
    .update(declarations)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(declarations.id, id))
    .returning();

  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "declarations",
    entiteId: id,
    diff: { avant: before, apres: row },
    ip: clientIp(req),
  });

  return ok(row);
});

export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(
    await getSessionUser(),
    "declarations",
    "delete",
  );
  const { id } = idParamSchema.parse(await params);

  const before = await findById(id);
  if (!before) throw notFound("Déclaration introuvable.");

  await db.delete(declarations).where(eq(declarations.id, id));

  await writeAudit({
    userId: user.id,
    action: "DELETE",
    entite: "declarations",
    entiteId: id,
    diff: { avant: before },
    ip: clientIp(req),
  });

  return noContent();
});
