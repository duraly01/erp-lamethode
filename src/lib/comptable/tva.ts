// ---------------------------------------------------------------------------
// Déclaration de TVA, déduite de la comptabilité — module pur.
//
// Aucun taux n'intervient ici : les taux ont déjà joué à la saisie, et ce qui
// se déclare est le contenu des comptes de TVA. Recalculer la taxe à partir des
// bases ferait diverger la déclaration des livres ; on la lit, on ne la refait
// pas.
//
// Montants en centimes entiers (voir `money.ts`).
// ---------------------------------------------------------------------------

import { sommeMontants } from "./money";
import type { LigneBalance } from "./balance";

/**
 * Comptes de TVA, par rôle dans la déclaration.
 *
 * Écrit en données, comme le rattachement aux postes des états financiers : un
 * plan comptable enrichi d'un 4433 ou d'un 4455 est pris en compte sans
 * toucher au code. Les préfixes ne se recouvrent pas — 4441 et 4449 sont plus
 * précis que 444, qui n'est pas utilisé ici.
 */
export const COMPTES_TVA = {
  /** TVA facturée aux clients, créditrice. */
  collectee: ["443"],
  /** TVA supportée sur les achats, débitrice et récupérable. */
  deductible: ["445"],
  /** Crédit de TVA reporté d'une période sur l'autre, débiteur. */
  creditAReporter: ["4449"],
  /** TVA à décaisser, une fois la déclaration liquidée. */
  due: ["4441"],
} as const;

export type LigneTva = {
  compteNumero: string;
  compteLibelle: string;
  /** Montant net dans le sens du poste : positif dans le cas normal. */
  montant: number;
  totalDebit: number;
  totalCredit: number;
};

export type DeclarationTva = {
  periode: string;
  dateDebut: string;
  dateFin: string;
  collectee: LigneTva[];
  deductible: LigneTva[];
  totalCollectee: number;
  totalDeductible: number;
  /** Crédit de TVA venu des périodes précédentes, positif. */
  creditAnterieur: number;
  /**
   * Solde que les comptes de TVA traînent depuis les périodes antérieures.
   *
   * Il devrait être nul : chaque mois déclaré se solde par une écriture de
   * liquidation qui vide 443x et 445x vers la TVA due ou le crédit à reporter.
   * Un solde résiduel signale des mois non liquidés — et donc un crédit
   * antérieur potentiellement absent du calcul, puisque celui-ci se lit sur le
   * compte de report, qu'aucune écriture n'a alimenté.
   */
  tvaAnterieureNonLiquidee: number;
  /** Montant à décaisser, nul si la période dégage un crédit. */
  tvaDue: number;
  /** Crédit reporté sur la période suivante, nul si la TVA est due. */
  creditAReporter: number;
};

function correspond(numero: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => numero.startsWith(p));
}

/**
 * Une ligne de TVA, présentée dans son sens naturel.
 *
 * La TVA collectée est créditrice, la déductible débitrice. Un avoir inverse le
 * sens d'un mouvement sans changer sa nature : c'est le **net** de la période
 * qui se déclare, et il peut être négatif si les avoirs l'emportent.
 */
function ligne(l: LigneBalance, sens: "CREDIT" | "DEBIT"): LigneTva {
  const net =
    sens === "CREDIT"
      ? l.soldeCrediteur - l.soldeDebiteur
      : l.soldeDebiteur - l.soldeCrediteur;

  return {
    compteNumero: l.compteNumero,
    compteLibelle: l.compteLibelle,
    montant: net,
    totalDebit: l.totalDebit,
    totalCredit: l.totalCredit,
  };
}

/**
 * Déclaration de TVA d'une période.
 *
 * `mouvements` doit porter **les mouvements de la période seule**, pas les
 * soldes cumulés depuis l'ouverture de l'exercice : la TVA se déclare par
 * période, et un cumul ferait redéclarer ce qui l'a déjà été.
 *
 * `anterieur.credit` est le solde débiteur du compte de crédit de TVA à la
 * veille de la période. Il vient du même endroit que le reste — la
 * comptabilité — et non d'une saisie manuelle qui pourrait en diverger.
 *
 * `anterieur.nonLiquidee` accompagne le calcul sans l'altérer : il dit si les
 * périodes précédentes ont bien été soldées, ce dont dépend la justesse du
 * crédit reporté.
 */
export function calculerTva(
  mouvements: LigneBalance[],
  anterieur: { credit: number; nonLiquidee: number },
  periode: { code: string; dateDebut: string; dateFin: string },
): DeclarationTva {
  const collectee = mouvements
    .filter((l) => correspond(l.compteNumero, COMPTES_TVA.collectee))
    .map((l) => ligne(l, "CREDIT"));

  const deductible = mouvements
    .filter((l) => correspond(l.compteNumero, COMPTES_TVA.deductible))
    .map((l) => ligne(l, "DEBIT"));

  const totalCollectee = sommeMontants(collectee.map((l) => l.montant));
  const totalDeductible = sommeMontants(deductible.map((l) => l.montant));

  const solde = totalCollectee - totalDeductible - anterieur.credit;

  return {
    periode: periode.code,
    dateDebut: periode.dateDebut,
    dateFin: periode.dateFin,
    collectee,
    deductible,
    totalCollectee,
    totalDeductible,
    creditAnterieur: anterieur.credit,
    tvaAnterieureNonLiquidee: anterieur.nonLiquidee,
    tvaDue: solde > 0 ? solde : 0,
    creditAReporter: solde < 0 ? -solde : 0,
  };
}

/**
 * Crédit de TVA reporté, lu sur le compte dédié à une date donnée.
 *
 * Le compte est débiteur quand un crédit court. Un solde créditeur y serait
 * anormal : on le ramène à zéro plutôt que de le déclarer en négatif, ce qui
 * reviendrait à réclamer une TVA que ce compte ne constate pas.
 */
export function creditTvaAnterieur(soldes: LigneBalance[]): number {
  const credits = soldes
    .filter((l) => correspond(l.compteNumero, COMPTES_TVA.creditAReporter))
    .map((l) => l.soldeDebiteur - l.soldeCrediteur);

  const total = sommeMontants(credits);
  return total > 0 ? total : 0;
}

/**
 * Découpe une période de déclaration mensuelle.
 *
 * `periode` est au format « AAAA-MM », celui de la table `declarations`. Le
 * dernier jour se calcule en UTC — le jour 0 du mois suivant — pour ne pas
 * dépendre du fuseau de la machine.
 */
export function bornesPeriodeMensuelle(periode: string): {
  code: string;
  dateDebut: string;
  dateFin: string;
} {
  const m = /^(\d{4})-(\d{2})$/.exec(periode);
  if (!m) {
    throw new Error(`Période invalide : ${periode} (attendu « AAAA-MM »).`);
  }

  const annee = Number(m[1]);
  const mois = Number(m[2]);
  if (mois < 1 || mois > 12) {
    throw new Error(`Mois invalide : ${periode}.`);
  }

  const fin = new Date(Date.UTC(annee, mois, 0));
  return {
    code: periode,
    dateDebut: `${periode}-01`,
    dateFin: fin.toISOString().slice(0, 10),
  };
}

/**
 * Solde des comptes de TVA à la veille d'une période.
 *
 * Nul quand chaque période antérieure a été liquidée. Positif, il signale une
 * TVA collectée jamais déclarée ; négatif, une TVA déductible jamais imputée —
 * dans les deux cas, le crédit antérieur lu sur le compte de report ne raconte
 * pas toute l'histoire, et la déclaration doit le dire plutôt que de présenter
 * un montant qui a l'air complet.
 */
export function tvaAnterieureNonLiquidee(soldes: LigneBalance[]): number {
  const net = (prefixes: readonly string[], sens: "CREDIT" | "DEBIT") =>
    sommeMontants(
      soldes
        .filter((l) => correspond(l.compteNumero, prefixes))
        .map((l) =>
          sens === "CREDIT"
            ? l.soldeCrediteur - l.soldeDebiteur
            : l.soldeDebiteur - l.soldeCrediteur,
        ),
    );

  return net(COMPTES_TVA.collectee, "CREDIT") - net(COMPTES_TVA.deductible, "DEBIT");
}
