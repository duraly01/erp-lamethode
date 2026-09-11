import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { badRequest, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { bulletinsDuMois } from "@/lib/services/paie/impression";
import { buildBulletinsPdf } from "@/lib/exports/bulletin-pdf";
import { fileResponse, PDF_TYPE } from "@/lib/exports/response";

/** Tous les bulletins du mois, un par page. */
export const GET = withApi(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  requirePermission(await getSessionUser(), "paie", "read");
  const { id } = idParamSchema.parse(await params);
  const bulletins = await bulletinsDuMois(id);
  if (bulletins.length === 0) throw badRequest("Aucun bulletin dans ce mois.");
  const buf = await buildBulletinsPdf(bulletins);
  return fileResponse(buf, `Bulletins_${bulletins[0].periode}.pdf`, PDF_TYPE, "inline");
});
