import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { sortieImmobilisationSchema } from "@/lib/schemas/comptabilite";
import { sortirImmobilisation } from "@/lib/services/comptabilite/immobilisations";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Cession ou mise au rebut : l'écriture de sortie est passée et la fiche fermée. */
export const POST = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "update");
  const { id } = idParamSchema.parse(await params);
  const input = sortieImmobilisationSchema.parse(await req.json());
  const resultat = await sortirImmobilisation(id, input, user.id);
  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "cpta_immobilisations",
    entiteId: id,
    diff: { apres: { statut: resultat.statut, dateSortie: input.dateSortie, prixCession: resultat.prixCession, ecritureSortieId: resultat.ecriture.id } },
    ip: clientIp(req),
  });
  return created(resultat);
});
