import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { grandLivreQuerySchema } from "@/lib/schemas/comptabilite";
import { getGrandLivre } from "@/lib/services/comptabilite/restitutions";

/**
 * Grand livre de l'exercice, éventuellement restreint à un compte.
 *
 * Lorsqu'une date de début est fournie, le solde d'ouverture de chaque compte
 * est repris de la période antérieure : sans lui le solde progressif partirait
 * de zéro en milieu d'exercice.
 */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const q = grandLivreQuerySchema.parse(searchParamsToObject(req.url));
  return ok(
    await getGrandLivre(q.exerciceId, {
      dateDebut: q.dateDebut,
      dateFin: q.dateFin,
      compteId: q.compteId,
    }),
  );
});
