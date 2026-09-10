import { z } from "zod";
import { listQuerySchema, dateString, optionalText } from "@/lib/schemas/common";

const categorie = z.enum([
  "HONORAIRES",
  "IMPOT_TRESOR",
  "CNPS",
  "FRAIS",
  "AUTRE",
]);

const statut = z.enum([
  "BROUILLON",
  "ENVOYEE",
  "PARTIELLE",
  "PAYEE",
  "EN_RETARD",
  "ANNULEE",
]);

const mode = z.enum(["ESPECES", "VIREMENT", "MOBILE_MONEY", "CHEQUE", "AUTRE"]);

/** Période : « 2026-01 » (mensuelle) ou « 2026 » (ponctuelle). */
const periode = z
  .string()
  .trim()
  .regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, "Période attendue : 2026-01 ou 2026.");

export const ligneSchema = z.object({
  categorie: categorie.default("HONORAIRES"),
  libelle: z.string().trim().min(1, "Libellé requis.").max(200),
  /**
   * Montant hors taxes. Le négatif est permis, et volontairement : c'est ainsi
   * qu'une remise commerciale figure sur la facture, en réduisant d'autant la
   * base soumise à TVA. Les bornes sont celles de la colonne numeric(14, 2).
   */
  montantHt: z.coerce
    .number()
    .min(-999_999_999_999, "Montant hors des limites admises.")
    .max(999_999_999_999, "Montant hors des limites admises."),
  tauxTva: z.coerce.number().min(0).max(100).optional(),
  declarationId: z.coerce.number().int().positive().optional().nullable(),
});

export const factureCreateSchema = z.object({
  contribuableId: z.coerce.number().int().positive(),
  periode,
  dateEmission: dateString,
  dateEcheance: dateString.optional(),
  objet: optionalText(300),
  notes: optionalText(2000),
  lignes: z.array(ligneSchema).default([]),
});

export const factureUpdateSchema = z
  .object({
    periode: periode.optional(),
    dateEmission: dateString.optional(),
    dateEcheance: dateString.optional(),
    objet: optionalText(300),
    notes: optionalText(2000),
    statut: statut.optional(),
    /** Remplace intégralement les lignes quand il est fourni. */
    lignes: z.array(ligneSchema).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "Aucun champ à mettre à jour.",
  });

export const factureListQuerySchema = listQuerySchema.extend({
  contribuableId: z.coerce.number().int().positive().optional(),
  statut: statut.optional(),
  periode: z.string().trim().max(7).optional(),
  /** Ne retenir que les factures non soldées (utile pour les relances). */
  impayees: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export const reglementCreateSchema = z.object({
  date: dateString,
  montant: z.coerce.number().positive("Le montant doit être supérieur à zéro."),
  mode: mode.default("VIREMENT"),
  reference: optionalText(100),
  notes: optionalText(500),
});

/** Génération en masse des brouillons du mois. */
export const generationMensuelleSchema = z.object({
  periode,
  dateEmission: dateString.optional(),
  /** Restreindre à certains contribuables ; vide = tous les actifs. */
  contribuableIds: z.array(z.coerce.number().int().positive()).optional(),
});

export type FactureCreate = z.infer<typeof factureCreateSchema>;
export type FactureUpdate = z.infer<typeof factureUpdateSchema>;
export type ReglementCreate = z.infer<typeof reglementCreateSchema>;
