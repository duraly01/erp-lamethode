import "server-only";
import PDFDocument from "pdfkit";

const GREEN = "#59b233";
const INK = "#111827";
const GREY = "#6b7280";

/** Construit un PDF via pdfkit et renvoie le Buffer. */
export function buildPdfBuffer(
  build: (doc: PDFKit.PDFDocument) => void,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc);
    doc.end();
  });
}

/** En-tête de document : logo texte LaMethode + titre. */
export function pdfHeader(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  doc.fillColor(INK).fontSize(22).font("Helvetica-Bold").text("La", 50, 50, { continued: true });
  doc.fillColor(GREEN).text("M", { continued: true });
  doc.fillColor(INK).text("ethode");
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor(GREY)
    .text("Cabinet Comptable & Services — ERP Fiscal & Social", 50, 76);

  doc
    .moveTo(50, 96)
    .lineTo(545, 96)
    .strokeColor(GREEN)
    .lineWidth(2)
    .stroke();

  doc.fillColor(INK).fontSize(16).font("Helvetica-Bold").text(title, 50, 112);
  if (subtitle) {
    doc.fillColor(GREY).fontSize(10).font("Helvetica").text(subtitle, 50, 134);
  }
  doc.moveDown(2);
  doc.y = subtitle ? 156 : 142;
}

/** Pied de page avec date de génération. */
export function pdfFooter(doc: PDFKit.PDFDocument) {
  const d = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  doc
    .fontSize(8)
    .fillColor(GREY)
    .font("Helvetica")
    .text(`Document généré le ${d} par l'ERP LaMethode`, 50, 790, {
      align: "center",
      width: 495,
    });
}

/**
 * Dessine une table simple. `columns` définit largeur + libellé ; `rows` fournit
 * les cellules texte alignées sur les colonnes.
 */
export function pdfTable(
  doc: PDFKit.PDFDocument,
  columns: { label: string; width: number }[],
  rows: string[][],
) {
  const startX = 50;
  let y = doc.y;
  const rowHeight = 20;

  const drawHeader = () => {
    doc.rect(startX, y, 495, rowHeight).fill(GREEN);
    let x = startX + 6;
    doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold");
    columns.forEach((c) => {
      doc.text(c.label, x, y + 6, { width: c.width - 8, ellipsis: true });
      x += c.width;
    });
    y += rowHeight;
  };

  drawHeader();

  doc.font("Helvetica").fontSize(9);
  rows.forEach((cells, i) => {
    if (y > 760) {
      doc.addPage();
      y = 50;
      drawHeader();
      doc.font("Helvetica").fontSize(9);
    }
    if (i % 2 === 0) {
      doc.rect(startX, y, 495, rowHeight).fill("#f4f6f9");
    }
    let x = startX + 6;
    doc.fillColor(INK);
    cells.forEach((cell, ci) => {
      doc.text(cell, x, y + 6, {
        width: columns[ci].width - 8,
        ellipsis: true,
      });
      x += columns[ci].width;
    });
    y += rowHeight;
  });
  doc.y = y + 8;
}
