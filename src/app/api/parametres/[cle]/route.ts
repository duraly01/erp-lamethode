import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { parametres } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, notFound, withApi } from "@/lib/http";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ cle: string }> };

const patchSchema = z.object({ valeur: z.unknown() });

// Mise à jour de la valeur d'un paramètre (réservé aux administrateurs).
export const PATCH = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(
    await getSessionUser(),
    "parametres",
    "update",
  );
  const { cle } = await params;
  const { valeur } = patchSchema.parse(await req.json());

  const [row] = await db
    .update(parametres)
    .set({ valeur, updatedAt: new Date() })
    .where(eq(parametres.cle, cle))
    .returning();

  if (!row) throw notFound("Paramètre introuvable.");

  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "parametres",
    entiteId: row.id,
    diff: { apres: { cle, valeur } },
    ip: clientIp(req),
  });

  return ok(row);
});
