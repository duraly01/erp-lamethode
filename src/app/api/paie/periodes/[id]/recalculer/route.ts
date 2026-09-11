import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { recalculerPeriode } from "@/lib/services/paie/periodes";

type Ctx = { params: Promise<{ id: string }> };

/** Recalcule le mois sur les fiches d'aujourd'hui, éléments saisis conservés. */
export const POST = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "paie", "update");
  const { id } = idParamSchema.parse(await params);
  return ok(await recalculerPeriode(id));
});
