import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { noContent, ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { sectionUpdateSchema } from "@/lib/schemas/comptabilite";
import { modifierSection, supprimerSection } from "@/lib/services/comptabilite/analytique";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withApi(async (req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "update");
  const { id } = idParamSchema.parse(await params);
  return ok(await modifierSection(id, sectionUpdateSchema.parse(await req.json())));
});

/** Une section sans ventilation se supprime ; sinon, elle se désactive. */
export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "delete");
  const { id } = idParamSchema.parse(await params);
  await supprimerSection(id);
  await writeAudit({ userId: user.id, action: "DELETE", entite: "cpta_sections_analytiques", entiteId: id, ip: clientIp(req) });
  return noContent();
});
