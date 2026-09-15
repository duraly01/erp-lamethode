// ---------------------------------------------------------------------------
// Immobilisations et amortissements — module pur (E5).
//
// Une immobilisation entre dans les livres par sa facture d'achat ou une
// écriture d'acquisition ; ce module ne s'occupe que de ce qui vient après :
// la perte de valeur constatée chaque exercice, la dotation, et la sortie du
// bien quand il est cédé ou mis au rebut.
//
// Deux modes :
//
// - **linéaire** : la base amortissable — valeur d'origine moins valeur
//   résiduelle — s'étale uniformément sur la durée d'utilité, prorata
//   temporis en jours à compter de la mise en service, sur une année de
//   360 jours (mois de 30 jours). Le cumul à une date se calcule directement,
//   et la dotation d'une période est la différence de deux cumuls : aucun
//   arrondi ne se propage, le dernier exercice absorbe les centimes ;
// - **dégressif** : le régime fiscal camerounais. Taux linéaire multiplié
//   par un coefficient qui dépend de la durée (1,5 jusqu'à 4 ans, 2 de 5 à
//   6 ans, 2,5 au-delà), appliqué chaque exercice à la valeur nette, avec un
//   premier exercice au prorata en mois — le mois d'acquisition compté
//   entier — et bascule sur le linéaire dès que la part restante par
//   exercice devient plus forte. La valeur résiduelle n'y joue pas.
//
// ⚠️ Conventions à confirmer par l'expert-comptable : la base de 360 jours
// pour le linéaire et les coefficients du dégressif sont portés en données,
// pas enfouis dans le calcul.
//
// Montants en centimes entiers, dates ISO « AAAA-MM-JJ ».
// ---------------------------------------------------------------------------

import { formatMontant, sommeMontants } from "./money";
import type { LigneGeneree } from "./generation";

export type ModeAmortissement = "LINEAIRE" | "DEGRESSIF";

export type FicheAmortissable = {
  valeurOrigine: number;
  /** Ce que le bien vaudra encore au terme de sa durée d'utilité ; nulle le plus souvent. */
  valeurResiduelle: number;
  dateMiseEnService: string;
  /** Durée d'utilité en mois. Nulle pour un bien qui ne s'amortit pas — un terrain. */
  dureeMois: number | null;
  mode: ModeAmortissement;
  /** Date de cession ou de mise au rebut : le plan s'arrête là. */
  dateSortie?: string | null;
};

/** Une période de dotation : un exercice, ou ce qui en tient lieu avant la tenue des livres ici. */
export type Periode = { dateDebut: string; dateFin: string };

export type LignePlan = Periode & {
  base: number;
  dotation: number;
  cumulFin: number;
  vncFin: number;
};

export class AmortissementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmortissementError";
  }
}

/** Coefficients du dégressif selon la durée d'utilité, en années. */
export const COEFFICIENTS_DEGRESSIF: { dureeMaxAnnees: number; coefficient: number }[] = [
  { dureeMaxAnnees: 4, coefficient: 1.5 },
  { dureeMaxAnnees: 6, coefficient: 2 },
  { dureeMaxAnnees: Infinity, coefficient: 2.5 },
];

const JOURS_ANNEE = 360;

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function ymd(iso: string): [number, number, number] {
  const [a, m, j] = iso.split("-").map(Number);
  return [a, m, j];
}

/**
 * Jours entre deux dates incluses, en convention 30/360 : chaque mois vaut
 * 30 jours, le 31 compte comme le 30. Négatif ou nul si l'ordre est inversé.
 */
export function jours360(debut: string, fin: string): number {
  const [a1, m1, j1] = ymd(debut);
  const [a2, m2, j2] = ymd(fin);
  return (a2 - a1) * JOURS_ANNEE + (m2 - m1) * 30 + (Math.min(j2, 30) - Math.min(j1, 30)) + 1;
}

/** Nombre de mois du mois de `debut` (compté entier) à celui de `fin` inclus. */
function moisInclus(debut: string, fin: string): number {
  const [a1, m1] = ymd(debut);
  const [a2, m2] = ymd(fin);
  return (a2 - a1) * 12 + (m2 - m1) + 1;
}

function veille(iso: string): string {
  const [a, m, j] = ymd(iso);
  const d = new Date(Date.UTC(a, m - 1, j - 1));
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Linéaire
// ---------------------------------------------------------------------------

function arrondi(x: number): number {
  return Math.floor(x + 0.5);
}

function verifierFiche(f: FicheAmortissable) {
  if (!Number.isSafeInteger(f.valeurOrigine) || f.valeurOrigine <= 0) {
    throw new AmortissementError("La valeur d'origine doit être un montant strictement positif.");
  }
  if (!Number.isSafeInteger(f.valeurResiduelle) || f.valeurResiduelle < 0 || f.valeurResiduelle >= f.valeurOrigine) {
    throw new AmortissementError("La valeur résiduelle doit être positive et inférieure à la valeur d'origine.");
  }
  if (f.dureeMois !== null && (!Number.isInteger(f.dureeMois) || f.dureeMois <= 0)) {
    throw new AmortissementError("La durée d'utilité doit être un nombre entier de mois strictement positif.");
  }
}

/**
 * Cumul des amortissements linéaires constatés à une date incluse — c'est
 * l'amortissement « théorique » du bien, tel que le plan le prévoit.
 */
export function cumulLineaire(f: FicheAmortissable, date: string): number {
  if (f.dureeMois === null || date < f.dateMiseEnService) return 0;
  // Un bien sorti ne s'amortit plus : le cumul se fige à la sortie.
  if (f.dateSortie && f.dateSortie < date) date = f.dateSortie;
  const base = f.valeurOrigine - f.valeurResiduelle;
  const jours = jours360(f.dateMiseEnService, date);
  const total = f.dureeMois * 30;
  if (jours >= total) return base;
  return arrondi((base * jours) / total);
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/**
 * Le plan d'amortissement du bien sur les périodes fournies, dans l'ordre.
 *
 * Les périodes doivent être contiguës et couvrir la vie du bien depuis sa
 * mise en service ; celles qui précèdent la mise en service ou suivent la
 * fin du plan sont rendues à zéro, pour que la table reste lisible en face
 * des exercices. Un bien non amortissable a un plan vide.
 */
export function planAmortissement(f: FicheAmortissable, periodes: Periode[]): LignePlan[] {
  verifierFiche(f);
  if (f.dureeMois === null) return [];
  return f.mode === "LINEAIRE" ? planLineaire(f, periodes) : planDegressif(f, periodes);
}

function planLineaire(f: FicheAmortissable, periodes: Periode[]): LignePlan[] {
  const base = f.valeurOrigine - f.valeurResiduelle;
  const lignes: LignePlan[] = [];
  for (const p of periodes) {
    const cumulDebut = cumulLineaire(f, veille(p.dateDebut));
    const cumulFin = cumulLineaire(f, p.dateFin);
    lignes.push({ ...p, base, dotation: cumulFin - cumulDebut, cumulFin, vncFin: f.valeurOrigine - cumulFin });
  }
  return lignes;
}

export function coefficientDegressif(dureeMois: number): number {
  const annees = dureeMois / 12;
  return COEFFICIENTS_DEGRESSIF.find((c) => annees <= c.dureeMaxAnnees)!.coefficient;
}

function planDegressif(f: FicheAmortissable, periodes: Periode[]): LignePlan[] {
  const duree = f.dureeMois!;
  const base = f.valeurOrigine;
  const tauxDegressif = (12 / duree) * coefficientDegressif(duree);
  const nbAnnuites = Math.ceil(duree / 12);
  const lignes: LignePlan[] = [];
  let cumul = 0;
  let rang = 0; // rang de l'annuité, la première partielle comptant pour une

  for (const p of periodes) {
    const avant = p.dateFin < f.dateMiseEnService;
    const sorti = !!f.dateSortie && f.dateSortie < p.dateDebut;
    let dotation = 0;
    if (!avant && !sorti && cumul < base) {
      rang += 1;
      const vnc = base - cumul;
      const restantes = nbAnnuites - rang + 1;
      // Bascule sur le linéaire dès que la part restante par exercice l'emporte.
      const tauxLineaireRestant = restantes > 0 ? 1 / restantes : 1;
      let annuite = vnc * Math.max(tauxDegressif, tauxLineaireRestant);
      if (rang === 1) {
        // Prorata en mois, mois d'acquisition compté entier.
        const debut = f.dateMiseEnService > p.dateDebut ? f.dateMiseEnService : p.dateDebut;
        annuite = base * tauxDegressif * (moisInclus(debut, p.dateFin) / moisInclus(p.dateDebut, p.dateFin));
      }
      if (restantes <= 1) annuite = vnc;
      dotation = Math.min(arrondi(annuite), vnc);
      // Cédé en cours de période : la dotation court jusqu'à la sortie, en jours.
      if (f.dateSortie && f.dateSortie <= p.dateFin) {
        dotation = Math.min(arrondi((dotation * jours360(p.dateDebut, f.dateSortie)) / jours360(p.dateDebut, p.dateFin)), vnc);
      }
    }
    cumul += dotation;
    lignes.push({ ...p, base, dotation, cumulFin: cumul, vncFin: f.valeurOrigine - cumul });
  }
  return lignes;
}

// ---------------------------------------------------------------------------
// Dotation et sortie d'un exercice
// ---------------------------------------------------------------------------

/**
 * Cumul amorti à une date, quel que soit le mode : pour le linéaire c'est
 * direct ; pour le dégressif on rejoue le plan jusqu'à la période qui
 * contient la date, tronquée à cette date.
 */
export function cumulADate(f: FicheAmortissable, periodes: Periode[], date: string): number {
  if (f.dureeMois === null || date < f.dateMiseEnService) return 0;
  if (f.mode === "LINEAIRE") return cumulLineaire(f, date);
  const jusque = periodes.filter((p) => p.dateDebut <= date);
  if (jusque.length === 0) return 0;
  const plan = planDegressif({ ...f, dateSortie: null }, jusque);
  const derniere = plan[plan.length - 1];
  if (derniere.dateFin <= date) return derniere.cumulFin;
  // En cours de période : l'annuité court en jours jusqu'à la date.
  const part = arrondi((derniere.dotation * jours360(derniere.dateDebut, date)) / jours360(derniere.dateDebut, derniere.dateFin));
  return derniere.cumulFin - derniere.dotation + part;
}

export type ImmobilisationADoter = {
  id: number;
  code: string;
  libelle: string;
  fiche: FicheAmortissable;
  comptes: { dotation: number; amortissement: number };
};

export type DotationCalculee = { immobilisationId: number; montant: number };

/**
 * L'écriture de dotation d'un exercice : pour chaque bien, débit du compte
 * de dotation, crédit du compte d'amortissement, du montant que le plan
 * prévoit pour la période. Un bien dont la dotation est nulle — pas encore
 * en service, entièrement amorti — n'y figure pas.
 */
export function genererEcritureDotations(
  biens: ImmobilisationADoter[],
  periodes: Periode[],
  exercice: Periode,
  libelleExercice: string,
): { lignes: LigneGeneree[]; dotations: DotationCalculee[] } {
  const lignes: LigneGeneree[] = [];
  const dotations: DotationCalculee[] = [];
  for (const b of biens) {
    if (b.fiche.dureeMois === null) continue;
    const plan = planAmortissement(b.fiche, periodes);
    const ligne = plan.find((l) => l.dateDebut === exercice.dateDebut && l.dateFin === exercice.dateFin);
    if (!ligne) throw new AmortissementError(`Le plan de ${b.code} ne couvre pas l'exercice ${libelleExercice}.`);
    if (ligne.dotation <= 0) continue;
    const libelle = `Dotation ${libelleExercice} — ${b.code} ${b.libelle}`;
    lignes.push({ compteId: b.comptes.dotation, libelle, debit: formatMontant(ligne.dotation) });
    lignes.push({ compteId: b.comptes.amortissement, libelle, credit: formatMontant(ligne.dotation) });
    dotations.push({ immobilisationId: b.id, montant: ligne.dotation });
  }
  return { lignes, dotations };
}

export type SortieImmobilisation = {
  code: string;
  libelle: string;
  fiche: FicheAmortissable;
  dateSortie: string;
  /** Prix de cession hors taxes ; nul pour une mise au rebut. */
  prixCession: number;
  /** Cumul déjà constaté dans les livres au début de l'exercice de sortie. */
  cumulDebutExercice: number;
  /** Dotation déjà passée pour cet exercice, s'il y en a une. */
  dotationDejaPassee: number;
  exercice: Periode;
  periodes: Periode[];
  comptes: {
    immobilisation: number;
    amortissement: number | null;
    dotation: number | null;
    /** 812 valeur comptable des cessions ; 81x selon la nature. */
    valeurComptable: number;
    /** 822 produit des cessions. */
    produitCession: number | null;
    /** 485 créance sur cession. */
    creanceCession: number | null;
  };
};

/**
 * L'écriture de sortie d'un bien :
 *
 *   Débit  681 dotation complémentaire   — de l'ouverture à la sortie, si pas déjà passée
 *   Crédit 28  amortissement             — la même
 *   Débit  28  amortissements cumulés    — tout ce qui a été amorti, solde le compte
 *   Débit  812 valeur comptable cédée    — ce qui reste
 *   Crédit 2x  immobilisation            — la valeur d'origine, solde le compte
 *   Débit  485 créance sur cession       — le prix, s'il y en a un
 *   Crédit 822 produit de cession        — le même
 *
 * Elle s'équilibre par construction : cumul + valeur nette = valeur d'origine.
 */
export function genererEcritureSortie(s: SortieImmobilisation): { lignes: LigneGeneree[]; dotationComplementaire: number; cumul: number; vnc: number } {
  verifierFiche(s.fiche);
  if (s.dateSortie < s.fiche.dateMiseEnService) {
    throw new AmortissementError("La sortie ne peut pas précéder la mise en service.");
  }
  if (!Number.isSafeInteger(s.prixCession) || s.prixCession < 0) {
    throw new AmortissementError("Le prix de cession doit être un montant positif ou nul.");
  }
  const amortissable = s.fiche.dureeMois !== null;
  const cumulSortie = amortissable ? cumulADate(s.fiche, s.periodes, s.dateSortie) : 0;
  const dotationComplementaire = Math.max(0, cumulSortie - s.cumulDebutExercice - s.dotationDejaPassee);
  const cumul = s.cumulDebutExercice + s.dotationDejaPassee + dotationComplementaire;
  const vnc = s.fiche.valeurOrigine - cumul;
  if (vnc < 0) throw new AmortissementError(`${s.code} : les amortissements constatés dépassent la valeur d'origine.`);

  const nom = `${s.code} ${s.libelle}`;
  const lignes: LigneGeneree[] = [];
  if (dotationComplementaire > 0) {
    if (s.comptes.dotation === null || s.comptes.amortissement === null) {
      throw new AmortissementError(`${s.code} : comptes de dotation et d'amortissement requis pour la dotation complémentaire.`);
    }
    const libelle = `Dotation complémentaire jusqu'à la sortie — ${nom}`;
    lignes.push({ compteId: s.comptes.dotation, libelle, debit: formatMontant(dotationComplementaire) });
    lignes.push({ compteId: s.comptes.amortissement, libelle, credit: formatMontant(dotationComplementaire) });
  }
  const motif = s.prixCession > 0 ? "Cession" : "Mise au rebut";
  if (cumul > 0) {
    if (s.comptes.amortissement === null) throw new AmortissementError(`${s.code} : compte d'amortissement requis.`);
    lignes.push({ compteId: s.comptes.amortissement, libelle: `${motif} — amortissements cumulés — ${nom}`, debit: formatMontant(cumul) });
  }
  if (vnc > 0) {
    lignes.push({ compteId: s.comptes.valeurComptable, libelle: `${motif} — valeur nette comptable — ${nom}`, debit: formatMontant(vnc) });
  }
  lignes.push({ compteId: s.comptes.immobilisation, libelle: `${motif} — sortie de l'actif — ${nom}`, credit: formatMontant(s.fiche.valeurOrigine) });
  if (s.prixCession > 0) {
    if (s.comptes.creanceCession === null || s.comptes.produitCession === null) {
      throw new AmortissementError(`${s.code} : comptes de créance et de produit de cession requis.`);
    }
    lignes.push({ compteId: s.comptes.creanceCession, libelle: `Cession — prix de vente — ${nom}`, debit: formatMontant(s.prixCession) });
    lignes.push({ compteId: s.comptes.produitCession, libelle: `Cession — produit — ${nom}`, credit: formatMontant(s.prixCession) });
  }
  return { lignes, dotationComplementaire, cumul, vnc };
}

// ---------------------------------------------------------------------------
// Tableau des immobilisations
// ---------------------------------------------------------------------------

export type ImmobilisationInventoriee = {
  id: number;
  code: string;
  libelle: string;
  compteNumero: string;
  fiche: FicheAmortissable;
  dateAcquisition: string;
};

export type LigneTableau = {
  id: number;
  code: string;
  libelle: string;
  compteNumero: string;
  brutDebut: number;
  acquisitions: number;
  sorties: number;
  brutFin: number;
  amortDebut: number;
  dotation: number;
  amortSorties: number;
  amortFin: number;
  vncFin: number;
};

/**
 * Le tableau des immobilisations d'un exercice, tel que la note 3 de la
 * liasse le demande : pour chaque bien, ce qu'il valait à l'ouverture, ce
 * qui est entré, sorti, et ce qui reste — en brut et en amortissements.
 *
 * Il se calcule sur le plan, pas sur les livres : c'est ce que les livres
 * *devraient* porter, à confronter à la balance.
 */
export function tableauImmobilisations(biens: ImmobilisationInventoriee[], periodes: Periode[], exercice: Periode): LigneTableau[] {
  const lignes: LigneTableau[] = [];
  for (const b of biens) {
    const f = b.fiche;
    const sortiAvant = !!f.dateSortie && f.dateSortie < exercice.dateDebut;
    const acquisApres = b.dateAcquisition > exercice.dateFin;
    if (sortiAvant || acquisApres) continue;
    const acquisDans = b.dateAcquisition >= exercice.dateDebut;
    const sortiDans = !!f.dateSortie && f.dateSortie <= exercice.dateFin;
    const vo = f.valeurOrigine;
    const amortDebut = acquisDans ? 0 : cumulADate(f, periodes, veille(exercice.dateDebut));
    const cumulFin = sortiDans ? cumulADate(f, periodes, f.dateSortie!) : cumulADate(f, periodes, exercice.dateFin);
    const dotation = cumulFin - amortDebut;
    lignes.push({
      id: b.id,
      code: b.code,
      libelle: b.libelle,
      compteNumero: b.compteNumero,
      brutDebut: acquisDans ? 0 : vo,
      acquisitions: acquisDans ? vo : 0,
      sorties: sortiDans ? vo : 0,
      brutFin: sortiDans ? 0 : vo,
      amortDebut,
      dotation,
      amortSorties: sortiDans ? cumulFin : 0,
      amortFin: sortiDans ? 0 : cumulFin,
      vncFin: sortiDans ? 0 : vo - cumulFin,
    });
  }
  return lignes;
}

export function totauxTableau(lignes: LigneTableau[]): Omit<LigneTableau, "id" | "code" | "libelle" | "compteNumero"> {
  const s = (cle: keyof LigneTableau) => sommeMontants(lignes.map((l) => l[cle] as number));
  return {
    brutDebut: s("brutDebut"),
    acquisitions: s("acquisitions"),
    sorties: s("sorties"),
    brutFin: s("brutFin"),
    amortDebut: s("amortDebut"),
    dotation: s("dotation"),
    amortSorties: s("amortSorties"),
    amortFin: s("amortFin"),
    vncFin: s("vncFin"),
  };
}

/**
 * Les périodes de dotation d'un bien : les exercices connus, prolongés en
 * arrière et en avant par des périodes de douze mois calées sur les mêmes
 * bornes, pour couvrir toute la vie du bien. C'est ce qui permet de calculer
 * le plan d'un bien acquis avant que les livres ne soient tenus ici.
 */
export function periodesPourPlan(exercices: Periode[], f: FicheAmortissable): Periode[] {
  if (exercices.length === 0) throw new AmortissementError("Aucun exercice pour caler le plan.");
  const tries = [...exercices].sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));
  const decaler = (iso: string, annees: number) => {
    const [a, m, j] = ymd(iso);
    const an = a + annees;
    const bissextile = (an % 4 === 0 && an % 100 !== 0) || an % 400 === 0;
    const jour = m === 2 && j === 29 && !bissextile ? 28 : j;
    return `${an}-${String(m).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
  };
  const resultat = [...tries];
  // Bornes de fin : février d'une année bissextile décalé garde son jour.
  const finDeVie = f.dureeMois === null ? f.dateMiseEnService : decaler(f.dateMiseEnService, Math.ceil(f.dureeMois / 12) + 1);
  let premiere = resultat[0];
  while (premiere.dateDebut > f.dateMiseEnService) {
    premiere = { dateDebut: decaler(premiere.dateDebut, -1), dateFin: decaler(premiere.dateFin, -1) };
    resultat.unshift(premiere);
  }
  let derniere = resultat[resultat.length - 1];
  while (derniere.dateFin < finDeVie) {
    derniere = { dateDebut: decaler(derniere.dateDebut, 1), dateFin: decaler(derniere.dateFin, 1) };
    resultat.push(derniere);
  }
  return resultat;
}
