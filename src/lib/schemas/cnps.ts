import { z } from "zod";
import {
  listQuerySchema,
  dateString,
  optionalText,
} from "@/lib/schemas/common";

const statut = z.enum(["A_FAIRE", "DEPOSEE", "PAYEE", "EN_RETARD", "EXONERE"]);

/** Décimal optionnel : number -> string à 2 décimales (numeric Postgres). */
const decimal = z.coerce
  .number()
  .nonnegative()
  .optional()
  .nullable()
  .transform((v) => (v == null ? null : v.toFixed(2)));

export const cnpsCreateSchema = z.object({
  contribuableId: z.coerce.number().int().positive(),
  periode: z.string().trim().min(7).max(7), // "2026-01"
  masseSalariale: decimal,
  taux: decimal,
  montantEmployeur: decimal,
  montantSalarie: decimal,
  dateEcheance: dateString,
  statut: statut.default("A_FAIRE"),
  declarationId: z.coerce.number().int().positive().optional().nullable(),
  notes: optionalText(2000),
});

export const cnpsUpdateSchema = cnpsCreateSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, {
    message: "Aucun champ à mettre à jour.",
  });

export const cnpsListQuerySchema = listQuerySchema.extend({
  contribuableId: z.coerce.number().int().positive().optional(),
  statut: statut.optional(),
  periode: z.string().trim().max(7).optional(),
});
