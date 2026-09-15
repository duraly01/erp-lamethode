import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { lignesAnalytiquesQuerySchema } from "@/lib/schemas/comptabilite";
import { listerLignesAnalytiques } from "@/lib/services/comptabilite/analytique";

/** Lignes de charges et de produits de l'exercice, avec leur ventilation sur l'axe et le reste à ventiler. */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const q = lignesAnalytiquesQuerySchema.parse(searchParamsToObject(req.url));
  return ok(await listerLignesAnalytiques(q));
});
