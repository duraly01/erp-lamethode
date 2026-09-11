// ---------------------------------------------------------------------------
// Clôture d'exercice et à-nouveaux — module pur (E3).
//
// Clôturer, c'est reprendre dans l'exercice suivant ce que le bilan porte à la
// clôture : les soldes des classes 1 à 5, et le résultat de l'exercice, qui
// n'existe encore dans aucun compte de bilan. Les comptes de gestion (6, 7, 8)
// ne se reprennent pas : ils repartent de zéro, c'est leur nature.
//
// La reprise est **détaillée** là où ça compte :
//
// - un compte de tiers lettrable reprend chaque ligne non lettrée, une par
//   une, avec son tiers et son échéance. Ainsi la facture de décembre se
//   lettre en janvier avec son règlement, et la balance âgée continue ;
// - un compte de banque rapprochable reprend chaque ligne non pointée, une
//   par une, et le total des lignes pointées en une seule. Ainsi le chèque
//   émis en décembre se pointe sur le relevé de janvier ;
// - tout autre compte reprend son solde net.
//
// Un compte déclaré à la fois lettrable et rapprochable — c'est le cas des
// banques du plan livré — suit la règle de la banque : le pointage prime.
//
// Une ligne lettrée fait partie d'un groupe qui se solde : elle ne pèse rien
// dans le solde et n'a pas à être reprise. C'est pourquoi la somme des lignes
// reprises d'un compte lettrable est exactement son solde.
//
// Montants en centimes entiers. L'écriture rendue est équilibrée par
// construction : c'est l'équilibre de la balance de clôture, reporté.
// ---------------------------------------------------------------------------

import { formatMontant, parseMontant, sommeMontants } from "./money";
import type { LigneGeneree } from "./generation";

/** Une ligne d'écriture de l'exercice à clôturer, avec ce que sa reprise doit savoir. */
export type LigneAReprendre = {
  ligneId: number;
  compteId: number;
  compteNumero: string;
  lettrable: boolean;
  rapprochable: boolean;
  tiersId: number | null;
  libelle: string | null;
  dateEcheance: string | null;
  debit: number;
  credit: number;
  lettrage: string | null;
  pointee: boolean;
};

export type ANouveaux = {
  lignes: LigneGeneree[];
  /** Résultat net repris, positif si bénéfice. */
  resultatNet: number;
  totalDebit: number;
  totalCredit: number;
  /** Nombre de lignes reprises en détail, pour information. */
  lignesDetaillees: number;
};

export class ClotureImpossibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClotureImpossibleError";
  }
}

const REPRISE = "Reprise à nouveau";

function ligne(
  compteId: number,
  solde: number,
  libelle: string,
  extra: Partial<LigneGeneree> = {},
): LigneGeneree | null {
  if (solde === 0) return null;
  return {
    compteId,
    libelle,
    ...(solde > 0 ? { debit: formatMontant(solde) } : { credit: formatMontant(-solde) }),
    ...extra,
  };
}

/**
 * Génère l'écriture d'à-nouveaux à partir des lignes de l'exercice clos.
 *
 * `comptesResultat` désigne les comptes qui reçoivent le résultat : 131 pour
 * un bénéfice, 139 pour une perte. Ils sont fournis, pas devinés — le plan
 * d'un contribuable peut les avoir renommés.
 */
export function genererANouveaux(
  lignesExercice: LigneAReprendre[],
  comptesResultat: { beneficeId: number; perteId: number },
): ANouveaux {
  const parCompte = new Map<number, LigneAReprendre[]>();
  for (const l of lignesExercice) {
    const liste = parCompte.get(l.compteId);
    if (liste) liste.push(l);
    else parCompte.set(l.compteId, [l]);
  }

  const lignes: LigneGeneree[] = [];
  const resultat: number[] = [];
  let lignesDetaillees = 0;

  const comptesTries = [...parCompte.entries()].sort(([, a], [, b]) =>
    a[0].compteNumero.localeCompare(b[0].compteNumero),
  );

  for (const [compteId, liste] of comptesTries) {
    const { compteNumero, lettrable, rapprochable } = liste[0];
    const classe = compteNumero[0];

    // Comptes de gestion : ils font le résultat, ils ne se reprennent pas.
    if (["6", "7", "8"].includes(classe)) {
      for (const l of liste) resultat.push(l.credit - l.debit);
      continue;
    }

    // Un compte de banque est souvent déclaré lettrable *et* rapprochable. Pour
    // lui, c'est le pointage qui dit ce que la banque a vu : il prime sur le
    // lettrage, et sa branche vient donc en premier.
    if (rapprochable) {
      // Non pointées : une par une, elles restent à retrouver sur un relevé.
      for (const l of liste.filter((x) => !x.pointee)) {
        const r = ligne(compteId, l.debit - l.credit, `${REPRISE} — ${l.libelle ?? compteNumero}`);
        if (r) {
          lignes.push(r);
          lignesDetaillees++;
        }
      }
      // Pointées : la banque les a vues, leur total suffit.
      const pointees = sommeMontants(liste.filter((x) => x.pointee).map((x) => x.debit - x.credit));
      const r = ligne(compteId, pointees, `${REPRISE} — solde rapproché à la clôture`);
      if (r) lignes.push(r);
      continue;
    }

    if (lettrable) {
      // Une ligne lettrée appartient à un groupe soldé : rien à reprendre.
      for (const l of liste.filter((x) => !x.lettrage)) {
        const r = ligne(compteId, l.debit - l.credit, `${REPRISE} — ${l.libelle ?? compteNumero}`, {
          tiersId: l.tiersId,
          dateEcheance: l.dateEcheance,
        });
        if (r) {
          lignes.push(r);
          lignesDetaillees++;
        }
      }
      continue;
    }

    const r = ligne(compteId, sommeMontants(liste.map((l) => l.debit - l.credit)), REPRISE);
    if (r) lignes.push(r);
  }

  // Le résultat de l'exercice entre au bilan de l'exercice suivant : au crédit
  // du 131 s'il est positif, au débit du 139 sinon. C'est lui qui équilibre la
  // reprise, puisqu'il faisait la contrepartie des actifs acquis dans l'année.
  const resultatNet = sommeMontants(resultat);
  if (resultatNet > 0) {
    lignes.push({ compteId: comptesResultat.beneficeId, libelle: `${REPRISE} — résultat de l'exercice (bénéfice)`, credit: formatMontant(resultatNet) });
  } else if (resultatNet < 0) {
    lignes.push({ compteId: comptesResultat.perteId, libelle: `${REPRISE} — résultat de l'exercice (perte)`, debit: formatMontant(-resultatNet) });
  }

  const totalDebit = sommeMontants(lignes.map((l) => parseMontant(l.debit ?? 0)));
  const totalCredit = sommeMontants(lignes.map((l) => parseMontant(l.credit ?? 0)));

  // Ne peut arriver que si les lignes fournies ne forment pas une balance
  // équilibrée — écritures partielles, brouillons glissés dans la liste. On
  // refuse : reprendre un déséquilibre le propagerait à tous les exercices.
  if (totalDebit !== totalCredit) {
    throw new ClotureImpossibleError(
      `Les à-nouveaux ne s'équilibrent pas (débit ${formatMontant(totalDebit)}, crédit ${formatMontant(totalCredit)}) : la balance de clôture n'est pas équilibrée.`,
    );
  }

  return { lignes, resultatNet, totalDebit, totalCredit, lignesDetaillees };
}
