import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { balanceQuerySchema } from "@/lib/schemas/comptabilite";
import { getBalance } from "@/lib/services/comptabilite/restitutions";

/**
 * Balance générale de l'exercice, recalculée depuis les lignes d'écriture.
 *
 * Le champ `totaux.equilibree` est un contrôle d'intégrité : il ne peut être
 * faux que si la base contient des lignes orphelines, jamais du fait d'une
 * saisie — chaque écriture est équilibrée à la validation.
 */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const q = balanceQuerySchema.parse(searchParamsToObject(req.url));
  return ok(
    await getBalance(q.exerciceId, {
      dateDebut: q.dateDebut,
      dateFin: q.dateFin,
    }),
  );
});
