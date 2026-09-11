import { z } from "zod";
import { dateString, optionalText } from "./common";
import { parseMontant } from "@/lib/comptable/money";

// ---------------------------------------------------------------------------
// Schémas de validation de la comptabilité générale
// ---------------------------------------------------------------------------

/**
 * Montant saisi sur une ligne d'écriture.
 *
 * Le format est vérifié ici, et non au moment de l'enregistrement : sans cela
 * une saisie fautive remonterait en erreur interne 500 au lieu d'un 422
 * exploitable par l'interface. La vérification s'appuie sur `parseMontant`
 * lui-même, de sorte que ce qui est accepté ici est exactement ce que le
 * moteur comptable sait lire.
 */
const montantSaisi = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .refine(
    (v) => {
      if (v === null || v === undefined || v === "") return true;
      try {
        parseMontant(v);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Montant invalide." },
  );

const idPositif = z.coerce.number().int().positive();

// ---------------------------------------------------------------------------
// Exercices
// ---------------------------------------------------------------------------

export const exerciceCreateSchema = z.object({
  contribuableId: idPositif,
  libelle: z.string().trim().min(1).max(100),
  dateDebut: dateString,
  dateFin: dateString,
  systeme: z.enum(["NORMAL", "SMT"]).default("NORMAL"),
});

export const exerciceStatutSchema = z.object({
  statut: z.enum(["OUVERT", "CLOS", "VERROUILLE"]),
});

/** Filtre des listes rattachées à un contribuable. */
export const parContribuableSchema = z.object({
  contribuableId: idPositif,
});

/** Filtre des états rattachés à un exercice entier. */
export const parExerciceSchema = z.object({
  exerciceId: idPositif,
});

// ---------------------------------------------------------------------------
// Écritures
// ---------------------------------------------------------------------------

export const ligneEcritureSchema = z.object({
  compteId: idPositif,
  tiersId: idPositif.nullable().optional(),
  libelle: optionalText(200),
  debit: montantSaisi,
  credit: montantSaisi,
  dateEcheance: dateString.nullable().optional(),
});

export const ecritureCreateSchema = z.object({
  exerciceId: idPositif,
  journalId: idPositif,
  dateEcriture: dateString,
  libelle: z.string().trim().min(1).max(300),
  reference: optionalText(120),
  documentId: idPositif.nullable().optional(),
  // Un brouillon peut être incomplet — c'est son objet. La borne haute protège
  // seulement contre une charge utile déraisonnable.
  lignes: z.array(ligneEcritureSchema).max(500).default([]),
});

export const ecritureUpdateSchema = ecritureCreateSchema.omit({
  exerciceId: true,
});

export const ecritureListQuerySchema = z.object({
  exerciceId: idPositif,
  journalId: idPositif.optional(),
});

export const contrepassationSchema = z.object({
  /** À défaut, la contre-passation est datée du jour. */
  dateContrepassation: dateString.optional(),
});

// ---------------------------------------------------------------------------
// Lettrage
// ---------------------------------------------------------------------------

export const lettrageCreateSchema = z.object({
  ligneIds: z.array(idPositif).min(2).max(500),
});

export const codeLettrageSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{1,10}$/, "Code de lettrage attendu : lettres uniquement."),
});

// ---------------------------------------------------------------------------
// Restitutions
// ---------------------------------------------------------------------------

export const balanceQuerySchema = z.object({
  exerciceId: idPositif,
  dateDebut: dateString.optional(),
  dateFin: dateString.optional(),
});

export const grandLivreQuerySchema = balanceQuerySchema.extend({
  compteId: idPositif.optional(),
});

// ---------------------------------------------------------------------------
// Tiers du contribuable
// ---------------------------------------------------------------------------

export const tiersCreateSchema = z.object({
  contribuableId: idPositif,
  code: z.string().trim().min(1).max(30),
  raisonSociale: z.string().trim().min(1).max(200),
  types: z
    .array(z.enum(["CLIENT", "FOURNISSEUR", "SALARIE", "AUTRE"]))
    .min(1)
    .default(["CLIENT"]),
  niu: optionalText(30),
  compteId: idPositif.nullable().optional(),
  telephone: optionalText(40),
  email: optionalText(200),
});

// ---------------------------------------------------------------------------
// Déclaration de TVA
// ---------------------------------------------------------------------------

/** Période mensuelle « AAAA-MM », format de la table `declarations`. */
const periodeMensuelle = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Période attendue au format « AAAA-MM ».");

export const tvaQuerySchema = z.object({
  exerciceId: idPositif,
  periode: periodeMensuelle,
});

// ---------------------------------------------------------------------------
// DSF — liquidation de l'impôt sur le résultat
// ---------------------------------------------------------------------------

/**
 * Retraitements fiscaux saisis par le comptable.
 *
 * Ils ne se déduisent d'aucune écriture — charges non déductibles, produits
 * exonérés — et sont donc reçus en entrée, en francs comme tout montant saisi.
 */
const retraitement = montantSaisi.default("0");

export const dsfQuerySchema = z.object({
  exerciceId: idPositif,
  reintegrations: retraitement,
  deductions: retraitement,
});

// ---------------------------------------------------------------------------
// Saisie assistée (E3) : pièces génératrices d'écritures
// ---------------------------------------------------------------------------

/** Un montant saisi obligatoire et strictement positif, en francs. */
const montantPositif = z.union([z.string(), z.number()]).refine(
  (v) => {
    try {
      return parseMontant(v) > 0;
    } catch {
      return false;
    }
  },
  { message: "Montant invalide ou nul." },
);

const lignePieceSchema = z.object({
  compteId: idPositif,
  libelle: optionalText(300),
  montantHt: montantPositif,
  taxeId: idPositif.nullable().optional(),
});

export const factureSchema = z.object({
  exerciceId: idPositif,
  journalId: idPositif.nullable().optional(),
  dateEcriture: dateString,
  reference: optionalText(120),
  dateEcheance: dateString.nullable().optional(),
  tiersId: idPositif,
  lignes: z.array(lignePieceSchema).min(1).max(200),
  valider: z.boolean().default(false),
});

export const reglementSchema = z.object({
  exerciceId: idPositif,
  journalId: idPositif,
  dateEcriture: dateString,
  reference: optionalText(120),
  tiersId: idPositif,
  montant: montantPositif,
  sens: z.enum(["ENCAISSEMENT", "DECAISSEMENT"]),
  valider: z.boolean().default(false),
});

export const liquidationTvaSchema = tvaQuerySchema.extend({
  valider: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Rapprochement bancaire (E3)
// ---------------------------------------------------------------------------

export const rapprochementsQuerySchema = z.object({
  exerciceId: idPositif,
  compteId: idPositif,
});

export const rapprochementCreateSchema = z.object({
  exerciceId: idPositif,
  compteId: idPositif,
  dateRapprochement: dateString,
  /** Le solde du relevé peut être négatif : un découvert se rapproche aussi. */
  soldeReleve: montantSaisi,
});

export const rapprochementUpdateSchema = z.object({
  soldeReleve: montantSaisi,
});

export const pointageSchema = z.object({
  ligneIds: z.array(idPositif).min(1).max(500),
  pointer: z.boolean(),
});
