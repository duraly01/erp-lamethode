import "server-only";
import { buildPdfBuffer } from "@/lib/exports/pdf";
import { formatNombre, montantEnLettres } from "@/lib/facturation";
import { formatDateFR } from "@/lib/constants";

/**
 * Bulletin de paie imprimé.
 *
 * Le document que l'employeur remet au salarié : son en-tête, l'identité du
 * salarié, le mois, puis les trois colonnes du bulletin — gains, retenues,
 * charges de l'employeur — et le net à payer en évidence. Un mois entier
 * s'imprime d'un trait, un bulletin par page.
 *
 * Montants reçus en francs (chaînes PostgreSQL), imprimés sans décimales.
 */

export type LigneBulletinPdf = {
  type: "GAIN" | "RETENUE" | "EMPLOYEUR";
  libelle: string;
  base: string | null;
  taux: string | null;
  montant: string;
  enNature: boolean;
};

export type BulletinPdf = {
  periode: string;
  employeur: { nom: string; niu: string | null; adresse: string | null; centreImpots: string | null };
  salarie: {
    matricule: string;
    nomComplet: string;
    poste: string | null;
    categorie: string | null;
    numeroCnps: string | null;
    niu: string | null;
    dateEmbauche: string | null;
    modePaiement: string;
  };
  lignes: LigneBulletinPdf[];
  totaux: {
    brut: string;
    brutCotisable: string;
    brutImposable: string;
    totalRetenues: string;
    netAPayer: string;
    chargesEmployeur: string;
  };
  elements: { joursAbsence?: number } | null;
};

const GREEN = "#59b233";
const INK = "#111827";
const GREY = "#6b7280";
const LIGHT = "#f4f6f9";
const PAGE_LARGEUR = 595;
const MARGE = 40;
const LARGEUR = PAGE_LARGEUR - 2 * MARGE;

const MODES: Record<string, string> = { VIREMENT: "Virement", CHEQUE: "Chèque", ESPECES: "Espèces" };

function francs(n: string | number) {
  return formatNombre(Number(n));
}

function taux(t: string | null) {
  return t ? `${String(Number(t)).replace(".", ",")} %` : "";
}

/** « 2026-06 » → « juin 2026 ». */
export function libelleMoisPaie(periode: string) {
  const [a, m] = periode.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

function section(doc: PDFKit.PDFDocument, titre: string, lignes: LigneBulletinPdf[], total: string, y: number, fond = GREEN): number {
  const h = 16;
  doc.rect(MARGE, y, LARGEUR, h).fill(fond);
  doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
  doc.text(titre, MARGE + 6, y + 4, { width: 240, height: 10, ellipsis: true });
  doc.text("Base", MARGE + 250, y + 4, { width: 90, align: "right" });
  doc.text("Taux", MARGE + 345, y + 4, { width: 60, align: "right" });
  doc.text("Montant", MARGE + 410, y + 4, { width: LARGEUR - 416, align: "right" });
  y += h;

  doc.font("Helvetica").fontSize(8.5);
  lignes.forEach((l, i) => {
    if (i % 2 === 1) doc.rect(MARGE, y, LARGEUR, h).fill(LIGHT);
    doc.fillColor(l.enNature ? GREY : INK);
    doc.text(l.libelle + (l.enNature ? " (non versé)" : ""), MARGE + 6, y + 4, { width: 240, height: 10, ellipsis: true });
    doc.fillColor(GREY);
    doc.text(l.base ? francs(l.base) : "", MARGE + 250, y + 4, { width: 90, align: "right" });
    doc.text(taux(l.taux), MARGE + 345, y + 4, { width: 60, align: "right" });
    doc.fillColor(l.enNature ? GREY : INK);
    doc.text(francs(l.montant), MARGE + 410, y + 4, { width: LARGEUR - 416, align: "right" });
    y += h;
  });

  doc.moveTo(MARGE, y).lineTo(MARGE + LARGEUR, y).strokeColor("#d1d5db").lineWidth(0.5).stroke();
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(8.5);
  doc.text("Total", MARGE + 6, y + 4);
  doc.text(francs(total), MARGE + 410, y + 4, { width: LARGEUR - 416, align: "right" });
  return y + h + 8;
}

function dessineBulletin(doc: PDFKit.PDFDocument, b: BulletinPdf) {
  // En-tête : employeur à gauche, titre à droite.
  doc.fillColor(INK).fontSize(13).font("Helvetica-Bold").text(b.employeur.nom, MARGE, MARGE, { width: 300 });
  let y = doc.y + 1;
  doc.fontSize(8).font("Helvetica").fillColor(GREY);
  for (const l of [b.employeur.adresse, b.employeur.niu ? `NIU : ${b.employeur.niu}` : null, b.employeur.centreImpots ? `Centre des impôts : ${b.employeur.centreImpots}` : null]) {
    if (!l) continue;
    doc.text(l, MARGE, y, { width: 300 });
    y = doc.y + 1;
  }
  doc.fillColor(INK).fontSize(16).font("Helvetica-Bold").text("BULLETIN DE PAIE", MARGE + 300, MARGE, { width: LARGEUR - 300, align: "right" });
  doc.fillColor(GREEN).fontSize(11).font("Helvetica-Bold").text(libelleMoisPaie(b.periode), MARGE + 300, MARGE + 20, { width: LARGEUR - 300, align: "right" });

  y = Math.max(y, MARGE + 40) + 8;
  doc.moveTo(MARGE, y).lineTo(MARGE + LARGEUR, y).strokeColor(GREEN).lineWidth(1.5).stroke();
  y += 10;

  // Cartouche du salarié.
  const s = b.salarie;
  const cellules: [string, string][] = [
    ["Salarié", s.nomComplet],
    ["Matricule", s.matricule],
    ["Poste", s.poste ?? "—"],
    ["Catégorie", s.categorie ?? "—"],
    ["N° CNPS", s.numeroCnps ?? "—"],
    ["NIU", s.niu ?? "—"],
    ["Embauché le", s.dateEmbauche ? formatDateFR(s.dateEmbauche) : "—"],
    ["Paiement", MODES[s.modePaiement] ?? s.modePaiement],
  ];
  const colonne = LARGEUR / 2;
  cellules.forEach(([label, valeur], i) => {
    const x = MARGE + (i % 2) * colonne;
    const yy = y + Math.floor(i / 2) * 14;
    doc.fillColor(GREY).fontSize(8).font("Helvetica").text(label, x, yy, { width: 70 });
    doc.fillColor(INK).fontSize(8.5).font("Helvetica-Bold").text(valeur, x + 70, yy - 1, { width: colonne - 76, height: 11, ellipsis: true });
  });
  y += Math.ceil(cellules.length / 2) * 14 + 10;

  y = section(doc, "Gains", b.lignes.filter((l) => l.type === "GAIN"), b.totaux.brut, y);
  y = section(doc, "Retenues", b.lignes.filter((l) => l.type === "RETENUE"), b.totaux.totalRetenues, y, "#6b7280");

  // Net à payer.
  doc.rect(MARGE, y, LARGEUR, 28).fill(GREEN);
  doc.fillColor("#ffffff").fontSize(11).font("Helvetica-Bold");
  doc.text("NET À PAYER", MARGE + 8, y + 9);
  doc.text(`${francs(b.totaux.netAPayer)} FCFA`, MARGE + 300, y + 9, { width: LARGEUR - 308, align: "right" });
  y += 32;
  doc.fillColor(GREY).fontSize(8).font("Helvetica-Oblique");
  doc.text(`Arrêté le présent bulletin à la somme de ${montantEnLettres(Number(b.totaux.netAPayer))}.`, MARGE, y, { width: LARGEUR });
  y = doc.y + 10;

  y = section(doc, "Charges de l'employeur", b.lignes.filter((l) => l.type === "EMPLOYEUR"), b.totaux.chargesEmployeur, y, "#1f2937");

  doc.fillColor(GREY).fontSize(8).font("Helvetica");
  doc.text(
    `Brut cotisable : ${francs(b.totaux.brutCotisable)}   ·   Brut imposable : ${francs(b.totaux.brutImposable)}   ·   Coût total employeur : ${francs(Number(b.totaux.brut) + Number(b.totaux.chargesEmployeur))}`,
    MARGE,
    y,
    { width: LARGEUR },
  );

  doc.page.margins.bottom = 0;
  doc.fontSize(7.5).fillColor(GREY);
  doc.text("Bulletin à conserver sans limitation de durée. Document généré par l'ERP LaMethode.", MARGE, 800, { width: LARGEUR, align: "center" });
}

/** Un PDF, un bulletin par page. */
export function buildBulletinsPdf(bulletins: BulletinPdf[]): Promise<Buffer> {
  return buildPdfBuffer((doc) => {
    bulletins.forEach((b, i) => {
      if (i > 0) doc.addPage();
      dessineBulletin(doc, b);
    });
  });
}
