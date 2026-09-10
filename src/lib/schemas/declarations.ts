import { z } from "zod";
import {
  listQuerySchema,
  dateString,
  optionalText,
} from "@/lib/schemas/common";

const declarationType = z.enum([
  "DSF",
  "SOLDE_DSF",
  "IRPP",
  "BEF",
  "BAIL",
  "PRECOMPTE_LOYER",
  "TVA",
  "ACOMPTE_IS",
  "CNPS",
  "PATENTE",
  "IGS",
  "IGS_ANNUELLE",
  "AUTRE",
]);
const periodicite = z.enum(["MENSUELLE", "TRIMESTRIELLE", "ANNUELLE"]);
const statut = z.enum(["A_FAIRE", "DEPOSEE", "PAYEE", "EN_RETARD", "EXONERE"]);

/** Montant décimal : accepté en number, stocké en string (numeric Postgres). */
const montant = z.coerce
  .number()
  .nonnegative()
  .optional()
  .nullable()
  .transform((v) => (v == null ? null : v.toFixed(2)));

export const declarationCreateSchema = z.object({
  contribuableId: z.coerce.number().int().positive(),
  type: declarationType,
  periodicite,
  periode: z.string().trim().min(4).max(7), // "2026" ou "2026-01"
  dateEcheance: dateString,
  statut: statut.default("A_FAIRE"),
  dateDepot: dateString.optional().nullable(),
  datePaiement: dateString.optional().nullable(),
  montant,
  assignedTo: z.coerce.number().int().positive().optional().nullable(),
  notes: optionalText(2000),
});

export const declarationUpdateSchema = declarationCreateSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, {
    message: "Aucun champ à mettre à jour.",
  });

export const declarationListQuerySchema = listQuerySchema.extend({
  contribuableId: z.coerce.number().int().positive().optional(),
  type: declarationType.optional(),
  statut: statut.optional(),
  periodicite: periodicite.optional(),
  periode: z.string().trim().max(7).optional(),
  assignedTo: z.coerce.number().int().positive().optional(),
});
