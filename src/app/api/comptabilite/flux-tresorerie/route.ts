import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { parExerciceSchema } from "@/lib/schemas/comptabilite";
import { getFluxTresorerie } from "@/lib/services/comptabilite/flux-tresorerie";

/**
 * Tableau des flux de trésorerie SYSCOHADA de l'exercice.
 *
 * `coherent` dit si la trésorerie reconstituée par les flux retrouve celle de
 * la balance. Faux, l'écart est rendu et `comptesHorsTableau` en donne en
 * général la cause : un compte qu'aucune règle ne rattache à une ligne.
 */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const q = parExerciceSchema.parse(searchParamsToObject(req.url));
  return ok(await getFluxTresorerie(q.exerciceId));
});
