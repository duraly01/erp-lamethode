import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { piecesQuerySchema } from "@/lib/schemas/comptabilite";
import { listerPieces } from "@/lib/services/comptabilite/pieces";
import { jourAuCameroun } from "@/lib/dates";

/**
 * Pièces de l'exercice — factures de vente et d'achat — avec leur statut de
 * comptabilisation, lu sur l'écriture, et de règlement, lu sur le lettrage.
 */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const q = piecesQuerySchema.parse(searchParamsToObject(req.url));
  return ok(await listerPieces(q, jourAuCameroun()));
});
