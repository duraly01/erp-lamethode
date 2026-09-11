import "server-only";
import { buildPdfBuffer } from "@/lib/exports/pdf";
import { formatNombre, montantEnLettres } from "@/lib/facturation";
import { formatDateFR, REGIME_FISCAL_LABELS } from "@/lib/constants";
import type { RegimeFiscal } from "@/lib/constants";

/**
 * Impression d'une pièce de la comptabilité d'un contribuable.
 *
 * Deux documents pour une même pièce :
 *
 * - la **facture**, celle que le contribuable remet à son client. Elle porte
 *   son identité, pas celle du cabinet : c'est lui qui vend. Elle n'existe
 *   que pour une facture de vente — une facture d'achat, c'est le fournisseur
 *   qui l'a émise, on ne la réimprime pas ;
 * - la **fiche d'imputation**, document de travail du cabinet, qui s'agrafe à
 *   l'original dans le dossier : la pièce, ses comptes, ses taxes, et
 *   l'écriture qu'elle a produite dans les livres. Elle vaut pour les deux
 *   types.
 *
 * Montants reçus en centimes ; imprimés en francs, sans décimales.
 */

export type TypePiece = "FACTURE_VENTE" | "FACTURE_ACHAT";
export type ModeleImpression = "facture" | "comptable";

export type PiecePdf = {
  type: TypePiece;
  reference: string | null;
  datePiece: string;
  dateEcheance: string | null;
  notes: string | null;
  exercice: { libelle: string };
  contribuable: {
    nom: string;
    niu: string | null;
    adresse: string | null;
    telephone: string | null;
    email: string | null;
    centreImpots: string | null;
    regimeFiscal: RegimeFiscal;
  };
  tiers: {
    code: string;
    raisonSociale: string;
    niu: string | null;
    adresse: string | null;
    telephone: string | null;
    email: string | null;
  };
  lignes: {
    compteNumero: string;
    compteLibelle: string;
    libelle: string | null;
    montantHt: number;
    taxeLibelle: string | null;
    taux: string | null;
  }[];
  /** TVA ventilée par taxe, telle qu'elle a été comptabilisée. */
  taxes: { libelle: string; taux: string; base: number; montant: number }[];
  totalHt: number;
  totalTva: number;
  totalTtc: number;
  statutComptable: "NON_COMPTABILISEE" | "BROUILLON" | "VALIDEE" | "CONTREPASSEE";
  statutReglement: "SANS_OBJET" | "EN_ATTENTE" | "EN_RETARD" | "REGLEE";
  ecriture: {
    numeroPiece: string | null;
    journalCode: string;
    journalLibelle: string;
    dateEcriture: string;
    statut: string;
    lignes: {
      compteNumero: string;
      compteLibelle: string;
      libelle: string | null;
      debit: number;
      credit: number;
    }[];
  } | null;
};

const GREEN = "#59b233";
const INK = "#111827";
const GREY = "#6b7280";
const LIGHT = "#f4f6f9";

const PAGE_LARGEUR = 595;
const MARGE = 50;
const LARGEUR = PAGE_LARGEUR - 2 * MARGE;
const BAS = 740;

export const TYPE_PIECE_LABELS: Record<TypePiece, string> = {
  FACTURE_VENTE: "Facture de vente",
  FACTURE_ACHAT: "Facture d'achat",
};

const STATUT_COMPTABLE_LABELS: Record<PiecePdf["statutComptable"], string> = {
  NON_COMPTABILISEE: "Non comptabilisée",
  BROUILLON: "Brouillon",
  VALIDEE: "Comptabilisée",
  CONTREPASSEE: "Contre-passée",
};

const STATUT_REGLEMENT_LABELS: Record<PiecePdf["statutReglement"], string> = {
  SANS_OBJET: "—",
  EN_ATTENTE: "En attente",
  EN_RETARD: "En retard",
  REGLEE: "Réglée",
};

/** Francs entiers, séparateur de milliers en espace ordinaire (voir `formatNombre`). */
function francs(centimes: number) {
  return formatNombre(centimes / 100);
}

/** « 19.2500 » → « 19,25 % ». */
export function formatTaux(taux: string | number) {
  return `${String(Number(taux)).replace(".", ",")} %`;
}

/** « TVA collectée 19,25 % » tel quel ; « TVA » devient « TVA 19,25 % ». */
function libelleTaxe(libelle: string, taux: string | number | null) {
  if (libelle.includes("%") || taux === null) return libelle;
  return `${libelle} ${formatTaux(taux)}`;
}

/** Nom de fichier du document, sans caractère que le disque refuserait. */
export function nomFichierPiece(piece: Pick<PiecePdf, "type" | "reference">, modele: ModeleImpression) {
  const ref = (piece.reference ?? "sans-reference").replace(/[^\w.-]+/g, "_");
  const prefixe = modele === "facture" ? "Facture" : piece.type === "FACTURE_VENTE" ? "Imputation_vente" : "Imputation_achat";
  return `${prefixe}_${ref}.pdf`;
}

type Colonne = { label: string; width: number; align?: "left" | "right" };

/**
 * Tableau à colonnes alignées, avec saut de page. Les montants sont à
 * droite, les textes à gauche : `pdfTable` du module commun aligne tout à
 * gauche, ce qui ne se lit pas sur des chiffres.
 */
function tableau(
  doc: PDFKit.PDFDocument,
  colonnes: Colonne[],
  lignes: string[][],
  y: number,
  options: { enteteFond?: string } = {},
): number {
  const hauteur = 20;

  const entete = () => {
    doc.rect(MARGE, y, LARGEUR, hauteur).fill(options.enteteFond ?? GREEN);
    let x = MARGE + 6;
    doc.fillColor("#ffffff").fontSize(8.5).font("Helvetica-Bold");
    for (const c of colonnes) {
      doc.text(c.label, x, y + 6, { width: c.width - 12, height: 11, align: c.align ?? "left", ellipsis: true });
      x += c.width;
    }
    y += hauteur;
  };

  entete();
  doc.font("Helvetica").fontSize(9);
  lignes.forEach((cellules, i) => {
    if (y + hauteur > BAS) {
      doc.addPage();
      y = MARGE;
      entete();
      doc.font("Helvetica").fontSize(9);
    }
    if (i % 2 === 1) doc.rect(MARGE, y, LARGEUR, hauteur).fill(LIGHT);
    let x = MARGE + 6;
    doc.fillColor(INK);
    cellules.forEach((cellule, ci) => {
      const c = colonnes[ci];
      // Une cellule tient sur sa ligne : sans `height`, pdfkit renverrait à la
      // ligne et l'ellipse ne jouerait jamais.
      doc.text(cellule, x, y + 6, { width: c.width - 12, height: 11, align: c.align ?? "left", ellipsis: true });
      x += c.width;
    });
    y += hauteur;
  });
  return y;
}

/** Ligne de total, libellé à gauche d'une colonne de montant à droite. */
function ligneTotal(
  doc: PDFKit.PDFDocument,
  libelle: string,
  montant: string,
  y: number,
  fort = false,
): number {
  const colLibelle = MARGE + LARGEUR - 250;
  const colMontant = MARGE + LARGEUR - 120;
  if (fort) {
    doc.rect(colLibelle - 10, y - 4, 260, 24).fill(GREEN);
    doc.fillColor("#ffffff").fontSize(10.5).font("Helvetica-Bold");
  } else {
    doc.fillColor(INK).fontSize(9.5).font("Helvetica");
  }
  doc.text(libelle, colLibelle, y + 2, { width: 125, height: 12, ellipsis: true });
  doc.text(montant, colMontant, y + 2, { width: 114, align: "right" });
  return y + (fort ? 30 : 18);
}

/** Totaux HT, une ligne par taxe, TTC. Communs aux deux documents. */
function dessineTotaux(doc: PDFKit.PDFDocument, piece: PiecePdf, y: number): number {
  let curseur = y + 10;
  curseur = ligneTotal(doc, "Total hors taxes", `${francs(piece.totalHt)} FCFA`, curseur);
  for (const t of piece.taxes) {
    curseur = ligneTotal(doc, libelleTaxe(t.libelle, t.taux), `${francs(t.montant)} FCFA`, curseur);
  }
  curseur = ligneTotal(
    doc,
    piece.type === "FACTURE_VENTE" ? "NET À PAYER" : "TOTAL TTC",
    `${francs(piece.totalTtc)} FCFA`,
    curseur,
    true,
  );
  return curseur;
}

function piedDocument(doc: PDFKit.PDFDocument, mention: string) {
  const d = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  doc.page.margins.bottom = 0;
  doc.fontSize(7.5).fillColor(GREY).font("Helvetica");
  doc.text(mention, MARGE, 776, { width: LARGEUR, align: "center" });
  doc.text(`Document généré le ${d} par l'ERP LaMethode`, MARGE, 788, { width: LARGEUR, align: "center" });
}

/** Ce que la comptabilité sait de la pièce, en une ligne de pied. */
function mentionComptable(piece: PiecePdf) {
  const e = piece.ecriture;
  if (!e?.numeroPiece || piece.statutComptable === "BROUILLON") return "Pièce non encore comptabilisée.";
  if (piece.statutComptable === "CONTREPASSEE") return `Écriture ${e.numeroPiece} (journal ${e.journalCode}), contre-passée.`;
  return `Comptabilisée sous ${e.numeroPiece} (journal ${e.journalCode}).`;
}

// ---------------------------------------------------------------------------
// La facture, telle que le contribuable la remet à son client
// ---------------------------------------------------------------------------

function dessineFacture(doc: PDFKit.PDFDocument, piece: PiecePdf) {
  const c = piece.contribuable;

  // Émetteur à gauche, cartouche de la facture à droite.
  doc.fillColor(INK).fontSize(15).font("Helvetica-Bold").text(c.nom, MARGE, MARGE, { width: 300 });
  let y = doc.y + 2;
  doc.fontSize(9).font("Helvetica").fillColor(GREY);
  const identite = [
    c.adresse,
    c.niu ? `NIU : ${c.niu}` : null,
    c.centreImpots ? `Centre des impôts : ${c.centreImpots}` : null,
    `Régime : ${REGIME_FISCAL_LABELS[c.regimeFiscal]}`,
    [c.telephone ? `Tél. : ${c.telephone}` : null, c.email].filter(Boolean).join("  ·  ") || null,
  ].filter((x): x is string => !!x);
  for (const l of identite) {
    doc.text(l, MARGE, y, { width: 300 });
    y = doc.y + 1;
  }

  const xDroite = MARGE + LARGEUR - 190;
  doc.fillColor(INK).fontSize(22).font("Helvetica-Bold").text("FACTURE", xDroite, MARGE, { width: 190, align: "right" });
  doc.fontSize(10).font("Helvetica-Bold").text(`N° ${piece.reference ?? piece.ecriture?.numeroPiece ?? "—"}`, xDroite, MARGE + 30, {
    width: 190,
    align: "right",
  });
  doc.fontSize(9).font("Helvetica").fillColor(GREY);
  doc.text(`Date : ${formatDateFR(piece.datePiece)}`, xDroite, MARGE + 46, { width: 190, align: "right" });
  if (piece.dateEcheance) {
    doc.text(`Échéance : ${formatDateFR(piece.dateEcheance)}`, xDroite, MARGE + 60, { width: 190, align: "right" });
  }

  // Un tampon, pour ce que la comptabilité sait : réglée, ou pas encore dans
  // les livres. Rien si la facture attend simplement son règlement.
  if (piece.statutReglement === "REGLEE") {
    doc.rect(xDroite + 100, MARGE + 78, 90, 20).lineWidth(1.5).strokeColor(GREEN).stroke();
    doc.fillColor(GREEN).fontSize(10).font("Helvetica-Bold").text("ACQUITTÉE", xDroite + 100, MARGE + 84, { width: 90, align: "center" });
  } else if (piece.statutComptable !== "VALIDEE") {
    doc.fillColor(GREY).fontSize(8).font("Helvetica-Oblique").text("Document provisoire — non comptabilisé", xDroite, MARGE + 78, {
      width: 190,
      align: "right",
    });
  }

  y = Math.max(y, MARGE + 100) + 6;
  doc.moveTo(MARGE, y).lineTo(MARGE + LARGEUR, y).strokeColor(GREEN).lineWidth(2).stroke();
  y += 16;

  // Destinataire.
  const t = piece.tiers;
  doc.fillColor(GREY).fontSize(9).font("Helvetica").text("Facturé à :", MARGE, y);
  doc.fillColor(INK).fontSize(11).font("Helvetica-Bold").text(t.raisonSociale, MARGE + 90, y - 2, { width: LARGEUR - 90 });
  y = doc.y + 1;
  doc.fontSize(9).font("Helvetica").fillColor(INK);
  for (const l of [t.adresse, t.niu ? `NIU : ${t.niu}` : null, [t.telephone, t.email].filter(Boolean).join("  ·  ") || null]) {
    if (!l) continue;
    doc.text(l, MARGE + 90, y, { width: LARGEUR - 90 });
    y = doc.y + 1;
  }
  y += 14;

  y = tableau(
    doc,
    [
      { label: "Désignation", width: 275 },
      { label: "Montant HT (FCFA)", width: 120, align: "right" },
      { label: "TVA", width: 100, align: "right" },
    ],
    piece.lignes.map((l) => [
      l.libelle ?? l.compteLibelle,
      francs(l.montantHt),
      l.taux ? formatTaux(l.taux) : "—",
    ]),
    y,
  );

  y = dessineTotaux(doc, piece, y);

  y += 6;
  doc.fillColor(GREY).fontSize(9).font("Helvetica-Oblique");
  doc.text(`Arrêtée la présente facture à la somme de : ${montantEnLettres(piece.totalTtc / 100)}.`, MARGE, y, { width: LARGEUR });
  y = doc.y + 12;

  if (piece.dateEcheance) {
    doc.fillColor(INK).fontSize(10).font("Helvetica-Bold");
    doc.text(`Payable au plus tard le ${formatDateFR(piece.dateEcheance)}`, MARGE, y);
    y = doc.y + 10;
  }
  if (piece.notes) {
    doc.fillColor(GREY).fontSize(9).font("Helvetica").text(piece.notes, MARGE, y, { width: LARGEUR });
    y = doc.y + 10;
  }

  piedDocument(doc, mentionComptable(piece));
}

// ---------------------------------------------------------------------------
// La fiche d'imputation, document de travail du cabinet
// ---------------------------------------------------------------------------

function dessineFicheImputation(doc: PDFKit.PDFDocument, piece: PiecePdf) {
  doc.fillColor(INK).fontSize(16).font("Helvetica-Bold").text(`Fiche d'imputation — ${TYPE_PIECE_LABELS[piece.type].toLowerCase()}`, MARGE, MARGE);
  doc.fillColor(GREY).fontSize(10).font("Helvetica").text(`${piece.contribuable.nom} · ${piece.exercice.libelle}`, MARGE, MARGE + 22);
  let y = MARGE + 40;
  doc.moveTo(MARGE, y).lineTo(MARGE + LARGEUR, y).strokeColor(GREEN).lineWidth(2).stroke();
  y += 14;

  // Cartouche en deux colonnes.
  const cellules: [string, string][] = [
    [piece.type === "FACTURE_VENTE" ? "Client" : "Fournisseur", `${piece.tiers.code} — ${piece.tiers.raisonSociale}`],
    ["Référence", piece.reference ?? "—"],
    ["Date de la pièce", formatDateFR(piece.datePiece)],
    ["Échéance", piece.dateEcheance ? formatDateFR(piece.dateEcheance) : "—"],
    ["Comptabilisation", STATUT_COMPTABLE_LABELS[piece.statutComptable]],
    ["Règlement", STATUT_REGLEMENT_LABELS[piece.statutReglement]],
  ];
  const colonne = LARGEUR / 2;
  cellules.forEach(([label, valeur], i) => {
    const x = MARGE + (i % 2) * colonne;
    const yy = y + Math.floor(i / 2) * 18;
    doc.fillColor(GREY).fontSize(8.5).font("Helvetica").text(label, x, yy, { width: 95 });
    doc.fillColor(INK).fontSize(9.5).font("Helvetica-Bold").text(valeur, x + 95, yy - 1, { width: colonne - 100, height: 12, ellipsis: true });
  });
  y += Math.ceil(cellules.length / 2) * 18 + 12;

  doc.fillColor(INK).fontSize(11).font("Helvetica-Bold").text("Imputation", MARGE, y);
  y = doc.y + 6;
  y = tableau(
    doc,
    [
      { label: "Compte", width: 170 },
      { label: "Libellé", width: 125 },
      { label: "HT", width: 80, align: "right" },
      { label: "Taxe", width: 120, align: "right" },
    ],
    piece.lignes.map((l) => [
      `${l.compteNumero}  ${l.compteLibelle}`,
      l.libelle ?? "",
      francs(l.montantHt),
      l.taxeLibelle ? libelleTaxe(l.taxeLibelle, l.taux) : "—",
    ]),
    y,
  );
  y = dessineTotaux(doc, piece, y);

  if (piece.notes) {
    doc.fillColor(GREY).fontSize(9).font("Helvetica").text(`Notes : ${piece.notes}`, MARGE, y, { width: LARGEUR });
    y = doc.y + 8;
  }

  y += 8;
  if (y > BAS - 120) {
    doc.addPage();
    y = MARGE;
  }
  doc.fillColor(INK).fontSize(11).font("Helvetica-Bold").text("Écriture", MARGE, y);
  y = doc.y + 4;

  const e = piece.ecriture;
  if (!e) {
    doc.fillColor(GREY).fontSize(9.5).font("Helvetica");
    doc.text("Aucune écriture : le brouillon a été supprimé, la pièce est à recomptabiliser.", MARGE, y, { width: LARGEUR });
  } else {
    doc.fillColor(GREY).fontSize(9).font("Helvetica");
    doc.text(
      `${e.numeroPiece ?? "Sans numéro"} · journal ${e.journalCode} — ${e.journalLibelle} · ${formatDateFR(e.dateEcriture)} · ${STATUT_COMPTABLE_LABELS[piece.statutComptable]}`,
      MARGE,
      y,
      { width: LARGEUR },
    );
    y = doc.y + 6;
    const colonnes: Colonne[] = [
      { label: "Compte", width: 165 },
      { label: "Libellé", width: 190 },
      { label: "Débit", width: 70, align: "right" },
      { label: "Crédit", width: 70, align: "right" },
    ];
    y = tableau(
      doc,
      colonnes,
      e.lignes.map((l) => [
        `${l.compteNumero}  ${l.compteLibelle}`,
        l.libelle ?? "",
        l.debit ? francs(l.debit) : "",
        l.credit ? francs(l.credit) : "",
      ]),
      y,
      { enteteFond: "#1f2937" },
    );
    const debit = e.lignes.reduce((s, l) => s + l.debit, 0);
    const credit = e.lignes.reduce((s, l) => s + l.credit, 0);
    const xDebit = MARGE + colonnes[0].width + colonnes[1].width;
    doc.fillColor(INK).fontSize(9).font("Helvetica-Bold");
    doc.text(francs(debit), xDebit + 6, y + 6, { width: colonnes[2].width - 12, align: "right" });
    doc.text(francs(credit), xDebit + colonnes[2].width + 6, y + 6, { width: colonnes[3].width - 12, align: "right" });
    doc.font("Helvetica").fillColor(GREY).text("Totaux", MARGE + 6, y + 6);
  }

  piedDocument(doc, mentionComptable(piece));
}

/** Génère le PDF d'une pièce, selon le modèle demandé. */
export function buildPiecePdf(piece: PiecePdf, modele: ModeleImpression): Promise<Buffer> {
  return buildPdfBuffer((doc) => {
    if (modele === "facture") dessineFacture(doc, piece);
    else dessineFicheImputation(doc, piece);
  });
}
