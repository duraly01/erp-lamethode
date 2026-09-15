import { z } from "zod";
import { dateString, optionalText } from "./common";
import { parseMontant } from "@/lib/comptable/money";

// ---------------------------------------------------------------------------
// Schémas de validation de la paie (E4)
// ---------------------------------------------------------------------------

const idPositif = z.coerce.number().int().positive();

/** Montant saisi en francs, vérifié par le même lecteur que le moteur. */
const montantSaisi = z.union([z.string(), z.number()]).refine(
  (v) => {
    try {
      return parseMontant(v) >= 0;
    } catch {
      return false;
    }
  },
  { message: "Montant invalide." },
);

const montantOptionnel = montantSaisi.optional().nullable();

export const periodeMensuelle = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Période attendue au format « AAAA-MM ».");

export const regimeCnps = z.enum(["GENERAL", "AGRICOLE", "ENSEIGNEMENT"]);
export const groupeRisque = z.enum(["A", "B", "C"]);
export const modePaiement = z.enum(["VIREMENT", "CHEQUE", "ESPECES"]);
export const avantageNature = z.enum(["LOGEMENT", "ELECTRICITE", "EAU", "DOMESTIQUE", "VEHICULE", "NOURRITURE"]);

export const rubriqueFixeSchema = z.object({
  libelle: z.string().trim().min(1).max(120),
  montant: montantSaisi,
  cotisable: z.boolean().default(true),
  imposable: z.boolean().default(true),
});

export const salarieCreateSchema = z.object({
  contribuableId: idPositif,
  matricule: z.string().trim().min(1).max(30),
  nom: z.string().trim().min(1).max(120),
  prenoms: optionalText(120),
  niu: optionalText(30),
  numeroCnps: optionalText(30),
  dateNaissance: dateString.nullable().optional(),
  dateEmbauche: dateString,
  dateSortie: dateString.nullable().optional(),
  poste: optionalText(120),
  categorie: optionalText(60),
  echelon: optionalText(30),
  salaireBase: montantSaisi,
  regimeCnps: regimeCnps.default("GENERAL"),
  groupeRisque: groupeRisque.default("A"),
  modePaiement: modePaiement.default("VIREMENT"),
  banque: optionalText(120),
  avantagesNature: z.array(avantageNature).max(6).default([]),
  actif: z.boolean().default(true),
  notes: optionalText(2000),
  rubriquesFixes: z.array(rubriqueFixeSchema).max(30).default([]),
});

export const salarieUpdateSchema = salarieCreateSchema.omit({ contribuableId: true });

export const salariesQuerySchema = z.object({
  contribuableId: idPositif,
  actifs: z.enum(["true", "false"]).optional(),
});

// ---------------------------------------------------------------------------
// Périodes et bulletins
// ---------------------------------------------------------------------------

export const periodeCreateSchema = z.object({
  contribuableId: idPositif,
  periode: periodeMensuelle,
});

export const periodesQuerySchema = z.object({
  contribuableId: idPositif,
});

/** Ce que le mois apporte au bulletin, en plus du fixe. */
export const elementsBulletinSchema = z.object({
  joursAbsence: z.coerce.number().int().min(0).max(31).default(0),
  heuresSup: montantOptionnel,
  primes: z.array(rubriqueFixeSchema).max(30).default([]),
  avances: montantOptionnel,
  autresRetenues: z.array(z.object({ libelle: z.string().trim().min(1).max(120), montant: montantSaisi })).max(20).default([]),
});

export type ElementsBulletinSaisis = z.infer<typeof elementsBulletinSchema>;

/** Règlement des salaires d'un mois sur un journal de trésorerie. */
export const reglementSalairesSchema = z.object({
  journalId: idPositif,
  dateEcriture: dateString,
  reference: optionalText(60),
  /** À défaut, les bulletins du mode de paiement du journal, non encore réglés. */
  bulletinIds: z.array(idPositif).max(500).optional(),
});

// ---------------------------------------------------------------------------
// Barème
// ---------------------------------------------------------------------------

const pourcent = z.coerce.number().min(0).max(100);
const francs = z.coerce.number().int().min(0);
const tranche = z.object({ jusqua: francs.nullable(), taux: pourcent });
const trancheForfait = z.object({ jusqua: francs.nullable(), montant: francs });

export const baremePaieSchema = z.object({
  valideDu: dateString,
  cnps: z.object({
    plafondMensuel: francs,
    pvidSalarie: pourcent,
    pvidEmployeur: pourcent,
    prestationsFamiliales: z.object({ GENERAL: pourcent, AGRICOLE: pourcent, ENSEIGNEMENT: pourcent }),
    accidentsTravail: z.object({ A: pourcent, B: pourcent, C: pourcent }),
  }),
  irpp: z.object({
    seuilExonerationMensuel: francs,
    abattementFraisPro: pourcent,
    abattementAnnuel: francs,
    tranchesAnnuelles: z.array(tranche).min(1).max(12),
    cac: pourcent,
  }),
  cfc: z.object({ salarie: pourcent, employeur: pourcent }),
  fne: z.object({ employeur: pourcent }),
  tdl: z.array(trancheForfait).max(20),
  rav: z.array(trancheForfait).max(20),
  avantagesNature: z.object({
    LOGEMENT: pourcent,
    ELECTRICITE: pourcent,
    EAU: pourcent,
    DOMESTIQUE: pourcent,
    VEHICULE: pourcent,
    NOURRITURE: pourcent,
  }),
});

export const baremePaieVersionsSchema = z.object({
  versions: z.array(baremePaieSchema).min(1).max(30),
});
