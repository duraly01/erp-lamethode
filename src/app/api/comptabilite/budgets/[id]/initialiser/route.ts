import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { budgetInitialisationSchema } from "@/lib/schemas/comptabilite";
import { initialiserDepuisRealise } from "@/lib/services/comptabilite/budget";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Remplit le budget avec le réalisé d'un exercice, multiplié par un coefficient. Remplace les lignes. */
export const POST = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "update");
  const { id } = idParamSchema.parse(await params);
  const { exerciceSourceId, coefficientPct } = budgetInitialisationSchema.parse(await req.json());
  const budget = await initialiserDepuisRealise(id, exerciceSourceId, coefficientPct);
  await writeAudit({ userId: user.id, action: "UPDATE", entite: "cpta_budgets", entiteId: id, diff: { apres: { exerciceSourceId, coefficientPct, lignes: budget.lignes.length } }, ip: clientIp(req) });
  return ok(budget);
});
