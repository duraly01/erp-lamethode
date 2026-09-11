import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { bulletinPourImpression } from "@/lib/services/paie/impression";
import { buildBulletinsPdf } from "@/lib/exports/bulletin-pdf";
import { fileResponse, PDF_TYPE } from "@/lib/exports/response";

/** Le bulletin d'un salarié, à imprimer. */
export const GET = withApi(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  requirePermission(await getSessionUser(), "paie", "read");
  const { id } = idParamSchema.parse(await params);
  const bulletin = await bulletinPourImpression(id);
  const buf = await buildBulletinsPdf([bulletin]);
  return fileResponse(buf, `Bulletin_${bulletin.salarie.matricule}_${bulletin.periode}.pdf`, PDF_TYPE, "inline");
});
