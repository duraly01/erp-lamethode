import { NextRequest } from "next/server";
import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { declarations, contribuables } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { withApi } from "@/lib/http";
import { jourAuCameroun } from "@/lib/dates";
import { buildWorkbookBuffer, styleHeaderRow } from "@/lib/exports/excel";
import { fileResponse, XLSX_TYPE } from "@/lib/exports/response";
import {
  DECLARATION_TYPES,
  STATUT_DECLARATION_LABELS,
  isEnRetard,
  formatDateFR,
  type DeclarationType,
  type StatutDeclaration,
} from "@/lib/constants";

export const runtime = "nodejs";

// Export Excel de l'échéancier des déclarations (respecte les filtres).
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "declarations", "read");
  const sp = new URL(req.url).searchParams;

  const filters: SQL[] = [];
  const type = sp.get("type");
  const statut = sp.get("statut");
  const periode = sp.get("periode");
  const contribuableId = sp.get("contribuableId");
  if (type) filters.push(eq(declarations.type, type as DeclarationType));
  if (statut)
    filters.push(eq(declarations.statut, statut as StatutDeclaration));
  if (periode) filters.push(ilike(declarations.periode, `%${periode}%`));
  if (contribuableId)
    filters.push(eq(declarations.contribuableId, Number(contribuableId)));

  const rows = await db
    .select({
      contribuableNom: contribuables.nom,
      type: declarations.type,
      periode: declarations.periode,
      dateEcheance: declarations.dateEcheance,
      statut: declarations.statut,
      montant: declarations.montant,
      datePaiement: declarations.datePaiement,
    })
    .from(declarations)
    .innerJoin(contribuables, eq(declarations.contribuableId, contribuables.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(declarations.dateEcheance));

  const buf = await buildWorkbookBuffer((wb) => {
    const ws = wb.addWorksheet("Déclarations");
    ws.columns = [
      { header: "Contribuable", key: "ctb", width: 34 },
      { header: "Type", key: "type", width: 16 },
      { header: "Période", key: "periode", width: 12 },
      { header: "Échéance", key: "echeance", width: 14 },
      { header: "Statut", key: "statut", width: 14 },
      { header: "Montant (FCFA)", key: "montant", width: 16 },
      { header: "Payé le", key: "paie", width: 14 },
    ];
    for (const r of rows) {
      const eff: StatutDeclaration = isEnRetard(
        r.dateEcheance,
        r.statut as StatutDeclaration,
      )
        ? "EN_RETARD"
        : (r.statut as StatutDeclaration);
      ws.addRow({
        ctb: r.contribuableNom,
        type: DECLARATION_TYPES[r.type as DeclarationType]?.label ?? r.type,
        periode: r.periode,
        echeance: formatDateFR(r.dateEcheance),
        statut: STATUT_DECLARATION_LABELS[eff],
        montant: r.montant ? Number(r.montant) : "",
        paie: r.datePaiement ? formatDateFR(r.datePaiement) : "",
      });
    }
    ws.getColumn("montant").numFmt = "#,##0";
    styleHeaderRow(ws);
  });

  const date = jourAuCameroun();
  return fileResponse(buf, `declarations_${date}.xlsx`, XLSX_TYPE);
});
