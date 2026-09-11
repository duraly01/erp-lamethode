// ---------------------------------------------------------------------------
// Rapprochement bancaire — module pur (E3).
//
// Les livres et la banque ne voient pas les mêmes opérations au même moment :
// un chèque émis figure dans les livres avant que la banque ne le paie, un
// virement reçu figure sur le relevé avant d'être saisi. L'état de
// rapprochement part du solde comptable, neutralise ce que la banque n'a pas
// encore vu, et doit retomber sur le solde du relevé.
//
// Ce qui reste — l'écart — est ce que les livres ignorent encore : des frais,
// des agios, un encaissement non saisi, ou une erreur. Il ne se force pas ; il
// s'explique par une écriture, puis disparaît.
//
// Montants en centimes entiers. Le compte de banque est un compte d'actif :
// un débit y est une entrée d'argent, un crédit une sortie.
// ---------------------------------------------------------------------------

import { sommeMontants } from "./money";

/** Une ligne d'écriture sur le compte de banque, telle que les livres la portent. */
export type LigneBancaire = {
  ligneId: number;
  ecritureId: number;
  dateEcriture: string;
  numeroPiece: string | null;
  libelle: string | null;
  tiersLibelle: string | null;
  debit: number;
  credit: number;
  /** Vrai si la ligne a été retrouvée sur un relevé, dans ce rapprochement ou un précédent. */
  pointee: boolean;
};

export type EtatRapprochement = {
  soldeComptable: number;
  soldeReleve: number;
  /** Entrées d'argent dans les livres que la banque n'a pas encore créditées. */
  debitsNonPointes: number;
  /** Sorties d'argent dans les livres que la banque n'a pas encore débitées. */
  creditsNonPointes: number;
  /** Solde comptable ramené à ce que la banque devrait montrer. */
  soldeRapproche: number;
  /** `soldeReleve − soldeRapproche`. Nul, le rapprochement est juste. */
  ecart: number;
  juste: boolean;
  nonPointees: LigneBancaire[];
  pointees: LigneBancaire[];
};

/**
 * Calcule l'état de rapprochement.
 *
 * `soldeComptable` est le solde du compte dans les livres à la date du
 * rapprochement, positif s'il est débiteur — c'est-à-dire si l'entreprise a
 * de l'argent à la banque. `soldeReleve` est celui qu'annonce la banque à la
 * même date, positif si le compte est créditeur *chez elle*, ce qui revient
 * au même vu de l'entreprise.
 */
export function calculerRapprochement(
  soldeComptable: number,
  soldeReleve: number,
  lignes: LigneBancaire[],
): EtatRapprochement {
  const nonPointees = lignes.filter((l) => !l.pointee);
  const pointees = lignes.filter((l) => l.pointee);

  const debitsNonPointes = sommeMontants(nonPointees.map((l) => l.debit));
  const creditsNonPointes = sommeMontants(nonPointees.map((l) => l.credit));

  // Ce que la banque n'a pas encore crédité gonfle les livres par rapport à
  // elle ; ce qu'elle n'a pas encore débité les dégonfle. On corrige les deux.
  const soldeRapproche = soldeComptable - debitsNonPointes + creditsNonPointes;
  const ecart = soldeReleve - soldeRapproche;

  return {
    soldeComptable,
    soldeReleve,
    debitsNonPointes,
    creditsNonPointes,
    soldeRapproche,
    ecart: ecart === 0 ? 0 : ecart,
    juste: ecart === 0,
    nonPointees,
    pointees,
  };
}

/**
 * Propose les lignes qui, pointées ensemble, annuleraient l'écart.
 *
 * Cas fréquent : le relevé est saisi, tout est pointé sauf quelques lignes, et
 * l'écart correspond exactement à l'une d'elles ou à deux d'entre elles. On
 * cherche d'abord une ligne seule, puis une paire — au-delà, la combinatoire
 * n'aide plus le comptable, elle le noie.
 *
 * Pointer une ligne la retire des non-pointées : le solde rapproché remonte
 * du montant d'un débit, redescend de celui d'un crédit. L'écart varie donc
 * de `−debit + credit` quand on pointe une ligne.
 */
export function proposerPointage(etat: EtatRapprochement): LigneBancaire[] | null {
  if (etat.juste) return null;
  const effet = (l: LigneBancaire) => -l.debit + l.credit;
  const candidates = etat.nonPointees;

  for (const l of candidates) {
    if (etat.ecart + effet(l) === 0) return [l];
  }
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (etat.ecart + effet(candidates[i]) + effet(candidates[j]) === 0) {
        return [candidates[i], candidates[j]];
      }
    }
  }
  return null;
}
