import { NextRequest } from "next/server";
import { asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { contribuables } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { withApi } from "@/lib/http";
import { buildWorkbookBuffer, styleHeaderRow } from "@/lib/exports/excel";
import { fileResponse, XLSX_TYPE } from "@/lib/exports/response";
import { REGIME_FISCAL_LABELS_COURTS, type RegimeFiscal } from "@/lib/constants";
import { COLONNES, type CleImport } from "@/lib/import/contribuables";

export const runtime = "nodejs";

type Fiche = typeof contribuables.$inferSelect;

/** Valeur d'une colonne pour une fiche, dans la forme attendue à la relecture. */
function valeur(f: Fiche, cle: CleImport | null): string | number | null {
  if (cle === null) return f.id;
  switch (cle) {
    case "nom":
      return f.nom;
    case "niu":
      return f.niu ?? "";
    case "regimeFiscal":
      return REGIME_FISCAL_LABELS_COURTS[f.regimeFiscal as RegimeFiscal];
    case "igsClasse":
      return f.igsClasse ?? "";
    case "cgaAdherent":
      return f.cgaAdherent ? "Oui" : "Non";
    case "chiffreAffairesAnnuel":
      return f.chiffreAffairesAnnuel === null ? "" : Number(f.chiffreAffairesAnnuel);
    case "centreImpots":
      return f.centreImpots ?? "";
    case "telephone":
      return f.telephone ?? "";
    case "email":
      return f.email ?? "";
    case "responsableDossier":
      return f.responsableDossier ?? "";
    case "honoraireMensuel":
      return f.honoraireMensuel === null ? "" : Number(f.honoraireMensuel);
    case "remisePct":
      return f.remisePct === null ? "" : Number(f.remisePct);
    case "delaiPaiementJours":
      return f.delaiPaiementJours ?? "";
    case "adresseFacturation":
      return f.adresseFacturation ?? "";
    case "facturationAuto":
      return f.facturationAuto ? "Oui" : "Non";
    case "actif":
      return f.actif ? "Actif" : "Inactif";
  }
}

/**
 * Export Excel du portefeuille.
 *
 * Le classeur produit est aussi le modèle d'import : mêmes colonnes, mêmes
 * libellés, dans le même ordre. On exporte, on complète dans Excel, on
 * réimporte. La première colonne porte l'identifiant technique, qui rattache
 * chaque ligne à sa fiche — il ne faut ni la supprimer ni la modifier.
 */
export const GET = withApi(async (_req: NextRequest) => {
  requirePermission(await getSessionUser(), "contribuables", "read");

  const rows = await db
    .select()
    .from(contribuables)
    .where(isNull(contribuables.deletedAt))
    .orderBy(asc(contribuables.nom));

  const buf = await buildWorkbookBuffer((wb) => {
    const ws = wb.addWorksheet("Contribuables");
    ws.columns = COLONNES.map((c, i) => ({
      header: c.entete,
      key: `c${i}`,
      width: c.largeur,
    }));
    for (const r of rows) {
      const ligne: Record<string, string | number | null> = {};
      COLONNES.forEach((c, i) => {
        ligne[`c${i}`] = valeur(r, c.cle);
      });
      ws.addRow(ligne);
    }
    styleHeaderRow(ws);
  });

  const date = new Date().toISOString().slice(0, 10);
  return fileResponse(buf, `contribuables_${date}.xlsx`, XLSX_TYPE);
});
