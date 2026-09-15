import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { budgetLignesSchema } from "@/lib/schemas/comptabilite";
import { remplacerLignes } from "@/lib/services/comptabilite/budget";

type Ctx = { params: Promise<{ id: string }> };

/** Remplace toutes les lignes du budget : un compte, une section s'il y a un axe, un montant annuel. */
export const PUT = withApi(async (req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "update");
  const { id } = idParamSchema.parse(await params);
  const { lignes } = budgetLignesSchema.parse(await req.json());
  return ok(await remplacerLignes(id, lignes));
});
