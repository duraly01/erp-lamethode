// ---------------------------------------------------------------------------
// Balance et grand livre — module pur.
//
// Ces deux états sont les restitutions de base de la comptabilité générale, et
// la source à partir de laquelle seront calculés les états financiers puis la
// DSF (phase E2). Ils se déduisent entièrement des lignes d'écriture : aucun
// cumul n'est stocké en base, donc aucun cumul ne peut se désynchroniser.
//
// Toutes les entrées et sorties sont en centimes entiers (voir `money.ts`).
// ---------------------------------------------------------------------------

import { parseMontant, sommeMontants } from "./money";

/** Une ligne d'écriture validée, telle qu'on la lit en base. */
export type Mouvement = {
  compteId: number;
  compteNumero: string;
  compteLibelle: string;
  /** Montants tels que rendus par PostgreSQL pour une colonne `numeric`. */
  debit: string | number | null;
  credit: string | number | null;
};

/** Un mouvement enrichi de ce qu'il faut pour éditer un grand livre. */
export type MouvementDetaille = Mouvement & {
  ligneId: number;
  ecritureId: number;
  dateEcriture: string;
  numeroPiece: string | null;
  journalCode: string;
  libelle: string | null;
  tiersLibelle?: string | null;
  lettrage?: string | null;
};

export type LigneBalance = {
  compteId: number;
  compteNumero: string;
  compteLibelle: string;
  totalDebit: number;
  totalCredit: number;
  /** Solde débiteur, nul si le compte est créditeur. */
  soldeDebiteur: number;
  /** Solde créditeur, nul si le compte est débiteur. */
  soldeCrediteur: number;
};

/**
 * Agrège les mouvements par compte et présente les soldes en deux colonnes.
 *
 * La présentation en solde débiteur / solde créditeur est celle de la balance
 * SYSCOHADA : un compte n'a jamais les deux, et le total de chaque colonne doit
 * se retrouver à l'identique au bilan.
 *
 * Le tri suit le numéro de compte, en comparaison textuelle : c'est l'ordre du
 * plan comptable, où 4011 vient après 401 et avant 411.
 */
export function calculerBalance(mouvements: Mouvement[]): LigneBalance[] {
  const parCompte = new Map<
    number,
    { numero: string; libelle: string; debits: number[]; credits: number[] }
  >();

  for (const m of mouvements) {
    let agg = parCompte.get(m.compteId);
    if (!agg) {
      agg = {
        numero: m.compteNumero,
        libelle: m.compteLibelle,
        debits: [],
        credits: [],
      };
      parCompte.set(m.compteId, agg);
    }
    agg.debits.push(parseMontant(m.debit));
    agg.credits.push(parseMontant(m.credit));
  }

  const lignes: LigneBalance[] = [];
  for (const [compteId, agg] of parCompte) {
    const totalDebit = sommeMontants(agg.debits);
    const totalCredit = sommeMontants(agg.credits);
    const solde = totalDebit - totalCredit;
    lignes.push({
      compteId,
      compteNumero: agg.numero,
      compteLibelle: agg.libelle,
      totalDebit,
      totalCredit,
      soldeDebiteur: solde > 0 ? solde : 0,
      soldeCrediteur: solde < 0 ? -solde : 0,
    });
  }

  return lignes.sort((a, b) => a.compteNumero.localeCompare(b.compteNumero));
}

export type TotauxBalance = {
  totalDebit: number;
  totalCredit: number;
  totalSoldeDebiteur: number;
  totalSoldeCrediteur: number;
  /** Les quatre colonnes se répondent deux à deux. */
  equilibree: boolean;
};

/**
 * Totalise une balance et vérifie qu'elle est équilibrée.
 *
 * Un déséquilibre ici ne peut pas venir d'une erreur de saisie — chaque
 * écriture est équilibrée à la validation — mais d'un défaut d'intégrité :
 * lignes orphelines, écriture partiellement enregistrée. C'est donc un contrôle
 * de cohérence de la base, à afficher en tête de la balance.
 */
export function totauxBalance(lignes: LigneBalance[]): TotauxBalance {
  const totalDebit = sommeMontants(lignes.map((l) => l.totalDebit));
  const totalCredit = sommeMontants(lignes.map((l) => l.totalCredit));
  const totalSoldeDebiteur = sommeMontants(lignes.map((l) => l.soldeDebiteur));
  const totalSoldeCrediteur = sommeMontants(lignes.map((l) => l.soldeCrediteur));

  return {
    totalDebit,
    totalCredit,
    totalSoldeDebiteur,
    totalSoldeCrediteur,
    equilibree:
      totalDebit === totalCredit &&
      totalSoldeDebiteur === totalSoldeCrediteur,
  };
}

export type LigneGrandLivre = {
  ligneId: number;
  ecritureId: number;
  dateEcriture: string;
  numeroPiece: string | null;
  journalCode: string;
  libelle: string | null;
  tiersLibelle: string | null;
  lettrage: string | null;
  debit: number;
  credit: number;
  /** Solde cumulé du compte après cette ligne, positif = débiteur. */
  soldeProgressif: number;
};

export type CompteGrandLivre = {
  compteId: number;
  compteNumero: string;
  compteLibelle: string;
  /** Solde repris de la période antérieure, positif = débiteur. */
  soldeInitial: number;
  lignes: LigneGrandLivre[];
  totalDebit: number;
  totalCredit: number;
  soldeFinal: number;
};

/**
 * Construit le grand livre : les mouvements de chaque compte, dans l'ordre, avec
 * le solde cumulé après chaque ligne.
 *
 * Les lignes sont triées par date puis par numéro de pièce, et non par
 * identifiant : deux écritures saisies dans le désordre doivent apparaître dans
 * l'ordre chronologique. À date et pièce égales, l'identifiant départage pour
 * que le tri soit déterministe d'un appel à l'autre.
 */
export function calculerGrandLivre(
  mouvements: MouvementDetaille[],
  soldesInitiaux: Map<number, number> = new Map(),
): CompteGrandLivre[] {
  const parCompte = new Map<number, MouvementDetaille[]>();

  for (const m of mouvements) {
    const liste = parCompte.get(m.compteId);
    if (liste) liste.push(m);
    else parCompte.set(m.compteId, [m]);
  }

  const comptes: CompteGrandLivre[] = [];

  for (const [compteId, liste] of parCompte) {
    liste.sort(
      (a, b) =>
        a.dateEcriture.localeCompare(b.dateEcriture) ||
        (a.numeroPiece ?? "").localeCompare(b.numeroPiece ?? "") ||
        a.ligneId - b.ligneId,
    );

    const soldeInitial = soldesInitiaux.get(compteId) ?? 0;
    let solde = soldeInitial;
    const debits: number[] = [];
    const credits: number[] = [];

    const lignes: LigneGrandLivre[] = liste.map((m) => {
      const debit = parseMontant(m.debit);
      const credit = parseMontant(m.credit);
      debits.push(debit);
      credits.push(credit);
      solde += debit - credit;

      return {
        ligneId: m.ligneId,
        ecritureId: m.ecritureId,
        dateEcriture: m.dateEcriture,
        numeroPiece: m.numeroPiece,
        journalCode: m.journalCode,
        libelle: m.libelle ?? null,
        tiersLibelle: m.tiersLibelle ?? null,
        lettrage: m.lettrage ?? null,
        debit,
        credit,
        soldeProgressif: solde,
      };
    });

    comptes.push({
      compteId,
      compteNumero: liste[0].compteNumero,
      compteLibelle: liste[0].compteLibelle,
      soldeInitial,
      lignes,
      totalDebit: sommeMontants(debits),
      totalCredit: sommeMontants(credits),
      soldeFinal: solde,
    });
  }

  return comptes.sort((a, b) => a.compteNumero.localeCompare(b.compteNumero));
}

/**
 * Balance âgée : ventile le solde d'un tiers par ancienneté d'échéance.
 *
 * Sert au suivi des créances clients et des dettes fournisseurs. Les tranches
 * sont celles habituellement retenues en analyse du poste client.
 */
export type TrancheAge = "NON_ECHU" | "J1_30" | "J31_60" | "J61_90" | "J90_PLUS";

export function trancheAnciennete(
  dateEcheance: string | null,
  dateReference: string,
): TrancheAge {
  // Sans échéance connue, la créance est réputée non échue : on ne présume pas
  // d'un retard qui n'a pas été convenu.
  if (!dateEcheance) return "NON_ECHU";
  if (dateEcheance >= dateReference) return "NON_ECHU";

  const jours = Math.floor(
    (Date.parse(`${dateReference}T00:00:00Z`) -
      Date.parse(`${dateEcheance}T00:00:00Z`)) /
      86_400_000,
  );

  if (jours <= 30) return "J1_30";
  if (jours <= 60) return "J31_60";
  if (jours <= 90) return "J61_90";
  return "J90_PLUS";
}
