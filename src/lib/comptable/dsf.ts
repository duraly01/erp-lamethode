// ---------------------------------------------------------------------------
// Liquidation de l'impôt sur le résultat (DSF) — module pur.
//
// La DSF est la liasse annuelle : ses états sont ceux de
// `etats-financiers.ts`. Ce module traite la seule partie qui ne s'en déduit
// pas directement, le passage du résultat comptable à l'impôt dû.
//
// Aucun taux n'est écrit ici. Le barème est reçu en argument, et vient du
// paramétrage du cabinet : les taux d'impôt changent par voie de loi de
// finances, et un taux en dur ferait recalculer un exercice ancien au tarif
// d'aujourd'hui. Sans barème, le module rend ce qu'il sait — chiffre
// d'affaires, résultat comptable, résultat fiscal — et dit que l'impôt n'est
// pas calculable, plutôt que d'avancer un chiffre inventé.
//
// Montants en centimes entiers (voir `money.ts`).
// ---------------------------------------------------------------------------

import { appliquerTaux } from "./money";

/**
 * Barème de l'impôt sur le résultat, tel que paramétré par le cabinet.
 *
 * Les taux sont des pourcentages — « 33 » pour 33 %, « 2.2 » pour 2,2 % — au
 * même format que `cpta_taxes.taux`.
 */
export type BaremeImpot = {
  /** Taux de l'impôt sur le résultat, contributions additionnelles comprises. */
  tauxImpot: string | number;
  /** Minimum de perception, en pourcentage du chiffre d'affaires. */
  tauxMinimum: string | number;
};

/**
 * Retraitements du résultat comptable vers le résultat fiscal.
 *
 * Ils relèvent de l'appréciation du comptable — charges non déductibles,
 * produits exonérés, amortissements réintégrés — et ne se déduisent d'aucune
 * écriture. Ils sont donc saisis, pas calculés.
 */
export type Retraitements = {
  reintegrations: number;
  deductions: number;
};

export const SANS_RETRAITEMENT: Retraitements = {
  reintegrations: 0,
  deductions: 0,
};

export type LiquidationImpot = {
  chiffreAffaires: number;
  resultatComptable: number;
  reintegrations: number;
  deductions: number;
  /** Résultat comptable corrigé des retraitements. */
  resultatFiscal: number;
  /** Acomptes et retenues déjà versés, imputables sur l'impôt. */
  acomptesVerses: number;

  /** Impôt calculé sur le résultat fiscal. `null` faute de barème. */
  impotSurResultat: number | null;
  /** Minimum de perception assis sur le chiffre d'affaires. */
  minimumPerception: number | null;
  /** Le plus élevé des deux : c'est l'impôt de l'exercice. */
  impotRetenu: number | null;
  /** Ce que retenir le minimum plutôt que l'impôt sur le résultat a coûté. */
  minimumApplique: boolean;

  /** Reste à payer après imputation des acomptes. */
  soldeAPayer: number | null;
  /** Trop-versé, quand les acomptes dépassent l'impôt. */
  creditImpot: number | null;

  /**
   * Vrai quand le barème n'est pas paramétré : tout ce qui dépend d'un taux
   * vaut alors `null`, et l'écran doit renvoyer vers le paramétrage plutôt que
   * d'afficher des zéros qu'on lirait comme « rien à payer ».
   */
  baremeManquant: boolean;
};

/**
 * Liquide l'impôt sur le résultat d'un exercice.
 *
 * Le minimum de perception s'applique quand il dépasse l'impôt calculé sur le
 * résultat — y compris, et surtout, lorsque l'exercice est déficitaire : une
 * entreprise en perte reste redevable du minimum assis sur son chiffre
 * d'affaires.
 */
export function liquiderImpot(
  base: {
    chiffreAffaires: number;
    resultatComptable: number;
    acomptesVerses: number;
  },
  retraitements: Retraitements = SANS_RETRAITEMENT,
  bareme: BaremeImpot | null = null,
): LiquidationImpot {
  const resultatFiscal =
    base.resultatComptable +
    retraitements.reintegrations -
    retraitements.deductions;

  const commun = {
    chiffreAffaires: base.chiffreAffaires,
    resultatComptable: base.resultatComptable,
    reintegrations: retraitements.reintegrations,
    deductions: retraitements.deductions,
    resultatFiscal,
    acomptesVerses: base.acomptesVerses,
  };

  if (!bareme) {
    return {
      ...commun,
      impotSurResultat: null,
      minimumPerception: null,
      impotRetenu: null,
      minimumApplique: false,
      soldeAPayer: null,
      creditImpot: null,
      baremeManquant: true,
    };
  }

  // Un résultat fiscal négatif ne produit pas d'impôt négatif : le déficit se
  // reporte, il ne se rembourse pas.
  const impotSurResultat =
    resultatFiscal > 0 ? appliquerTaux(resultatFiscal, bareme.tauxImpot) : 0;

  // Le chiffre d'affaires est toujours positif en pratique ; la garde évite
  // qu'un exercice aberrant produise un minimum négatif.
  const minimumPerception =
    base.chiffreAffaires > 0
      ? appliquerTaux(base.chiffreAffaires, bareme.tauxMinimum)
      : 0;

  const impotRetenu = Math.max(impotSurResultat, minimumPerception);
  const solde = impotRetenu - base.acomptesVerses;

  return {
    ...commun,
    impotSurResultat,
    minimumPerception,
    impotRetenu,
    minimumApplique: minimumPerception > impotSurResultat,
    soldeAPayer: solde > 0 ? solde : 0,
    creditImpot: solde < 0 ? -solde : 0,
    baremeManquant: false,
  };
}

/**
 * Comptes portant les acomptes d'impôt déjà versés.
 *
 * Leur solde débiteur s'impute sur l'impôt de l'exercice. Comme pour la TVA,
 * c'est la comptabilité qui fait foi : un montant ressaisi à la main finirait
 * par diverger des règlements réellement passés.
 */
export const COMPTES_ACOMPTES_IMPOT = ["4473", "441"] as const;
