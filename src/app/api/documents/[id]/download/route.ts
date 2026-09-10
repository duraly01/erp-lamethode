import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { notFound, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { readStoredFile } from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Téléchargement d'un document du coffre (authentifié).
export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "documents", "read");
  const { id } = idParamSchema.parse(await params);

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)));

  if (!doc) throw notFound("Document introuvable.");

  let buffer: Buffer;
  try {
    buffer = await readStoredFile(doc.cheminStockage);
  } catch {
    throw notFound("Fichier absent du coffre (référence sans fichier uploadé).");
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": doc.typeMime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.nomFichier)}"`,
      "Content-Length": String(buffer.length),
    },
  });
});
