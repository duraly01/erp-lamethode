import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { restitutionAnalytiqueQuerySchema } from "@/lib/schemas/comptabilite";
import { restitutionAnalytique } from "@/lib/services/comptabilite/analytique";

/** Charges, produits et résultat par section de l'axe, détail par compte, reste non ventilé en dernier. */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { exerciceId, axeId } = restitutionAnalytiqueQuerySchema.parse(searchParamsToObject(req.url));
  return ok(await restitutionAnalytique(exerciceId, axeId));
});
