import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { acfSuivis } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, noContent, notFound, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { acfUpdateSchema } from "@/lib/schemas/acf";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

async function findById(id: number) {
  const [row] = await db.select().from(acfSuivis).where(eq(acfSuivis.id, id));
  return row ?? null;
}

export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "acf", "read");
  const { id } = idParamSchema.parse(await params);
  const row = await findById(id);
  if (!row) throw notFound("Suivi ACF introuvable.");
  return ok(row);
});

export const PATCH = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "acf", "update");
  const { id } = idParamSchema.parse(await params);
  const patch = acfUpdateSchema.parse(await req.json());

  const before = await findById(id);
  if (!before) throw notFound("Suivi ACF introuvable.");

  const [row] = await db
    .update(acfSuivis)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(acfSuivis.id, id))
    .returning();

  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "acf_suivis",
    entiteId: id,
    diff: { avant: before, apres: row },
    ip: clientIp(req),
  });

  return ok(row);
});

export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "acf", "delete");
  const { id } = idParamSchema.parse(await params);

  const before = await findById(id);
  if (!before) throw notFound("Suivi ACF introuvable.");

  await db.delete(acfSuivis).where(eq(acfSuivis.id, id));

  await writeAudit({
    userId: user.id,
    action: "DELETE",
    entite: "acf_suivis",
    entiteId: id,
    diff: { avant: before },
    ip: clientIp(req),
  });

  return noContent();
});
