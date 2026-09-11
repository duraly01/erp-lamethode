import { NextResponse } from "next/server";

export const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PDF_TYPE = "application/pdf";

/**
 * Réponse HTTP de fichier. En `attachment`, le navigateur télécharge ; en
 * `inline`, il affiche — c'est ce qu'on veut d'un document à imprimer.
 */
export function fileResponse(
  buf: Buffer,
  filename: string,
  contentType: string,
  disposition: "attachment" | "inline" = "attachment",
) {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(filename)}"`,
      "Content-Length": String(buf.length),
    },
  });
}
