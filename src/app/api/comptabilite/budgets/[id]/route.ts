import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { noContent, ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { budgetUpdateSchema } from "@/lib/schemas/comptabilite";
import { getBudget, modifierBudget, supprimerBudget } from "@/lib/services/comptabilite/budget";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Le budget et ses lignes, avec les totaux de charges et de produits. */
export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { id } = idParamSchema.parse(await params);
  return ok(await getBudget(id));
});

export const PATCH = withApi(async (req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "update");
  const { id } = idParamSchema.parse(await params);
  return ok(await modifierBudget(id, budgetUpdateSchema.parse(await req.json())));
});

/** Un budget en brouillon se jette ; validé, il reste. */
export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "delete");
  const { id } = idParamSchema.parse(await params);
  await supprimerBudget(id);
  await writeAudit({ userId: user.id, action: "DELETE", entite: "cpta_budgets", entiteId: id, ip: clientIp(req) });
  return noContent();
});
