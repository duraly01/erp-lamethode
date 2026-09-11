import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { comptabiliserPeriode } from "@/lib/services/paie/comptabilisation";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Passe l'écriture de paie d'un mois validé qui n'en a pas encore — parce
 * que l'exercice n'était pas ouvert au moment de la validation, par exemple.
 */
export const POST = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "paie", "update");
  const { id } = idParamSchema.parse(await params);
  const ecriture = await comptabiliserPeriode(id, user.id);
  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "paie_periodes",
    entiteId: id,
    diff: { apres: { ecritureId: ecriture.id, numeroPiece: ecriture.numeroPiece } },
    ip: clientIp(req),
  });
  return ok(ecriture);
});
