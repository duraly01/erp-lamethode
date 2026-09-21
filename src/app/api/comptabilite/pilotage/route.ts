import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { pilotageQuerySchema } from "@/lib/schemas/comptabilite";
import { getPilotage } from "@/lib/services/comptabilite/pilotage";

/**
 * Tableau de bord de gestion mensuel de l'exercice, recalculé depuis les
 * lignes d'écriture : chiffre d'affaires, marge, valeur ajoutée, EBE,
 * résultat, mois par mois, confrontés au budget.
 */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const q = pilotageQuerySchema.parse(searchParamsToObject(req.url));
  return ok(await getPilotage(q.exerciceId, { jusquAu: q.jusquAu, sectionId: q.sectionId, budgetId: q.budgetId }));
});
