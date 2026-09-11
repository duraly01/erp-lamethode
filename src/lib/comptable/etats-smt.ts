// ---------------------------------------------------------------------------
// Système minimal de trésorerie (SMT) — module pur.
//
// Le SMT est la présentation allégée que le SYSCOHADA révisé réserve aux
// petites entités : un bilan en quelques lignes, et un compte de résultat en
// recettes et dépenses.
//
// Chaque ligne du SMT est un **regroupement de postes du système normal**, et
// non un second rattachement des comptes. Les deux présentations partent donc
// des mêmes chiffres et ne peuvent pas se contredire : ce qui est validé pour
// le système normal vaut pour le SMT, et il ne reste à confirmer que le
// regroupement — quelques lignes de données.
//
// ⚠️ Les regroupements suivent le modèle SMT tel que je le connais. Ils sont en
// données, à confirmer par l'expert-comptable.
//
// Montants en centimes entiers.
// ---------------------------------------------------------------------------

import { sommeMontants } from "./money";
import type { LigneBalance } from "./balance";
import {
  calculerEtatsFinanciers,
  type EtatsFinanciers,
  type LigneBilan,
  type LigneResultat,
} from "./etats-financiers";

export type LigneSmt = {
  code: string;
  libelle: string;
  /** Postes du système normal dont la ligne est la somme. */
  postes: string[];
  estTotal?: boolean;
};

/** Le SMT reprend la valeur nette des immobilisations : brut et amortissements n'y sont pas distingués. */
export const SMT_BILAN_ACTIF: LigneSmt[] = [
  { code: "IA", libelle: "Immobilisations (valeur nette)", postes: ["AD", "AI", "AQ"] },
  { code: "IB", libelle: "Stocks", postes: ["BB"] },
  { code: "IC", libelle: "Créances clients et autres créances", postes: ["BA", "BG"] },
  { code: "ID", libelle: "Trésorerie", postes: ["BT"] },
  { code: "IZ", libelle: "TOTAL ACTIF", postes: ["IA", "IB", "IC", "ID"], estTotal: true },
];

export const SMT_BILAN_PASSIF: LigneSmt[] = [
  { code: "PA", libelle: "Capital et réserves", postes: ["CA", "CD", "CE", "CF", "CG", "CH", "CL", "CM"] },
  { code: "PB", libelle: "Résultat de l'exercice", postes: ["CJ"] },
  { code: "PC", libelle: "Emprunts et dettes financières", postes: ["DD"] },
  { code: "PD", libelle: "Dettes fournisseurs et autres dettes", postes: ["DP"] },
  { code: "PE", libelle: "Découverts bancaires", postes: ["DT"] },
  { code: "PZ", libelle: "TOTAL PASSIF", postes: ["PA", "PB", "PC", "PD", "PE"], estTotal: true },
];

export const SMT_RECETTES: LigneSmt[] = [
  { code: "R1", libelle: "Ventes de marchandises", postes: ["TA"] },
  { code: "R2", libelle: "Ventes de produits, travaux et services", postes: ["TB", "TC", "TD"] },
  { code: "R3", libelle: "Autres recettes", postes: ["TE", "TF", "TG", "TH", "TI", "TJ", "TK", "TN", "TO"] },
  { code: "RZ", libelle: "TOTAL DES RECETTES", postes: ["R1", "R2", "R3"], estTotal: true },
];

export const SMT_DEPENSES: LigneSmt[] = [
  { code: "D1", libelle: "Achats et variations de stocks", postes: ["RA", "RB", "RC", "RD", "RE"] },
  { code: "D2", libelle: "Charges de personnel", postes: ["RK"] },
  { code: "D3", libelle: "Impôts, taxes et impôt sur le résultat", postes: ["RI", "RQ", "RS"] },
  { code: "D4", libelle: "Autres dépenses", postes: ["RG", "RH", "RJ", "RM", "RO", "RP"] },
  { code: "D5", libelle: "Dotations aux amortissements et provisions", postes: ["RL"] },
  { code: "DZ", libelle: "TOTAL DES DÉPENSES", postes: ["D1", "D2", "D3", "D4", "D5"], estTotal: true },
];

export type LigneSmtCalculee = {
  code: string;
  libelle: string;
  montant: number;
  estTotal: boolean;
};

export type EtatsSmt = {
  actif: LigneSmtCalculee[];
  passif: LigneSmtCalculee[];
  recettes: LigneSmtCalculee[];
  depenses: LigneSmtCalculee[];
  resultatNet: number;
  totalActif: number;
  totalPassif: number;
  equilibre: boolean;
};

/** Résout les lignes d'une section, un total pouvant reprendre les lignes qui le précèdent. */
function resoudre(
  definitions: LigneSmt[],
  valeurDuPoste: (code: string) => number,
): LigneSmtCalculee[] {
  const calculees = new Map<string, number>();
  return definitions.map((d) => {
    const montant = sommeMontants(
      d.postes.map((p) => calculees.get(p) ?? valeurDuPoste(p)),
    );
    calculees.set(d.code, montant);
    return {
      code: d.code,
      libelle: d.libelle,
      montant: montant === 0 ? 0 : montant,
      estTotal: !!d.estTotal,
    };
  });
}

/** SMT déduit d'états du système normal déjà calculés. */
export function regrouperEnSmt(etats: EtatsFinanciers): EtatsSmt {
  const bilan = new Map<string, LigneBilan>(
    [...etats.bilan.actif, ...etats.bilan.passif].map((l) => [l.code, l]),
  );
  const resultat = new Map<string, LigneResultat>(
    etats.resultat.lignes.map((l) => [l.code, l]),
  );

  const net = (code: string) => bilan.get(code)?.net ?? 0;
  const montant = (code: string) => resultat.get(code)?.montant ?? 0;

  const actif = resoudre(SMT_BILAN_ACTIF, net);
  const passif = resoudre(SMT_BILAN_PASSIF, net);
  const recettes = resoudre(SMT_RECETTES, montant);
  const depenses = resoudre(SMT_DEPENSES, montant);

  const totalActif = actif.find((l) => l.code === "IZ")?.montant ?? 0;
  const totalPassif = passif.find((l) => l.code === "PZ")?.montant ?? 0;

  return {
    actif,
    passif,
    recettes,
    depenses,
    resultatNet:
      (recettes.find((l) => l.code === "RZ")?.montant ?? 0) -
      (depenses.find((l) => l.code === "DZ")?.montant ?? 0),
    totalActif,
    totalPassif,
    equilibre: totalActif === totalPassif,
  };
}

/** SMT calculé directement depuis une balance. */
export function calculerEtatsSmt(lignes: LigneBalance[]): EtatsSmt {
  return regrouperEnSmt(calculerEtatsFinanciers(lignes));
}
