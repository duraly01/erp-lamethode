import { z } from "zod";
import {
  listQuerySchema,
  booleanParam,
  dateString,
  optionalText,
} from "@/lib/schemas/common";

import { IGS_NB_CLASSES } from "@/lib/igs";

const regimeFiscal = z.enum(["REEL", "IGS"]);

/** Classe IGS : entier 1..10, vide accepté (contribuable au Réel). */
const igsClasse = z.coerce
  .number()
  .int()
  .min(1, `La classe IGS doit être comprise entre 1 et ${IGS_NB_CLASSES}.`)
  .max(IGS_NB_CLASSES, `La classe IGS doit être comprise entre 1 et ${IGS_NB_CLASSES}.`)
  .optional()
  .nullable();

/** Montant décimal positif transmis en chaîne à Postgres (numeric). */
const montant = z
  .union([z.coerce.number().nonnegative(), z.literal("")])
  .optional()
  .nullable()
  .transform((v) => (v === "" || v == null ? null : String(v)));

/** Remise en pourcentage des honoraires : 0 à 100, vide accepté. */
const pourcentage = z
  .union([
    z.coerce
      .number()
      .min(0, "La remise ne peut pas être négative.")
      .max(100, "La remise ne peut pas dépasser 100 %."),
    z.literal(""),
  ])
  .optional()
  .nullable()
  .transform((v) => (v === "" || v == null ? null : String(v)));

/** Entier strictement positif, vide accepté (délai de paiement en jours). */
const entierPositif = z
  .union([z.coerce.number().int().positive(), z.literal("")])
  .optional()
  .nullable()
  .transform((v) => (v === "" || v == null ? null : Number(v)));

const nullableEmail = z
  .string()
  .trim()
  .max(255)
  .email("Email invalide")
  .or(z.literal(""))
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const contribuableCreateSchema = z.object({
  nom: z.string().trim().min(1, "Le nom est requis.").max(200),
  niu: optionalText(30),
  centreImpots: optionalText(200),
  regimeFiscal: regimeFiscal.default("REEL"),
  igsClasse,
  cgaAdherent: z.boolean().default(false),
  chiffreAffairesAnnuel: montant,
  honoraireMensuel: montant,
  remisePct: pourcentage,
  delaiPaiementJours: entierPositif,
  adresseFacturation: optionalText(500),
  facturationAuto: z.boolean().default(false),
  secteurActivite: optionalText(200),
  telephone: optionalText(50),
  email: nullableEmail,
  responsableId: z.coerce.number().int().positive().optional().nullable(),
  responsableDossier: optionalText(200),
  dateDebutMission: dateString.optional().nullable(),
  actif: z.boolean().default(true),
  notes: optionalText(2000),
});

export const contribuableUpdateSchema = contribuableCreateSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, {
    message: "Aucun champ à mettre à jour.",
  });

export const contribuableListQuerySchema = listQuerySchema.extend({
  regimeFiscal: regimeFiscal.optional(),
  actif: booleanParam.optional(),
  responsableId: z.coerce.number().int().positive().optional(),
});

export type ContribuableCreate = z.infer<typeof contribuableCreateSchema>;
export type ContribuableUpdate = z.infer<typeof contribuableUpdateSchema>;

/**
 * Cohérence régime / classe : la classe IGS n'a de sens qu'au régime IGS.
 * Appelé côté serveur avec le régime effectif après application du patch, pour
 * qu'un basculement IGS → Réel efface la classe devenue caduque.
 */
export function normaliseClasseIgs<
  T extends { igsClasse?: number | null | undefined },
>(values: T, regimeEffectif: "REEL" | "IGS"): T {
  return regimeEffectif === "REEL" ? { ...values, igsClasse: null } : values;
}
