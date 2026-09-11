// ---------------------------------------------------------------------------
// Bilan et compte de résultat SYSCOHADA révisé — module pur.
//
// Les deux états se déduisent entièrement de la balance : aucun cumul n'est
// stocké, donc aucun ne peut se désynchroniser des écritures. Les montants sont
// en centimes entiers d'un bout à l'autre (voir `money.ts`).
//
// Convention de signe : chaque poste est présenté **positif dans son sens
// naturel**. Un poste d'actif porte un solde débiteur, un poste de passif un
// solde créditeur, une charge un débit, un produit un crédit. Les rares postes
// qui peuvent basculer — variation de stocks, report à nouveau, résultat —
// prennent alors une valeur négative, et c'est leur sens comptable.
// ---------------------------------------------------------------------------

import { sommeMontants } from "./money";
import type { LigneBalance } from "./balance";
import {
  POSTES_BILAN_ACTIF,
  POSTES_BILAN_PASSIF,
  POSTES_RESULTAT,
  rattachementDuCompte,
  type PosteBilan,
  type PosteResultat,
} from "./postes-syscohada";

/** Un compte que le rattachement ne couvre pas, et son solde. */
export type CompteNonRattache = {
  compteNumero: string;
  compteLibelle: string;
  solde: number;
};

export type LigneBilan = {
  code: string;
  libelle: string;
  niveau?: 1 | 2;
  estTotal: boolean;
  /** Valeur d'origine, avant amortissements. Nul au passif. */
  brut: number;
  /** Amortissements et dépréciations, présentés positifs. Nul au passif. */
  amortissements: number;
  /** Valeur nette : `brut − amortissements`. C'est le montant de l'état. */
  net: number;
};

export type Bilan = {
  actif: LigneBilan[];
  passif: LigneBilan[];
  totalActif: number;
  totalPassif: number;
  /** Les deux totaux se répondent. Un écart signale un compte mal rattaché. */
  equilibre: boolean;
  ecart: number;
};

export type LigneResultat = {
  code: string;
  libelle: string;
  estTotal: boolean;
  montant: number;
};

export type CompteResultat = {
  lignes: LigneResultat[];
  /** Résultat net de l'exercice, positif si bénéfice. */
  resultatNet: number;
};

export type EtatsFinanciers = {
  bilan: Bilan;
  resultat: CompteResultat;
  /**
   * Comptes mouvementés qu'aucune règle ne rattache. La liste doit rester
   * vide : un compte absent des états ne se voit nulle part, alors que le
   * bilan continue de s'équilibrer.
   */
  comptesNonRattaches: CompteNonRattache[];
};

/**
 * Ramène −0 à 0.
 *
 * `-0 === 0` mais `Object.is(-0, 0)` est faux, et c'est ce que comparent les
 * tests comme l'égalité stricte d'un total à zéro. Un poste vide ne doit pas
 * se distinguer d'un autre poste vide par le signe de son zéro.
 */
function normaliser(n: number): number {
  return n === 0 ? 0 : n;
}

/** Solde signé d'un compte : positif s'il est débiteur. */
function soldeSigne(l: LigneBalance): number {
  return l.soldeDebiteur - l.soldeCrediteur;
}

type Repartition = {
  /** Solde signé cumulé par poste, hors amortissements. */
  brut: Map<string, number[]>;
  /** Solde signé cumulé des comptes d'amortissement, par poste. */
  amortissements: Map<string, number[]>;
  nonRattaches: CompteNonRattache[];
};

function ajouter(index: Map<string, number[]>, code: string, montant: number) {
  const liste = index.get(code);
  if (liste) liste.push(montant);
  else index.set(code, [montant]);
}

/** Ventile chaque compte de la balance vers son poste. */
function repartir(lignes: LigneBalance[]): Repartition {
  const brut = new Map<string, number[]>();
  const amortissements = new Map<string, number[]>();
  const nonRattaches: CompteNonRattache[] = [];

  for (const l of lignes) {
    const solde = soldeSigne(l);
    const r = rattachementDuCompte(l.compteNumero);

    if (!r) {
      // Un compte sans poste n'est pas ignoré : il remonte, avec son solde.
      nonRattaches.push({
        compteNumero: l.compteNumero,
        compteLibelle: l.compteLibelle,
        solde,
      });
      continue;
    }

    if ("poste" in r) {
      const index = r.role === "AMORTISSEMENT" ? amortissements : brut;
      ajouter(index, r.poste, solde);
    } else {
      ajouter(brut, solde >= 0 ? r.debiteur : r.crediteur, solde);
    }
  }

  return { brut, amortissements, nonRattaches };
}

function total(index: Map<string, number[]>, code: string): number {
  return sommeMontants(index.get(code) ?? []);
}

// ---------------------------------------------------------------------------
// Compte de résultat
// ---------------------------------------------------------------------------

/**
 * Compte de résultat, des ventes au résultat net.
 *
 * Les soldes intermédiaires — marge commerciale, valeur ajoutée, EBE, résultat
 * d'exploitation — se calculent dans l'ordre de la liste, chacun pouvant
 * reprendre les précédents. L'ordre des postes est donc significatif.
 */
export function calculerCompteResultat(
  lignes: LigneBalance[],
): CompteResultat {
  const { brut } = repartir(lignes);
  const valeurs = new Map<string, number>();
  const resultat: LigneResultat[] = [];

  for (const poste of POSTES_RESULTAT) {
    const montant = poste.composition
      ? composer(poste, valeurs)
      : montantDuPoste(poste, total(brut, poste.code));

    valeurs.set(poste.code, montant);
    resultat.push({
      code: poste.code,
      libelle: poste.libelle,
      estTotal: !!poste.composition,
      montant,
    });
  }

  return { lignes: resultat, resultatNet: valeurs.get("XI") ?? 0 };
}

/** Un produit est créditeur, une charge débitrice : les deux sortent positifs. */
function montantDuPoste(poste: PosteResultat, soldeCumule: number): number {
  return poste.sens === "PRODUIT" ? -soldeCumule : soldeCumule;
}

function composer(poste: PosteResultat, valeurs: Map<string, number>): number {
  const { plus, moins } = poste.composition!;
  return (
    sommeMontants(plus.map((c) => valeurs.get(c) ?? 0)) -
    sommeMontants(moins.map((c) => valeurs.get(c) ?? 0))
  );
}

// ---------------------------------------------------------------------------
// Bilan
// ---------------------------------------------------------------------------

/**
 * Bilan à la date de la balance, résultat de l'exercice compris.
 *
 * `resultatNet` est injecté au poste CJ. Sans lui le bilan ne s'équilibrerait
 * pas : tant que les comptes de gestion ne sont pas soldés en fin d'exercice,
 * le résultat n'existe dans aucun compte de bilan, et c'est pourtant lui qui
 * fait la contrepartie des actifs acquis pendant la période.
 */
export function calculerBilan(
  lignes: LigneBalance[],
  resultatNet: number,
): Bilan {
  const { brut, amortissements } = repartir(lignes);

  const actif = resoudreSection(POSTES_BILAN_ACTIF, (poste) =>
    ligneActif(poste, brut, amortissements),
  );
  const passif = resoudreSection(POSTES_BILAN_PASSIF, (poste) =>
    lignePassif(poste, brut, resultatNet),
  );

  const totalActif = actif.find((l) => l.code === "BZ")?.net ?? 0;
  const totalPassif = passif.find((l) => l.code === "DZ")?.net ?? 0;

  return {
    actif,
    passif,
    totalActif,
    totalPassif,
    equilibre: totalActif === totalPassif,
    ecart: normaliser(totalActif - totalPassif),
  };
}

/**
 * Calcule une section du bilan, puis la rend **dans l'ordre de présentation**.
 *
 * Les deux ordres diffèrent : l'état annonce la rubrique avant ses sous-postes
 * — « Immobilisations incorporelles » précède le détail qu'elle totalise —
 * alors que le calcul doit prendre les sous-postes en premier. On résout donc
 * par dépendances, et on présente ensuite selon la liste.
 */
function resoudreSection(
  postes: PosteBilan[],
  feuille: (poste: PosteBilan) => LigneBilan,
): LigneBilan[] {
  const parCode = new Map(postes.map((p) => [p.code, p]));
  const calculees = new Map<string, LigneBilan>();

  function valeur(code: string): LigneBilan {
    const deja = calculees.get(code);
    if (deja) return deja;

    const poste = parCode.get(code);
    // Un total ne peut viser que des postes de sa section ; l'absence est déjà
    // interdite par les tests de structure, mais un zéro vaut mieux qu'un plant.
    if (!poste) return LIGNE_VIDE;

    // Marquer avant de descendre : une composition circulaire s'arrêterait ici
    // au lieu de boucler. Les tests de structure interdisent déjà les cycles.
    calculees.set(code, LIGNE_VIDE);

    const ligne = poste.total
      ? totaliser(poste, poste.total.map(valeur))
      : feuille(poste);

    calculees.set(code, ligne);
    return ligne;
  }

  return postes.map((p) => valeur(p.code));
}

const LIGNE_VIDE: LigneBilan = {
  code: "",
  libelle: "",
  estTotal: true,
  brut: 0,
  amortissements: 0,
  net: 0,
};

function totaliser(poste: PosteBilan, reprises: LigneBilan[]): LigneBilan {
  return {
    code: poste.code,
    libelle: poste.libelle,
    niveau: poste.niveau,
    estTotal: true,
    brut: sommeMontants(reprises.map((l) => l.brut)),
    amortissements: sommeMontants(reprises.map((l) => l.amortissements)),
    net: sommeMontants(reprises.map((l) => l.net)),
  };
}

function ligneActif(
  poste: PosteBilan,
  brut: Map<string, number[]>,
  amortissements: Map<string, number[]>,
): LigneBilan {
  const valeurBrute = total(brut, poste.code);
  // Les comptes d'amortissement sont créditeurs : on les présente positifs.
  const amort = normaliser(-total(amortissements, poste.code));

  return {
    code: poste.code,
    libelle: poste.libelle,
    niveau: poste.niveau,
    estTotal: false,
    brut: valeurBrute,
    amortissements: amort,
    net: normaliser(valeurBrute - amort),
  };
}

function lignePassif(
  poste: PosteBilan,
  brut: Map<string, number[]>,
  resultatNet: number,
): LigneBilan {
  // Un poste de passif est créditeur : le solde signé est négatif.
  let net = -total(brut, poste.code);
  if (poste.code === "CJ") net += resultatNet;

  return {
    code: poste.code,
    libelle: poste.libelle,
    niveau: poste.niveau,
    estTotal: false,
    brut: 0,
    amortissements: 0,
    net: normaliser(net),
  };
}

// ---------------------------------------------------------------------------
// Les deux ensemble
// ---------------------------------------------------------------------------

/**
 * Bilan et compte de résultat d'une même balance, cohérents entre eux.
 *
 * C'est l'entrée à utiliser : le résultat net du compte de résultat alimente le
 * bilan, et les appeler séparément expose à les câbler de travers.
 */
export function calculerEtatsFinanciers(
  lignes: LigneBalance[],
): EtatsFinanciers {
  const resultat = calculerCompteResultat(lignes);
  const bilan = calculerBilan(lignes, resultat.resultatNet);
  const { nonRattaches } = repartir(lignes);

  return { bilan, resultat, comptesNonRattaches: nonRattaches };
}
