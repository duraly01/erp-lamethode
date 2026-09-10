import { NextRequest } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { contribuables, declarations, acfSuivis } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { notFound, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import {
  buildPdfBuffer,
  pdfHeader,
  pdfFooter,
  pdfTable,
} from "@/lib/exports/pdf";
import { fileResponse, PDF_TYPE } from "@/lib/exports/response";
import {
  DECLARATION_TYPES,
  STATUT_DECLARATION_LABELS,
  STATUT_ACF_LABELS,
  REGIME_FISCAL_LABELS,
  isEnRetard,
  formatDateFR,
  type DeclarationType,
  type StatutDeclaration,
  type RegimeFiscal,
} from "@/lib/constants";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Export PDF : fiche + échéancier d'un contribuable.
export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "contribuables", "read");
  const { id } = idParamSchema.parse(await params);

  const [ctb] = await db
    .select()
    .from(contribuables)
    .where(and(eq(contribuables.id, id), isNull(contribuables.deletedAt)));
  if (!ctb) throw notFound("Contribuable introuvable.");

  const decls = await db
    .select()
    .from(declarations)
    .where(eq(declarations.contribuableId, id))
    .orderBy(desc(declarations.dateEcheance));

  const acfs = await db
    .select()
    .from(acfSuivis)
    .where(eq(acfSuivis.contribuableId, id))
    .orderBy(desc(acfSuivis.dateDemande));

  const buf = await buildPdfBuffer((doc) => {
    pdfHeader(doc, "Fiche contribuable", ctb.nom);

    // Bloc d'informations
    const info: [string, string][] = [
      ["NIU", ctb.niu ?? "—"],
      [
        "Régime fiscal",
        ctb.regimeFiscal === "IGS"
          ? `IGS — classe ${ctb.igsClasse ?? "à déterminer"}${ctb.cgaAdherent ? " (adhérent CGA)" : ""}`
          : REGIME_FISCAL_LABELS[ctb.regimeFiscal as RegimeFiscal],
      ],
      ["Centre des impôts", ctb.centreImpots ?? "—"],
      ["Secteur", ctb.secteurActivite ?? "—"],
      ["Téléphone", ctb.telephone ?? "—"],
      ["Email", ctb.email ?? "—"],
      ["Responsable", ctb.responsableDossier ?? "—"],
      ["Statut", ctb.actif ? "Actif" : "Inactif"],
    ];
    doc.moveDown(0.5);
    let y = doc.y;
    info.forEach(([label, value], i) => {
      const x = i % 2 === 0 ? 50 : 300;
      doc.fontSize(9).fillColor("#6b7280").font("Helvetica").text(label, x, y);
      doc
        .fontSize(10)
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .text(value, x, y + 12, { width: 230, ellipsis: true });
      if (i % 2 === 1) y += 34;
    });
    doc.y = y + 40;

    // Déclarations
    doc.fontSize(13).fillColor("#111827").font("Helvetica-Bold").text("Échéancier des déclarations");
    doc.moveDown(0.4);
    if (decls.length === 0) {
      doc.fontSize(10).fillColor("#6b7280").font("Helvetica").text("Aucune déclaration.");
    } else {
      pdfTable(
        doc,
        [
          { label: "Type", width: 90 },
          { label: "Période", width: 70 },
          { label: "Échéance", width: 90 },
          { label: "Statut", width: 95 },
          { label: "Montant", width: 150 },
        ],
        decls.map((d) => {
          const eff: StatutDeclaration = isEnRetard(
            d.dateEcheance,
            d.statut as StatutDeclaration,
          )
            ? "EN_RETARD"
            : (d.statut as StatutDeclaration);
          return [
            DECLARATION_TYPES[d.type as DeclarationType]?.label ?? d.type,
            d.periode,
            formatDateFR(d.dateEcheance),
            STATUT_DECLARATION_LABELS[eff],
            d.montant ? `${Number(d.montant).toLocaleString("fr-FR")} FCFA` : "—",
          ];
        }),
      );
    }

    // ACF
    doc.moveDown(1);
    doc.fontSize(13).fillColor("#111827").font("Helvetica-Bold").text("Demandes d'ACF");
    doc.moveDown(0.4);
    if (acfs.length === 0) {
      doc.fontSize(10).fillColor("#6b7280").font("Helvetica").text("Aucune demande.");
    } else {
      pdfTable(
        doc,
        [
          { label: "Objet", width: 220 },
          { label: "Demande", width: 110 },
          { label: "Statut", width: 165 },
        ],
        acfs.map((a) => [
          a.objet,
          formatDateFR(a.dateDemande),
          STATUT_ACF_LABELS[a.statut],
        ]),
      );
    }

    pdfFooter(doc);
  });

  const safe = ctb.nom.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
  return fileResponse(buf, `fiche_${safe}.pdf`, PDF_TYPE);
});
