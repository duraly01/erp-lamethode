import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

// Racine du coffre documentaire (local en dev ; S3-compatible envisageable ensuite).
const ROOT = process.env.STORAGE_LOCAL_PATH || "./storage";

export type SavedFile = {
  relPath: string;
  size: number;
  type: string | null;
};

/** Enregistre un fichier sous storage/<contribuableId>/<uuid>-<nom>. */
export async function saveFile(
  file: File,
  contribuableId: number,
): Promise<SavedFile> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const safeName = (file.name || "fichier")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-120);
  const rel = path.posix.join(
    String(contribuableId),
    `${randomUUID()}-${safeName}`,
  );
  const abs = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, bytes);
  return { relPath: rel, size: bytes.length, type: file.type || null };
}

/** Lit un fichier du coffre (avec protection contre le path traversal). */
export async function readStoredFile(relPath: string): Promise<Buffer> {
  const root = path.resolve(ROOT);
  const resolved = path.resolve(root, relPath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Chemin de fichier invalide.");
  }
  return fs.readFile(resolved);
}
