import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, withApi } from "@/lib/http";
import { liquidationTvaSchema } from "@/lib/schemas/comptabilite";
import { liquiderTva } from "@/lib/services/comptabilite/pieces";
import { writeAudit, clientIp } from "@/lib/audit";

/**
 * Passe l'écriture de liquidation de la TVA du mois : solde les comptes de TVA
 * de la période et constate la TVA due ou le crédit à reporter. C'est cette
 * écriture qui alimente le crédit antérieur du mois suivant.
 */
export const POST = withApi(async (req: NextRequest) => {
  const body = liquidationTvaSchema.parse(await req.json());
  const user = requirePermission(
    await getSessionUser(),
    "comptabilite",
    body.valider ? "update" : "create",
  );

  const { ecriture, generee } = await liquiderTva(
    body.exerciceId,
    body.periode,
    user.id,
    { valider: body.valider },
  );

  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "cpta_ecritures",
    entiteId: ecriture.id,
    diff: { apres: { periode: body.periode, tvaDue: generee.totalTva } },
    ip: clientIp(req),
  });

  return created({ ecriture, generee });
});
