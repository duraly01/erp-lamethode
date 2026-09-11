import { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { badRequest, withApi } from "@/lib/http";
import { idParamSchema, searchParamsToObject } from "@/lib/schemas/common";
import { getPiecePourImpression } from "@/lib/services/comptabilite/pieces";
import { buildPiecePdf, nomFichierPiece } from "@/lib/exports/piece-comptable-pdf";
import { fileResponse, PDF_TYPE } from "@/lib/exports/response";
import { jourAuCameroun } from "@/lib/dates";

const querySchema = z.object({
  modele: z.enum(["facture", "comptable"]).optional(),
});

/**
 * Impression d'une pièce.
 *
 * `modele=facture` rend la facture que le contribuable remet à son client ;
 * `modele=comptable`, la fiche d'imputation du cabinet. Sans modèle, une
 * vente s'imprime en facture, un achat en fiche — la facture d'achat, c'est
 * le fournisseur qui l'a émise.
 */
export const GET = withApi(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    requirePermission(await getSessionUser(), "comptabilite", "read");
    const { id } = idParamSchema.parse(await params);
    const q = querySchema.parse(searchParamsToObject(req.url));

    const piece = await getPiecePourImpression(id, jourAuCameroun());
    const modele = q.modele ?? (piece.type === "FACTURE_VENTE" ? "facture" : "comptable");
    if (modele === "facture" && piece.type !== "FACTURE_VENTE") {
      throw badRequest("Une facture d'achat ne se réimprime pas : c'est le fournisseur qui l'a émise. Imprimez la fiche d'imputation.");
    }

    const buf = await buildPiecePdf(piece, modele);
    return fileResponse(buf, nomFichierPiece(piece, modele), PDF_TYPE, "inline");
  },
);
