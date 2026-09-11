import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { elementsBulletinSchema } from "@/lib/schemas/paie";
import { getBulletin, modifierElementsBulletin } from "@/lib/services/paie/periodes";

type Ctx = { params: Promise<{ id: string }> };

/** Un bulletin, lignes comprises. */
export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "paie", "read");
  const { id } = idParamSchema.parse(await params);
  return ok(await getBulletin(id));
});

/** Les éléments du mois du bulletin ; il se recalcule aussitôt. */
export const PUT = withApi(async (req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "paie", "update");
  const { id } = idParamSchema.parse(await params);
  return ok(await modifierElementsBulletin(id, elementsBulletinSchema.parse(await req.json())));
});
