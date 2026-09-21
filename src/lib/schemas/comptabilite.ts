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
  /** Postes du tiers que ce règlement solde, à lettrer avec lui. */
  lettrerAvec: z.array(idPositif).max(50).default([]),
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

export const piecesQuerySchema = z.object({
  exerciceId: idPositif,
  type: z.enum(["FACTURE_VENTE", "FACTURE_ACHAT"]).optional(),
  tiersId: idPositif.optional(),
});

// ---------------------------------------------------------------------------
// Immobilisations (E5)
// ---------------------------------------------------------------------------

export const immobilisationsQuerySchema = z.object({
  contribuableId: idPositif,
  exerciceId: idPositif.optional(),
});

export const immobilisationSchema = z
  .object({
    code: z.string().trim().min(1).max(30),
    libelle: z.string().trim().min(1).max(200),
    description: optionalText(2000),
    compteId: idPositif,
    compteAmortissementId: idPositif.nullable().optional(),
    compteDotationId: idPositif.nullable().optional(),
    dateAcquisition: dateString,
    dateMiseEnService: dateString,
    valeurOrigine: montantPositif,
    valeurResiduelle: montantSaisi,
    mode: z.enum(["LINEAIRE", "DEGRESSIF"]).default("LINEAIRE"),
    /** Durée d'utilité en mois ; absente pour un bien qui ne s'amortit pas. */
    dureeMois: z.coerce.number().int().min(1).max(1200).nullable().optional(),
    fournisseurId: idPositif.nullable().optional(),
    pieceId: idPositif.nullable().optional(),
    referenceFacture: optionalText(120),
    notes: optionalText(2000),
  })
  .refine((v) => v.dureeMois === null || v.dureeMois === undefined || (v.compteAmortissementId && v.compteDotationId), {
    message: "Un bien qui s'amortit a besoin d'un compte d'amortissement et d'un compte de dotation.",
    path: ["compteAmortissementId"],
  });

export const immobilisationCreateSchema = z.object({ contribuableId: idPositif }).and(immobilisationSchema);

export const sortieImmobilisationSchema = z.object({
  dateSortie: dateString,
  prixCession: montantSaisi,
  notes: optionalText(2000),
});

// ---------------------------------------------------------------------------
// Comptabilité analytique (E5)
// ---------------------------------------------------------------------------

export const axeCreateSchema = z.object({
  contribuableId: idPositif,
  code: z.string().trim().min(1).max(20),
  libelle: z.string().trim().min(1).max(120),
});

export const axeUpdateSchema = z.object({
  libelle: z.string().trim().min(1).max(120).optional(),
  actif: z.boolean().optional(),
});

export const sectionCreateSchema = z.object({
  code: z.string().trim().min(1).max(20),
  libelle: z.string().trim().min(1).max(120),
});

export const sectionUpdateSchema = axeUpdateSchema;

export const lignesAnalytiquesQuerySchema = z.object({
  exerciceId: idPositif,
  axeId: idPositif,
  etat: z.enum(["A_VENTILER", "TOUTES"]).optional(),
  compte: z.string().trim().max(10).optional(),
});

export const ventilationSchema = z.object({
  axeId: idPositif,
  ventilations: z.array(z.object({ sectionId: idPositif, montant: montantPositif })).max(50),
});

export const restitutionAnalytiqueQuerySchema = z.object({
  exerciceId: idPositif,
  axeId: idPositif,
});

// ---------------------------------------------------------------------------
// Budget (E6)
// ---------------------------------------------------------------------------

export const budgetCreateSchema = z.object({
  exerciceId: idPositif,
  libelle: z.string().trim().min(1).max(120),
  axeId: idPositif.nullable().optional(),
  notes: optionalText(2000),
});

export const budgetUpdateSchema = z.object({
  libelle: z.string().trim().min(1).max(120).optional(),
  notes: optionalText(2000),
});

export const budgetLignesSchema = z.object({
  lignes: z
    .array(
      z.object({
        compteId: idPositif,
        sectionId: idPositif.nullable().optional(),
        montantAnnuel: montantPositif,
        mensualisation: z.array(z.number().min(0)).min(1).max(24).nullable().optional(),
        commentaire: optionalText(500),
      }),
    )
    .max(2000),
});

export const budgetControleQuerySchema = z.object({
  jusquAu: dateString.optional(),
});

export const budgetInitialisationSchema = z.object({
  exerciceSourceId: idPositif,
  /** Coefficient en pourcentage : 100 reprend tel quel, 105 ajoute 5 %. */
  coefficientPct: z.coerce.number().min(0).max(1000).default(100),
});

// ---------------------------------------------------------------------------
// Pilotage — tableau de bord de gestion mensuel
// ---------------------------------------------------------------------------

export const pilotageQuerySchema = z.object({
  exerciceId: idPositif,
  jusquAu: dateString.optional(),
  /** Restreint au réalisé ventilé sur cette section analytique. */
  sectionId: idPositif.optional(),
  /** Budget à confronter ; à défaut, le dernier budget validé de l'exercice. */
  budgetId: idPositif.optional(),
});
