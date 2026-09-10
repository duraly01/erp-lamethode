import "server-only";
import ExcelJS from "exceljs";

/** Construit un classeur Excel et le renvoie en Buffer. */
export async function buildWorkbookBuffer(
  build: (wb: ExcelJS.Workbook) => void,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP LaMethode";
  wb.created = new Date();
  build(wb);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Applique le style d'en-tête (fond vert LaMethode, texte blanc gras). */
export function styleHeaderRow(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF59B233" },
    };
    cell.alignment = { vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
  });
  row.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}
