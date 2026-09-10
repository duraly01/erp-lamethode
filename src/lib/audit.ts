import "server-only";
import { db } from "@/db";
import { auditLog, type AuditDiff } from "@/db/schema";

type AuditInput = {
  userId: number | null;
  action: string; // CREATE / UPDATE / DELETE / LOGIN…
  entite: string;
  entiteId?: number | null;
  diff?: AuditDiff | null;
  ip?: string | null;
};

/** Écrit une entrée dans le journal d'audit (best-effort, ne bloque pas le flux). */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      userId: input.userId,
      action: input.action,
      entite: input.entite,
      entiteId: input.entiteId ?? null,
      diff: input.diff ?? null,
      ip: input.ip ?? null,
    });
  } catch (err) {
    console.error("[audit] échec d'écriture :", err);
  }
}

/** Extrait l'IP cliente d'une requête (derrière proxy le cas échéant). */
export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}
