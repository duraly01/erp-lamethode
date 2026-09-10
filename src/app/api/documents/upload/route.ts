import { NextRequest } from "next/server";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, badRequest, withApi } from "@/lib/http";
import { saveFile } from "@/lib/storage";
import { writeAudit, clientIp } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo

// Upload d'un fichier réel dans le coffre documentaire (multipart/form-data).
export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(await getSessionUser(), "documents", "create");

  if (!(req.headers.get("content-type") || "").includes("multipart/form-data")) {
    throw badRequest("Requête multipart/form-data attendue.");
  }
  const form = await req.formData();

  const file = form.get("file");
  const contribuableId = Number(form.get("contribuableId"));
  const categorie = (form.get("categorie") as string) || null;
  const tagsRaw = (form.get("tags") as string) || "";

  if (!(file instanceof File) || file.size === 0)
    throw badRequest("Fichier manquant.");
  if (!contribuableId) throw badRequest("Contribuable requis.");
  if (file.size > MAX_SIZE)
    throw badRequest("Fichier trop volumineux (10 Mo maximum).");

  const saved = await saveFile(file, contribuableId);

  const [row] = await db
    .insert(documents)
    .values({
      contribuableId,
      nomFichier: file.name,
      typeMime: saved.type,
      taille: saved.size,
      cheminStockage: saved.relPath,
      categorie,
      tags: tagsRaw
        ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      uploadedBy: user.id,
    })
    .returning();

  await writeAudit({
    userId: user.id,
    action: "UPLOAD",
    entite: "documents",
    entiteId: row.id,
    diff: { apres: { nomFichier: row.nomFichier, taille: row.taille } },
    ip: clientIp(req),
  });

  return created(row);
});
