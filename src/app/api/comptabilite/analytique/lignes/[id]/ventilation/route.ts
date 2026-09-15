import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { ventilationSchema } from "@/lib/schemas/comptabilite";
import { ventilerLigne } from "@/lib/services/comptabilite/analytique";

type Ctx = { params: Promise<{ id: string }> };

/** Pose — ou remplace, ou retire avec une liste vide — la ventilation de la ligne sur un axe. */
export const PUT = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "update");
  const { id } = idParamSchema.parse(await params);
  const { axeId, ventilations } = ventilationSchema.parse(await req.json());
  return ok(await ventilerLigne(id, axeId, ventilations, user.id));
});
