import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { budgetInitialisationSchema } from "@/lib/schemas/comptabilite";
import { initialiserDepuisRealise } from "@/lib/services/comptabilite/budget";

type Ctx = { params: Promise<{ id: string }> };

/** Remplit le budget avec le réalisé d'un exercice, multiplié par un coefficient. Remplace les lignes. */
export const POST = withApi(async (req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "update");
  const { id } = idParamSchema.parse(await params);
  const { exerciceSourceId, coefficientPct } = budgetInitialisationSchema.parse(await req.json());
  return ok(await initialiserDepuisRealise(id, exerciceSourceId, coefficientPct));
});
