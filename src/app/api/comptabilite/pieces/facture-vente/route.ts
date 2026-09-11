import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, withApi } from "@/lib/http";
import { factureSchema } from "@/lib/schemas/comptabilite";
import { enregistrerFactureVente } from "@/lib/services/comptabilite/pieces";
import { writeAudit, clientIp } from "@/lib/audit";

/**
 * Facture de vente du contribuable : l'écriture est générée et enregistrée
 * au journal des ventes. Un brouillon, sauf si `valider` est demandé — la
 * validation exige alors la permission correspondante.
 */
export const POST = withApi(async (req: NextRequest) => {
  const body = factureSchema.parse(await req.json());
  const user = requirePermission(
    await getSessionUser(),
    "comptabilite",
    body.valider ? "update" : "create",
  );

  const { ecriture, generee, piece } = await enregistrerFactureVente(body, user.id);

  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "cpta_ecritures",
    entiteId: ecriture.id,
    diff: { apres: { pieceId: piece.id, origine: "FACTURE_VENTE", reference: generee.reference, totalTtc: generee.totalTtc } },
    ip: clientIp(req),
  });

  return created({ piece, ecriture, generee });
});
