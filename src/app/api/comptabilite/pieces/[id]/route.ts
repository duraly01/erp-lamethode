import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { getPiece } from "@/lib/services/comptabilite/pieces";
import { jourAuCameroun } from "@/lib/dates";

/** Une pièce et ses lignes. */
export const GET = withApi(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    requirePermission(await getSessionUser(), "comptabilite", "read");
    const { id } = idParamSchema.parse(await params);
    return ok(await getPiece(id, jourAuCameroun()));
  },
);
