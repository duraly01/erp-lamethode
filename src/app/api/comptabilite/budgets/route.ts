import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { budgetCreateSchema, parExerciceSchema } from "@/lib/schemas/comptabilite";
import { creerBudget, listerBudgets } from "@/lib/services/comptabilite/budget";

/** Budgets de l'exercice, du plus récent au plus ancien. */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { exerciceId } = parExerciceSchema.parse(searchParamsToObject(req.url));
  return ok(await listerBudgets(exerciceId));
});

export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "create");
  return created(await creerBudget(budgetCreateSchema.parse(await req.json()), user.id));
});
