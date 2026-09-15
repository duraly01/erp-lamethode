import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { validerBudget } from "@/lib/services/comptabilite/budget";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Fige le budget : c'est lui que le contrôle confronte au réalisé. */
export const POST = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "update");
  const { id } = idParamSchema.parse(await params);
  const budget = await validerBudget(id);
  await writeAudit({ userId: user.id, action: "UPDATE", entite: "cpta_budgets", entiteId: id, diff: { apres: { statut: "VALIDE", libelle: budget.libelle } }, ip: clientIp(req) });
  return ok(budget);
});
