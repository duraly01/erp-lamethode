import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { construireDipe } from "@/lib/services/paie/impression";
import { fileResponse, XLSX_TYPE } from "@/lib/exports/response";

/** DIPE du mois : l'état nominatif des salaires, en classeur. */
export const GET = withApi(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  requirePermission(await getSessionUser(), "paie", "read");
  const { id } = idParamSchema.parse(await params);
  const { buf, periode } = await construireDipe(id);
  return fileResponse(buf, `DIPE_${periode}.xlsx`, XLSX_TYPE);
});
