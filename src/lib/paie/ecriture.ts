// ---------------------------------------------------------------------------
// Écriture de paie — module pur (E4).
//
// Un mois de paie validé se comptabilise en une écriture d'opérations
// diverses, pour l'ensemble des salariés :
//
//   Débit  6611 salaires, 6612 primes          — le brut versé
//   Débit  6641 charges sociales               — la CNPS patronale
//   Débit  6414 taxes sur salaires             — CFC patronal et FNE
//   Crédit 422  rémunérations dues             — le net à payer, par salarié
//   Crédit 421  avances et acomptes            — les acomptes retenus, par salarié
//   Crédit 423  oppositions et saisies         — les autres retenues
//   Crédit 431  CNPS                           — parts salariale et patronale
//   Crédit 4471 État, IRPP                     — IRPP et CAC
//   Crédit 442  État, autres impôts            — CFC, FNE, TDL, RAV
//
// Elle s'équilibre par construction : le net est le brut moins les
// retenues, et chaque retenue est créditée quelque part. Les avantages en
// nature n'y figurent pas — ils ne sont pas versés, leur coût est déjà
// dans les charges où il est né (loyer, carburant…).
//
// Les comptes 421 et 422 sont des collectifs : chaque salarié y a son
// compte individuel, un tiers, et sa ligne. C'est ce qui permet de lettrer
// le net dû avec son virement, salarié par salarié.
//
// Les comptes sont fournis, jamais devinés : le plan d'un contribuable
// peut différer du plan de référence.
// ---------------------------------------------------------------------------

import { formatMontant, parseMontant, sommeMontants } from "@/lib/comptable/money";
import type { LigneGeneree } from "@/lib/comptable/generation";

/** Totaux du mois, en centimes, tels que les bulletins les portent. */
export type TotauxPaie = {
  /** Salaires de base, absences déduites, heures supplémentaires comprises. */
  salaires: number;
  /** Primes et indemnités versées, cotisables ou non. */
  primes: number;
  cnpsSalarie: number;
  cnpsEmployeur: number;
  irpp: number;
  cac: number;
  cfcSalarie: number;
  cfcEmployeur: number;
  fne: number;
  tdl: number;
  rav: number;
  avances: number;
  autresRetenues: number;
  netAPayer: number;
  /** Ce qui est dû à chaque salarié, et ce qui lui est retenu d'acomptes. */
  parSalarie: { tiersId: number; libelle: string; netAPayer: number; avances: number }[];
};

/** Identifiants des comptes du plan du contribuable. `primes` peut manquer : elles vont alors avec les salaires. */
export type ComptesPaie = {
  salaires: number;
  primes: number | null;
  chargesSociales: number;
  taxesSalaires: number;
  remunerationsDues: number;
  avances: number;
  oppositions: number;
  cnps: number;
  irpp: number;
  autresImpots: number;
};

export class EcriturePaieError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcriturePaieError";
  }
}

function debit(compteId: number, montant: number, libelle: string): LigneGeneree | null {
  return montant > 0 ? { compteId, libelle, debit: formatMontant(montant) } : null;
}
function credit(compteId: number, montant: number, libelle: string, tiersId?: number): LigneGeneree | null {
  return montant > 0 ? { compteId, libelle, credit: formatMontant(montant), ...(tiersId ? { tiersId } : {}) } : null;
}

export function genererEcriturePaie(t: TotauxPaie, c: ComptesPaie, libelleMois: string): LigneGeneree[] {
  const lignes = [
    debit(c.salaires, t.salaires + (c.primes ? 0 : t.primes), `Salaires ${libelleMois}`),
    c.primes ? debit(c.primes, t.primes, `Primes et indemnités ${libelleMois}`) : null,
    debit(c.chargesSociales, t.cnpsEmployeur, `CNPS part patronale ${libelleMois}`),
    debit(c.taxesSalaires, t.cfcEmployeur + t.fne, `CFC patronal et FNE ${libelleMois}`),
    ...t.parSalarie.map((s) => credit(c.remunerationsDues, s.netAPayer, `Net à payer ${libelleMois} — ${s.libelle}`, s.tiersId)),
    ...t.parSalarie.map((s) => credit(c.avances, s.avances, `Acomptes retenus ${libelleMois} — ${s.libelle}`, s.tiersId)),
    credit(c.oppositions, t.autresRetenues, `Retenues diverses ${libelleMois}`),
    credit(c.cnps, t.cnpsSalarie + t.cnpsEmployeur, `CNPS ${libelleMois}`),
    credit(c.irpp, t.irpp + t.cac, `IRPP et CAC ${libelleMois}`),
    credit(c.autresImpots, t.cfcSalarie + t.cfcEmployeur + t.fne + t.tdl + t.rav, `CFC, FNE, TDL, RAV ${libelleMois}`),
  ].filter((l): l is LigneGeneree => l !== null);

  const totalDebit = sommeMontants(lignes.map((l) => parseMontant(l.debit ?? 0)));
  const totalCredit = sommeMontants(lignes.map((l) => parseMontant(l.credit ?? 0)));
  const netParSalarie = sommeMontants(t.parSalarie.map((s) => s.netAPayer));
  const avancesParSalarie = sommeMontants(t.parSalarie.map((s) => s.avances));
  if (netParSalarie !== t.netAPayer || avancesParSalarie !== t.avances) {
    throw new EcriturePaieError("Le détail par salarié ne fait pas le total du mois.");
  }
  if (totalDebit !== totalCredit) {
    throw new EcriturePaieError(
      `L'écriture de paie ne s'équilibre pas (débit ${formatMontant(totalDebit)}, crédit ${formatMontant(totalCredit)}) : les totaux des bulletins sont incohérents.`,
    );
  }
  return lignes;
}

// ---------------------------------------------------------------------------
// Règlement des salaires
// ---------------------------------------------------------------------------

/**
 * Le net d'un bulletin à payer : le tiers du salarié, ce qu'on lui doit.
 */
export type SalaireARegler = {
  tiersId: number;
  libelle: string;
  netAPayer: number;
};

/**
 * Écriture de règlement des salaires, sur un journal de trésorerie :
 *
 *   Débit  422 rémunérations dues   — le net, par salarié, sur son tiers
 *   Crédit 521 banque ou 571 caisse — le total versé
 *
 * Une ligne de débit par salarié, sur son tiers : c'est ce qui permet de la
 * lettrer avec le net crédité par l'écriture de paie, salarié par salarié.
 * Un bulletin à net nul n'a rien à régler et ne produit pas de ligne.
 */
export function genererEcritureReglementSalaires(
  salaires: SalaireARegler[],
  comptes: { remunerationsDues: number; tresorerie: number },
  libelleMois: string,
): LigneGeneree[] {
  const dus = salaires.filter((s) => s.netAPayer > 0);
  if (dus.length === 0) throw new EcriturePaieError("Aucun net à régler.");
  if (dus.some((s) => !Number.isSafeInteger(s.netAPayer))) {
    throw new EcriturePaieError("Un net à payer n'est pas un montant valide.");
  }
  const total = sommeMontants(dus.map((s) => s.netAPayer));
  return [
    ...dus.map((s) => ({
      compteId: comptes.remunerationsDues,
      tiersId: s.tiersId,
      libelle: `Salaire ${libelleMois} — ${s.libelle}`,
      debit: formatMontant(s.netAPayer),
    })),
    { compteId: comptes.tresorerie, libelle: `Salaires ${libelleMois}`, credit: formatMontant(total) },
  ];
}
