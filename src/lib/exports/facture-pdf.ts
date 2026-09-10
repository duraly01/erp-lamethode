import "server-only";
import { buildPdfBuffer } from "@/lib/exports/pdf";
import {
  ENTETE_HAUTEUR_PX,
  ENTETE_JPEG_BASE64,
  ENTETE_LARGEUR_PX,
} from "@/lib/exports/assets/entete";
import {
  CATEGORIE_LIGNE_LABELS,
  formatFcfa,
  formatNombre,
  objetParDefaut,
  montantEnLettres,
  IDENTITE_CABINET_DEFAUT,
  type CategorieLigne,
  type IdentiteCabinet,
} from "@/lib/facturation";
import { formatDateFR } from "@/lib/constants";

// Réexportés pour que les appelants n'aient qu'un seul point d'entrée PDF.
export { IDENTITE_CABINET_DEFAUT };
export type { IdentiteCabinet };

const GREEN = "#59b233";
const INK = "#111827";
const GREY = "#6b7280";
const ARDOISE = "#1f2937";

export type LigneFacture = {
  categorie: CategorieLigne;
  libelle: string;
  montantHt: string | number;
  tauxTva: string | number;
};

export type FacturePdf = {
  numero: string;
  contribuableNom: string;
  contribuableNiu: string | null;
  /** Adresse de facturation propre au client, si elle a été renseignée. */
  contribuableAdresse?: string | null;
  periode: string;
  objet: string | null;
  dateEmission: string;
  dateEcheance: string;
  totalHt: string | number;
  totalTva: string | number;
  totalTtc: string | number;
  lignes: LigneFacture[];
};

const PAGE_LARGEUR = 595;
const MARGE = 50;
const CONTENU_LARGEUR = PAGE_LARGEUR - 2 * MARGE;

/** Bandeau d'en-tête : image du papier entête, à la largeur de la page. */
function dessineEntete(doc: PDFKit.PDFDocument): number {
  const largeur = PAGE_LARGEUR - 4;
  const hauteur = (ENTETE_HAUTEUR_PX / ENTETE_LARGEUR_PX) * largeur;
  doc.image(Buffer.from(ENTETE_JPEG_BASE64, "base64"), 2, 12, {
    width: largeur,
  });
  return 12 + hauteur;
}

/**
 * Pied de page redessiné.
 *
 * Le bandeau de pied du papier entête fourni imprime un NIU et un RCCM qui ne
 * sont pas ceux du cabinet ; il n'est donc pas repris. Les mentions légales
 * proviennent du paramètre `cabinet_identite`.
 */
export function pdfPiedCabinet(
  doc: PDFKit.PDFDocument,
  identite: IdentiteCabinet,
) {
  const y = 762;
  // Le bandeau descend sous la marge basse : sans neutraliser celle-ci, pdfkit
  // considère le texte comme débordant et ajoute une page vierge.
  doc.page.margins.bottom = 0;
  doc.rect(0, y, PAGE_LARGEUR, 80).fill(ARDOISE);
  doc.rect(0, y, PAGE_LARGEUR, 3).fill(GREEN);

  doc.fillColor("#ffffff").fontSize(7.5).font("Helvetica");
  doc.text(
    `${identite.adresse}  |  Tél. : ${identite.telephone}  |  ${identite.email}  |  ${identite.siteWeb}`,
    MARGE,
    y + 16,
    { width: CONTENU_LARGEUR, align: "center" },
  );
  doc.fillColor("#cbd5e1").fontSize(7.5);
  doc.text(
    `NIU : ${identite.niu}  |  RCCM : ${identite.rccm}`,
    MARGE,
    y + 32,
    { width: CONTENU_LARGEUR, align: "center" },
  );
}

/** Bloc « À l'attention de » + période, repris du modèle du cabinet. */
function dessineDestinataire(
  doc: PDFKit.PDFDocument,
  facture: FacturePdf,
  identite: IdentiteCabinet,
  y: number,
): number {
  doc
    .fillColor(INK)
    .fontSize(10)
    .font("Helvetica")
    .text(
      `${identite.ville}, le ${formatDateFR(facture.dateEmission)}`,
      MARGE,
      y,
      { width: CONTENU_LARGEUR, align: "right" },
    );

  let curseur = y + 34;

  doc.fontSize(11).font("Helvetica-Bold").fillColor(INK);
  doc.text(`FACTURE N° ${facture.numero}`, MARGE, curseur);
  curseur += 24;

  doc.fontSize(9.5).font("Helvetica").fillColor(GREY);
  doc.text("À l'attention de :", MARGE, curseur);
  doc.fontSize(11).font("Helvetica-Bold").fillColor(INK);
  doc.text(facture.contribuableNom, MARGE + 110, curseur - 2);
  curseur += 16;
  if (facture.contribuableNiu) {
    doc.fontSize(9.5).font("Helvetica").fillColor(INK);
    doc.text(`NIU : ${facture.contribuableNiu}`, MARGE + 110, curseur);
    curseur += 16;
  }
  if (facture.contribuableAdresse) {
    doc.fontSize(9.5).font("Helvetica").fillColor(INK);
    doc.text(facture.contribuableAdresse, MARGE + 110, curseur, {
      width: CONTENU_LARGEUR - 110,
    });
    curseur += 16;
  }

  curseur += 8;
  doc.fontSize(9.5).font("Helvetica").fillColor(GREY);
  doc.text("Objet :", MARGE, curseur);
  doc.fontSize(10).font("Helvetica-Bold").fillColor(INK);
  doc.text(
    facture.objet ?? objetParDefaut(facture.periode),
    MARGE + 110,
    curseur - 1,
    { width: CONTENU_LARGEUR - 110 },
  );

  return curseur + 30;
}

/** Tableau des lignes, groupées par nature comme sur le modèle papier. */
function dessineLignes(
  doc: PDFKit.PDFDocument,
  facture: FacturePdf,
  y: number,
): number {
  const colMontant = MARGE + CONTENU_LARGEUR - 110;
  let curseur = y;

  doc.rect(MARGE, curseur, CONTENU_LARGEUR, 22).fill(GREEN);
  doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold");
  doc.text("Désignation", MARGE + 8, curseur + 7);
  doc.text("Montant (FCFA)", colMontant, curseur + 7, {
    width: 102,
    align: "right",
  });
  curseur += 22;

  const ordre: CategorieLigne[] = [
    "IMPOT_TRESOR",
    "CNPS",
    "FRAIS",
    "HONORAIRES",
    "AUTRE",
  ];
  const parCategorie = ordre
    .map((c) => ({
      categorie: c,
      lignes: facture.lignes.filter((l) => l.categorie === c),
    }))
    .filter((g) => g.lignes.length > 0);

  let impaire = false;
  for (const groupe of parCategorie) {
    doc.rect(MARGE, curseur, CONTENU_LARGEUR, 18).fill("#eef2f6");
    doc.fillColor(GREY).fontSize(8).font("Helvetica-Bold");
    doc.text(
      CATEGORIE_LIGNE_LABELS[groupe.categorie].toUpperCase(),
      MARGE + 8,
      curseur + 5,
    );
    curseur += 18;

    for (const ligne of groupe.lignes) {
      if (impaire) doc.rect(MARGE, curseur, CONTENU_LARGEUR, 20).fill("#f8fafc");
      impaire = !impaire;
      doc.fillColor(INK).fontSize(9.5).font("Helvetica");
      doc.text(ligne.libelle, MARGE + 8, curseur + 6, {
        width: colMontant - MARGE - 20,
        ellipsis: true,
      });
      doc.text(
        formatNombre(Number(ligne.montantHt)),
        colMontant,
        curseur + 6,
        { width: 102, align: "right" },
      );
      curseur += 20;
    }
  }

  return curseur;
}

/** Totaux HT / TVA / TTC puis le montant en toutes lettres. */
function dessineTotaux(
  doc: PDFKit.PDFDocument,
  facture: FacturePdf,
  y: number,
): number {
  const colLibelle = MARGE + CONTENU_LARGEUR - 240;
  const colMontant = MARGE + CONTENU_LARGEUR - 110;
  let curseur = y + 10;

  const totalTva = Number(facture.totalTva);
  const lignes: [string, string, boolean][] = [
    ["Total hors taxes", formatFcfa(facture.totalHt), false],
  ];
  if (totalTva > 0) {
    lignes.push(["TVA (19,25 %)", formatFcfa(totalTva), false]);
  }
  lignes.push(["NET À PAYER", formatFcfa(facture.totalTtc), true]);

  for (const [libelle, montant, fort] of lignes) {
    if (fort) {
      doc.rect(colLibelle - 10, curseur - 4, 250, 24).fill(GREEN);
      doc.fillColor("#ffffff").fontSize(10.5).font("Helvetica-Bold");
    } else {
      doc.fillColor(INK).fontSize(9.5).font("Helvetica");
    }
    doc.text(libelle, colLibelle, curseur + 2);
    doc.text(montant, colMontant, curseur + 2, { width: 102, align: "right" });
    curseur += fort ? 30 : 18;
  }

  curseur += 8;
  doc.fillColor(GREY).fontSize(9).font("Helvetica-Oblique");
  doc.text(
    `Arrêtée la présente facture à la somme de : ${montantEnLettres(Number(facture.totalTtc))}.`,
    MARGE,
    curseur,
    { width: CONTENU_LARGEUR },
  );
  curseur += 28;

  doc.fillColor(INK).fontSize(10).font("Helvetica-Bold");
  doc.text(
    `Payable au plus tard le ${formatDateFR(facture.dateEcheance)}`,
    MARGE,
    curseur,
  );

  return curseur + 30;
}

/** Génère le PDF d'une facture sur le papier entête du cabinet. */
export function buildFacturePdf(
  facture: FacturePdf,
  identite: IdentiteCabinet = IDENTITE_CABINET_DEFAUT,
): Promise<Buffer> {
  return buildPdfBuffer((doc) => {
    let y = dessineEntete(doc);
    y = dessineDestinataire(doc, facture, identite, y + 24);
    y = dessineLignes(doc, facture, y);
    y = dessineTotaux(doc, facture, y);

    doc.fillColor(INK).fontSize(10).font("Helvetica-Bold");
    doc.text("Le Cabinet", MARGE, Math.min(y + 20, 690), {
      width: CONTENU_LARGEUR,
      align: "right",
    });

    pdfPiedCabinet(doc, identite);
  });
}
