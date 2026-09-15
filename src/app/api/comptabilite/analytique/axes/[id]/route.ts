import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { noContent, ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { axeUpdateSchema } from "@/lib/schemas/comptabilite";
import { modifierAxe, supprimerAxe } from "@/lib/services/comptabilite/analytique";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "update");
  const { id } = idParamSchema.parse(await params);
  return ok(await modifierAxe(id, axeUpdateSchema.parse(await req.json())));
});

/** Un axe sans ventilation se supprime ; sinon, il se désactive. */
export const DELETE = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "delete");
  const { id } = idParamSchema.parse(await params);
  await supprimerAxe(id);
  return noContent();
});
