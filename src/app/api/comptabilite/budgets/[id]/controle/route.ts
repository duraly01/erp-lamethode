import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { idParamSchema, searchParamsToObject } from "@/lib/schemas/common";
import { budgetControleQuerySchema } from "@/lib/schemas/comptabilite";
import { controleBudget } from "@/lib/services/comptabilite/budget";

type Ctx = { params: Promise<{ id: string }> };

/** Le contrôle budgétaire à une date : budget à date, réalisé, écart, ligne par ligne et en totaux. */
export const GET = withApi(async (req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { id } = idParamSchema.parse(await params);
  const { jusquAu } = budgetControleQuerySchema.parse(searchParamsToObject(req.url));
  return ok(await controleBudget(id, jusquAu));
});
