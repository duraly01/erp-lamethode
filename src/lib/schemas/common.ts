import { z } from "zod";

// ---------------------------------------------------------------------------
// Schémas partagés (pagination, tri, recherche, identifiants)
// ---------------------------------------------------------------------------

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Paramètres de liste communs à toutes les ressources.
 * `sort`/`order` sont validés génériquement ; chaque route restreint ensuite
 * les colonnes triables autorisées.
 */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  sort: z.string().max(50).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

// ---------------------------------------------------------------------------
// Helpers de champs réutilisables
// ---------------------------------------------------------------------------

/** Booléen passé en query string ("true"/"false"). */
export const booleanParam = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

/** Date au format ISO court AAAA-MM-JJ. */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ");

/** Texte optionnel : chaîne vide -> null. */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** Parse les query params d'une URL en objet simple pour Zod. */
export function searchParamsToObject(url: string): Record<string, string> {
  const sp = new URL(url).searchParams;
  const obj: Record<string, string> = {};
  for (const [k, v] of sp.entries()) obj[k] = v;
  return obj;
}
