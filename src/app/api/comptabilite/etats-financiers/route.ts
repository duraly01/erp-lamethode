import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { balanceQuerySchema } from "@/lib/schemas/comptabilite";
import { getEtatsFinanciers } from "@/lib/services/comptabilite/etats-financiers";

/**
 * Bilan et compte de résultat SYSCOHADA de l'exercice, avec le comparatif N-1.
 *
 * Deux champs méritent l'attention de l'appelant, et ne doivent pas être
 * masqués à l'écran :
 *
 * - `bilan.equilibre` : faux signale un compte mal rattaché, donc un total
 *   faux. L'état reste affichable — c'est même ainsi qu'on trouve l'erreur.
 * - `comptesNonRattaches` : les comptes qu'aucune règle ne couvre, avec leur
 *   solde. La liste doit rester vide.
 */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const q = balanceQuerySchema.parse(searchParamsToObject(req.url));
  return ok(
    await getEtatsFinanciers(q.exerciceId, {
      dateDebut: q.dateDebut,
      dateFin: q.dateFin,
    }),
  );
});
