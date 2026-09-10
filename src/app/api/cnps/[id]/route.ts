import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cnpsCotisations } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, noContent, notFound, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { cnpsUpdateSchema } from "@/lib/schemas/cnps";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

async function findById(id: number) {
  const [row] = await db
    .select()
    .from(cnpsCotisations)
    .where(eq(cnpsCotisations.id, id));
  return row ?? null;
}

export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "cnps", "read");
  const { id } = idParamSchema.parse(await params);
  const row = await findById(id);
  if (!row) throw notFound("Cotisation CNPS introuvable.");
  return ok(row);
});

export const PATCH = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "cnps", "update");
  const { id } = idParamSchema.parse(await params);
  const patch = cnpsUpdateSchema.parse(await req.json());

  const before = await findById(id);
  if (!before) throw notFound("Cotisation CNPS introuvable.");

  const [row] = await db
    .update(cnpsCotisations)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(cnpsCotisations.id, id))
    .returning();

  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "cnps_cotisations",
    entiteId: id,
    diff: { avant: before, apres: row },
    ip: clientIp(req),
  });

  return ok(row);
});

export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "cnps", "delete");
  const { id } = idParamSchema.parse(await params);

  const before = await findById(id);
  if (!before) throw notFound("Cotisation CNPS introuvable.");

  await db.delete(cnpsCotisations).where(eq(cnpsCotisations.id, id));

  await writeAudit({
    userId: user.id,
    action: "DELETE",
    entite: "cnps_cotisations",
    entiteId: id,
    diff: { avant: before },
    ip: clientIp(req),
  });

  return noContent();
});
