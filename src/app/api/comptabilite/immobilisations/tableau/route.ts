import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { parExerciceSchema } from "@/lib/schemas/comptabilite";
import { getTableauImmobilisations } from "@/lib/services/comptabilite/immobilisations";

/** Le tableau des immobilisations de l'exercice : brut et amortissements, de l'ouverture à la clôture. */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { exerciceId } = parExerciceSchema.parse(searchParamsToObject(req.url));
  return ok(await getTableauImmobilisations(exerciceId));
});
