// ---------------------------------------------------------------------------
// Calcul d'un bulletin de paie — module pur (E4).
//
// Un bulletin, c'est trois colonnes : ce que le salarié gagne, ce qu'on lui
// retient, ce que l'employeur supporte en plus. Le moteur les remplit à
// partir de ce que le mois a apporté — salaire de base, absences, heures
// supplémentaires, primes, avantages en nature, acomptes — et du barème en
// vigueur. Il ne connaît aucun taux : tout vient du barème reçu.
//
// Trois bases se distinguent, et c'est là que les erreurs se font :
//
// - le **brut en espèces** : ce qui est réellement versé avant retenues ;
// - le **brut cotisable** : ce sur quoi la CNPS s'assied, plafonné ;
// - le **brut imposable** : ce sur quoi l'IRPP, le CFC, le FNE et la RAV
//   s'assoient — avantages en nature compris, primes exonérées exclues.
//
// Les avantages en nature entrent dans les deux dernières bases sans être
// versés : ils gonflent l'impôt, pas le net.
//
// Montants en centimes entiers ; chaque ligne calculée est arrondie au
// franc, comme sur un bulletin.
// ---------------------------------------------------------------------------

import { appliquerTaux, sommeMontants } from "@/lib/comptable/money";
import {
  AVANTAGE_NATURE_LABELS,
  type AvantageNature,
  type BaremePaie,
  type GroupeRisque,
  type RegimeCnps,
  type Tranche,
  type TrancheForfait,
} from "./bareme";

export type TypeLigne = "GAIN" | "RETENUE" | "EMPLOYEUR";

export type CodeRubrique =
  | "SALAIRE_BASE"
  | "ABSENCE"
  | "HEURES_SUP"
  | "PRIME"
  | "AVANTAGE_NATURE"
  | "PVID_SALARIE"
  | "IRPP"
  | "CAC"
  | "CFC_SALARIE"
  | "TDL"
  | "RAV"
  | "AVANCE"
  | "AUTRE_RETENUE"
  | "PVID_EMPLOYEUR"
  | "PRESTATIONS_FAMILIALES"
  | "ACCIDENTS_TRAVAIL"
  | "CFC_EMPLOYEUR"
  | "FNE";

export type LigneBulletin = {
  type: TypeLigne;
  code: CodeRubrique;
  libelle: string;
  /** Base de calcul, en centimes, quand la ligne en a une. */
  base?: number;
  /** Taux appliqué, en pourcentage, quand la ligne en a un. */
  taux?: number;
  /** Montant en centimes. Négatif pour une absence : c'est un gain en moins. */
  montant: number;
  /** Vrai pour un avantage en nature : compté dans les bases, jamais versé. */
  enNature?: boolean;
  cotisable?: boolean;
  imposable?: boolean;
};

/** Une prime ou indemnité, fixe ou du mois. */
export type Rubrique = {
  libelle: string;
  montant: number;
  cotisable: boolean;
  imposable: boolean;
};

export type ElementsBulletin = {
  salaireBase: number;
  regimeCnps: RegimeCnps;
  groupeRisque: GroupeRisque;
  /** Jours du mois de paie, 30 par convention. */
  joursPeriode?: number;
  joursAbsence?: number;
  /** Heures supplémentaires : leur montant, calculé par le comptable. */
  heuresSup?: number;
  rubriques?: Rubrique[];
  avantagesNature?: AvantageNature[];
  /** Acomptes déjà versés dans le mois. */
  avances?: number;
  autresRetenues?: { libelle: string; montant: number }[];
};

export type TotauxBulletin = {
  brut: number;
  brutCotisable: number;
  brutImposable: number;
  avantagesNature: number;
  cnpsSalarie: number;
  irpp: number;
  cac: number;
  cfcSalarie: number;
  tdl: number;
  rav: number;
  avances: number;
  autresRetenues: number;
  totalRetenues: number;
  netAPayer: number;
  pvidEmployeur: number;
  prestationsFamiliales: number;
  accidentsTravail: number;
  cfcEmployeur: number;
  fne: number;
  chargesEmployeur: number;
  coutTotal: number;
};

export type Bulletin = { lignes: LigneBulletin[]; totaux: TotauxBulletin };

export class PaieInvalideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaieInvalideError";
  }
}

const JOURS_PERIODE = 30;

/** Arrondit au franc : les centimes n'existent pas sur un bulletin. */
export function auFranc(centimes: number): number {
  return Math.round(centimes / 100) * 100;
}

const francs = (n: number) => n * 100;

/** Taux en pourcentage appliqué à une base en centimes, arrondi au franc. */
function taux(base: number, pourcent: number): number {
  return auFranc(appliquerTaux(base, pourcent));
}

/** Montant forfaitaire de la tranche où tombe une base (base en centimes, tranches en francs). */
export function forfaitParTranche(tranches: TrancheForfait[], base: number): number {
  for (const t of tranches) {
    if (t.jusqua === null || base <= francs(t.jusqua)) return francs(t.montant);
  }
  return 0;
}

/** Impôt progressif : chaque tranche taxe ce qui la traverse (base en centimes, tranches en francs). */
export function impotProgressif(tranches: Tranche[], base: number): number {
  let impot = 0;
  let plancher = 0;
  for (const t of tranches) {
    if (base <= plancher) break;
    const plafond = t.jusqua === null ? base : Math.min(base, francs(t.jusqua));
    impot += appliquerTaux(plafond - plancher, t.taux);
    plancher = plafond;
  }
  return impot;
}

/**
 * IRPP mensuel sur salaire.
 *
 * Le brut imposable est abattu des frais professionnels puis de la cotisation
 * de pension, ce qui donne le revenu net. Annualisé et abattu du forfait, il
 * traverse les tranches ; le douzième est l'impôt du mois. En dessous du
 * seuil d'exonération, rien n'est dû — et le seuil se lit sur le brut, pas
 * sur le net.
 */
export function calculerIrpp(
  brutImposable: number,
  pvidSalarie: number,
  bareme: BaremePaie["irpp"],
): { irpp: number; revenuNetAnnuel: number } {
  if (brutImposable <= francs(bareme.seuilExonerationMensuel)) return { irpp: 0, revenuNetAnnuel: 0 };
  const netMensuel = brutImposable - appliquerTaux(brutImposable, bareme.abattementFraisPro) - pvidSalarie;
  const revenuNetAnnuel = Math.max(0, netMensuel * 12 - francs(bareme.abattementAnnuel));
  const annuel = impotProgressif(bareme.tranchesAnnuelles, revenuNetAnnuel);
  return { irpp: auFranc(annuel / 12), revenuNetAnnuel };
}

function verifier(e: ElementsBulletin) {
  const joursPeriode = e.joursPeriode ?? JOURS_PERIODE;
  const joursAbsence = e.joursAbsence ?? 0;
  if (!Number.isSafeInteger(e.salaireBase) || e.salaireBase < 0) {
    throw new PaieInvalideError("Le salaire de base doit être un montant positif.");
  }
  if (joursAbsence < 0 || joursAbsence > joursPeriode) {
    throw new PaieInvalideError(`Les jours d'absence doivent être compris entre 0 et ${joursPeriode}.`);
  }
  for (const r of e.rubriques ?? []) {
    if (!Number.isSafeInteger(r.montant) || r.montant < 0) {
      throw new PaieInvalideError(`La rubrique « ${r.libelle} » doit avoir un montant positif.`);
    }
  }
  if ((e.avances ?? 0) < 0) throw new PaieInvalideError("Un acompte ne peut pas être négatif.");
  if ((e.heuresSup ?? 0) < 0) throw new PaieInvalideError("Les heures supplémentaires ne peuvent pas être négatives.");
}

/** Calcule un bulletin à partir des éléments du mois et du barème en vigueur. */
export function calculerBulletin(e: ElementsBulletin, bareme: BaremePaie): Bulletin {
  verifier(e);
  const joursPeriode = e.joursPeriode ?? JOURS_PERIODE;
  const joursAbsence = e.joursAbsence ?? 0;
  const lignes: LigneBulletin[] = [];

  // --- Gains -----------------------------------------------------------------
  lignes.push({ type: "GAIN", code: "SALAIRE_BASE", libelle: "Salaire de base", montant: e.salaireBase, cotisable: true, imposable: true });

  // L'absence se retient sur le salaire de base au prorata des jours, et
  // seulement sur lui : une prime fixe ne se proratise pas.
  const absence = joursAbsence > 0 ? auFranc(Math.round((e.salaireBase * joursAbsence) / joursPeriode)) : 0;
  if (absence > 0) {
    lignes.push({
      type: "GAIN",
      code: "ABSENCE",
      libelle: `Absences (${joursAbsence} jour${joursAbsence > 1 ? "s" : ""})`,
      base: e.salaireBase,
      montant: -absence,
      cotisable: true,
      imposable: true,
    });
  }
  if (e.heuresSup) {
    lignes.push({ type: "GAIN", code: "HEURES_SUP", libelle: "Heures supplémentaires", montant: e.heuresSup, cotisable: true, imposable: true });
  }
  for (const r of e.rubriques ?? []) {
    if (r.montant === 0) continue;
    lignes.push({ type: "GAIN", code: "PRIME", libelle: r.libelle, montant: r.montant, cotisable: r.cotisable, imposable: r.imposable });
  }

  const gainsEspeces = lignes.filter((l) => l.type === "GAIN");
  const brut = sommeMontants(gainsEspeces.map((l) => l.montant));
  const cotisableEspeces = sommeMontants(gainsEspeces.filter((l) => l.cotisable).map((l) => l.montant));
  const imposableEspeces = sommeMontants(gainsEspeces.filter((l) => l.imposable).map((l) => l.montant));

  // Les avantages en nature s'évaluent en pourcentage du brut imposable en
  // espèces. Ils entrent dans les bases, pas dans le net.
  for (const a of e.avantagesNature ?? []) {
    const montant = taux(imposableEspeces, bareme.avantagesNature[a]);
    if (montant === 0) continue;
    lignes.push({
      type: "GAIN",
      code: "AVANTAGE_NATURE",
      libelle: `Avantage en nature — ${AVANTAGE_NATURE_LABELS[a].toLowerCase()}`,
      base: imposableEspeces,
      taux: bareme.avantagesNature[a],
      montant,
      enNature: true,
      cotisable: true,
      imposable: true,
    });
  }
  const avantagesNature = sommeMontants(lignes.filter((l) => l.enNature).map((l) => l.montant));
  const brutCotisable = cotisableEspeces + avantagesNature;
  const brutImposable = imposableEspeces + avantagesNature;
  const cotisablePlafonne = Math.min(brutCotisable, francs(bareme.cnps.plafondMensuel));

  // --- Retenues --------------------------------------------------------------
  const cnpsSalarie = taux(cotisablePlafonne, bareme.cnps.pvidSalarie);
  lignes.push({ type: "RETENUE", code: "PVID_SALARIE", libelle: "CNPS — pension vieillesse (part salariale)", base: cotisablePlafonne, taux: bareme.cnps.pvidSalarie, montant: cnpsSalarie });

  const { irpp } = calculerIrpp(brutImposable, cnpsSalarie, bareme.irpp);
  lignes.push({ type: "RETENUE", code: "IRPP", libelle: "IRPP", base: brutImposable, montant: irpp });
  const cac = taux(irpp, bareme.irpp.cac);
  lignes.push({ type: "RETENUE", code: "CAC", libelle: "Centimes additionnels communaux", base: irpp, taux: bareme.irpp.cac, montant: cac });

  const cfcSalarie = taux(brutImposable, bareme.cfc.salarie);
  lignes.push({ type: "RETENUE", code: "CFC_SALARIE", libelle: "Crédit foncier (part salariale)", base: brutImposable, taux: bareme.cfc.salarie, montant: cfcSalarie });

  // La TDL se lit sur le salaire de base, entier, pas sur ce qu'il en reste
  // après absences : c'est une taxe de catégorie, pas de rémunération.
  const tdl = forfaitParTranche(bareme.tdl, e.salaireBase);
  lignes.push({ type: "RETENUE", code: "TDL", libelle: "Taxe de développement local", base: e.salaireBase, montant: tdl });

  const rav = forfaitParTranche(bareme.rav, brutImposable);
  if (bareme.rav.length > 0) {
    lignes.push({ type: "RETENUE", code: "RAV", libelle: "Redevance audiovisuelle", base: brutImposable, montant: rav });
  }

  const avances = e.avances ?? 0;
  if (avances > 0) lignes.push({ type: "RETENUE", code: "AVANCE", libelle: "Acomptes versés", montant: avances });
  for (const r of e.autresRetenues ?? []) {
    if (r.montant === 0) continue;
    lignes.push({ type: "RETENUE", code: "AUTRE_RETENUE", libelle: r.libelle, montant: r.montant });
  }
  const autresRetenues = sommeMontants((e.autresRetenues ?? []).map((r) => r.montant));

  const totalRetenues = sommeMontants(lignes.filter((l) => l.type === "RETENUE").map((l) => l.montant));
  const netAPayer = brut - totalRetenues;
  if (netAPayer < 0) {
    throw new PaieInvalideError("Les retenues dépassent le brut : le net à payer serait négatif.");
  }

  // --- Charges de l'employeur --------------------------------------------------
  const pvidEmployeur = taux(cotisablePlafonne, bareme.cnps.pvidEmployeur);
  const tauxPf = bareme.cnps.prestationsFamiliales[e.regimeCnps];
  const prestationsFamiliales = taux(cotisablePlafonne, tauxPf);
  const tauxAt = bareme.cnps.accidentsTravail[e.groupeRisque];
  const accidentsTravail = taux(cotisablePlafonne, tauxAt);
  const cfcEmployeur = taux(brutImposable, bareme.cfc.employeur);
  const fne = taux(brutImposable, bareme.fne.employeur);
  lignes.push(
    { type: "EMPLOYEUR", code: "PVID_EMPLOYEUR", libelle: "CNPS — pension vieillesse (part patronale)", base: cotisablePlafonne, taux: bareme.cnps.pvidEmployeur, montant: pvidEmployeur },
    { type: "EMPLOYEUR", code: "PRESTATIONS_FAMILIALES", libelle: "CNPS — prestations familiales", base: cotisablePlafonne, taux: tauxPf, montant: prestationsFamiliales },
    { type: "EMPLOYEUR", code: "ACCIDENTS_TRAVAIL", libelle: "CNPS — accidents du travail", base: cotisablePlafonne, taux: tauxAt, montant: accidentsTravail },
    { type: "EMPLOYEUR", code: "CFC_EMPLOYEUR", libelle: "Crédit foncier (part patronale)", base: brutImposable, taux: bareme.cfc.employeur, montant: cfcEmployeur },
    { type: "EMPLOYEUR", code: "FNE", libelle: "Fonds national de l'emploi", base: brutImposable, taux: bareme.fne.employeur, montant: fne },
  );
  const chargesEmployeur = sommeMontants(lignes.filter((l) => l.type === "EMPLOYEUR").map((l) => l.montant));

  return {
    lignes,
    totaux: {
      brut,
      brutCotisable,
      brutImposable,
      avantagesNature,
      cnpsSalarie,
      irpp,
      cac,
      cfcSalarie,
      tdl,
      rav,
      avances,
      autresRetenues,
      totalRetenues,
      netAPayer,
      pvidEmployeur,
      prestationsFamiliales,
      accidentsTravail,
      cfcEmployeur,
      fne,
      chargesEmployeur,
      coutTotal: brut + chargesEmployeur,
    },
  };
}
