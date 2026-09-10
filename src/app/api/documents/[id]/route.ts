import { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, noContent, notFound, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { documentUpdateSchema } from "@/lib/schemas/documents";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

async function findActive(id: number) {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)));
  return row ?? null;
}

export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "documents", "read");
  const { id } = idParamSchema.parse(await params);
  const row = await findActive(id);
  if (!row) throw notFound("Document introuvable.");
  return ok(row);
});

export const PATCH = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "documents", "update");
  const { id } = idParamSchema.parse(await params);
  const patch = documentUpdateSchema.parse(await req.json());

  const before = await findActive(id);
  if (!before) throw notFound("Document introuvable.");

  const [row] = await db
    .update(documents)
    .set(patch)
    .where(eq(documents.id, id))
    .returning();

  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "documents",
    entiteId: id,
    diff: { avant: before, apres: row },
    ip: clientIp(req),
  });

  return ok(row);
});

export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "documents", "delete");
  const { id } = idParamSchema.parse(await params);

  const before = await findActive(id);
  if (!before) throw notFound("Document introuvable.");

  // Soft-delete (le fichier physique sera purgé par un job de nettoyage).
  await db
    .update(documents)
    .set({ deletedAt: new Date() })
    .where(eq(documents.id, id));

  await writeAudit({
    userId: user.id,
    action: "DELETE",
    entite: "documents",
    entiteId: id,
    diff: { avant: before },
    ip: clientIp(req),
  });

  return noContent();
});
