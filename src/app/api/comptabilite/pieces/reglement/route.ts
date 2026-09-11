import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, withApi } from "@/lib/http";
import { reglementSchema } from "@/lib/schemas/comptabilite";
import { enregistrerReglement } from "@/lib/services/comptabilite/pieces";
import { writeAudit, clientIp } from "@/lib/audit";

/**
 * Règlement d'un tiers sur un journal de banque ou de caisse. Le compte de
 * trésorerie est celui du journal : il n'est pas demandé.
 */
export const POST = withApi(async (req: NextRequest) => {
  const body = reglementSchema.parse(await req.json());
  const user = requirePermission(
    await getSessionUser(),
    "comptabilite",
    body.valider ? "update" : "create",
  );

  const { ecriture, generee } = await enregistrerReglement(body, user.id);

  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "cpta_ecritures",
    entiteId: ecriture.id,
    diff: { apres: { origine: "REGLEMENT", sens: body.sens, montant: generee.totalTtc } },
    ip: clientIp(req),
  });

  return created({ ecriture, generee });
});
