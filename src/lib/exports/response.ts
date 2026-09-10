import { NextResponse } from "next/server";

export const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PDF_TYPE = "application/pdf";

/** Réponse HTTP de téléchargement de fichier. */
export function fileResponse(
  buf: Buffer,
  filename: string,
  contentType: string,
) {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Content-Length": String(buf.length),
    },
  });
}
