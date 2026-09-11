// ---------------------------------------------------------------------------
// Génération d'écritures depuis des pièces — module pur (E3).
//
// Une facture, un règlement, une déclaration de TVA : ces pièces se traduisent
// toujours par la même écriture, à quelques comptes près. Les écrire ici une
// fois pour toutes évite deux choses au comptable — retaper ce que la pièce
// dit déjà, et se tromper de sens sur la TVA.
//
// Les écritures produites sont équilibrées **par construction** : le montant
// porté au compte de tiers est la somme exacte des lignes qui lui font face.
// Elles sont ensuite soumises au même `validerEcriture` que la saisie
// manuelle, qui n'accorde aucun passe-droit à une écriture générée.
//
// Les montants entrent et sortent en centimes entiers ; les lignes rendues
// portent des chaînes « 1234.56 », prêtes pour la persistance.
// ---------------------------------------------------------------------------

import { appliquerTaux, formatMontant, sommeMontants } from "./money";
import type { DeclarationTva } from "./tva";

export type LigneGeneree = {
  compteId: number;
  tiersId?: number | null;
  libelle: string;
  debit?: string;
  credit?: string;
  dateEcheance?: string | null;
};

export type EcritureGeneree = {
  libelle: string;
  reference: string | null;
  lignes: LigneGeneree[];
  /** Total toutes taxes comprises, en centimes — ce que doit ou reçoit le tiers. */
  totalTtc: number;
  totalHt: number;
  totalTva: number;
};

/** Une taxe telle qu'elle est paramétrée : son taux et le compte qui la reçoit. */
export type TaxeApplicable = {
  id: number;
  taux: string | number;
  compteId: number;
};

/** Une ligne de facture : un compte de charge ou de produit, un montant HT, une taxe ou aucune. */
export type LignePiece = {
  compteId: number;
  libelle?: string | null;
  montantHt: number;
  taxe?: TaxeApplicable | null;
};

export type Tiers = {
  id: number;
  /** Compte collectif auquel le tiers est rattaché : un 411 ou un 401. */
  compteId: number;
  raisonSociale: string;
};

export class PieceInvalideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PieceInvalideError";
  }
}

function montant(centimes: number) {
  return formatMontant(centimes);
}

/**
 * Regroupe la TVA par taxe et l'applique sur la base cumulée.
 *
 * La taxe se calcule sur le total hors taxes par taux, et non ligne par ligne
 * arrondie : c'est ainsi qu'elle figure sur la facture, et c'est ce qui évite
 * qu'une somme d'arrondis diverge du montant facturé. L'impression de la
 * pièce réutilise cette ventilation, pour que le document porte la TVA qui a
 * été comptabilisée.
 */
export function tvaParTaxe<T extends Pick<TaxeApplicable, "id" | "taux">>(
  lignes: { montantHt: number; taxe?: T | null }[],
): { taxe: T; base: number; montant: number }[] {
  const bases = new Map<number, { taxe: T; base: number[] }>();
  for (const l of lignes) {
    if (!l.taxe) continue;
    const e = bases.get(l.taxe.id);
    if (e) e.base.push(l.montantHt);
    else bases.set(l.taxe.id, { taxe: l.taxe, base: [l.montantHt] });
  }
  return [...bases.values()].map(({ taxe, base }) => {
    const total = sommeMontants(base);
    return { taxe, base: total, montant: appliquerTaux(total, taxe.taux) };
  });
}

function verifierLignes(lignes: LignePiece[]) {
  if (lignes.length === 0) {
    throw new PieceInvalideError("Une pièce doit comporter au moins une ligne.");
  }
  for (const l of lignes) {
    if (!Number.isSafeInteger(l.montantHt) || l.montantHt <= 0) {
      throw new PieceInvalideError(
        "Chaque ligne doit porter un montant hors taxes strictement positif ; un avoir se saisit comme tel.",
      );
    }
  }
}

/**
 * Facture de vente : le client doit le TTC, les produits sont constatés HT,
 * la TVA collectée est due à l'État.
 *
 *   D 411 client (TTC)   |
 *                        | C 70x produits (HT)
 *                        | C 4431 TVA collectée
 */
export function genererFactureVente(p: {
  client: Tiers;
  lignes: LignePiece[];
  reference?: string | null;
  dateEcheance?: string | null;
}): EcritureGeneree {
  verifierLignes(p.lignes);

  const totalHt = sommeMontants(p.lignes.map((l) => l.montantHt));
  const taxes = tvaParTaxe(p.lignes);
  const totalTva = sommeMontants(taxes.map((t) => t.montant));
  const totalTtc = totalHt + totalTva;
  const libelle = `Facture ${p.reference ?? ""} — ${p.client.raisonSociale}`.replace(/\s+—/, " —");

  const lignes: LigneGeneree[] = [
    {
      compteId: p.client.compteId,
      tiersId: p.client.id,
      libelle,
      debit: montant(totalTtc),
      dateEcheance: p.dateEcheance ?? null,
    },
    ...p.lignes.map((l) => ({
      compteId: l.compteId,
      libelle: l.libelle ?? libelle,
      credit: montant(l.montantHt),
    })),
    ...taxes
      .filter((t) => t.montant > 0)
      .map((t) => ({
        compteId: t.taxe.compteId,
        libelle: `TVA collectée — ${libelle}`,
        credit: montant(t.montant),
      })),
  ];

  return { libelle, reference: p.reference ?? null, lignes, totalTtc, totalHt, totalTva };
}

/**
 * Facture d'achat : les charges sont constatées HT, la TVA est récupérable,
 * le fournisseur est dû pour le TTC.
 *
 *   D 6xx charges (HT)        |
 *   D 4452 TVA récupérable    |
 *                             | C 401 fournisseur (TTC)
 */
export function genererFactureAchat(p: {
  fournisseur: Tiers;
  lignes: LignePiece[];
  reference?: string | null;
  dateEcheance?: string | null;
}): EcritureGeneree {
  verifierLignes(p.lignes);

  const totalHt = sommeMontants(p.lignes.map((l) => l.montantHt));
  const taxes = tvaParTaxe(p.lignes);
  const totalTva = sommeMontants(taxes.map((t) => t.montant));
  const totalTtc = totalHt + totalTva;
  const libelle = `Facture ${p.reference ?? ""} — ${p.fournisseur.raisonSociale}`.replace(/\s+—/, " —");

  const lignes: LigneGeneree[] = [
    ...p.lignes.map((l) => ({
      compteId: l.compteId,
      libelle: l.libelle ?? libelle,
      debit: montant(l.montantHt),
    })),
    ...taxes
      .filter((t) => t.montant > 0)
      .map((t) => ({
        compteId: t.taxe.compteId,
        libelle: `TVA déductible — ${libelle}`,
        debit: montant(t.montant),
      })),
    {
      compteId: p.fournisseur.compteId,
      tiersId: p.fournisseur.id,
      libelle,
      credit: montant(totalTtc),
      dateEcheance: p.dateEcheance ?? null,
    },
  ];

  return { libelle, reference: p.reference ?? null, lignes, totalTtc, totalHt, totalTva };
}

/**
 * Règlement d'un tiers, dans un sens ou dans l'autre.
 *
 * Un encaissement client : D trésorerie / C client. Un décaissement
 * fournisseur : D fournisseur / C trésorerie. Le sens n'est pas déduit du
 * type de tiers — un client peut être remboursé, un fournisseur peut verser
 * un avoir — il est dit explicitement.
 */
export function genererReglement(p: {
  tiers: Tiers;
  compteTresorerieId: number;
  montant: number;
  sens: "ENCAISSEMENT" | "DECAISSEMENT";
  reference?: string | null;
}): EcritureGeneree {
  if (!Number.isSafeInteger(p.montant) || p.montant <= 0) {
    throw new PieceInvalideError("Un règlement porte un montant strictement positif.");
  }

  const libelle = `${p.sens === "ENCAISSEMENT" ? "Encaissement" : "Règlement"} ${p.reference ?? ""} — ${p.tiers.raisonSociale}`.replace(/\s+—/, " —");
  const m = montant(p.montant);

  const lignes: LigneGeneree[] =
    p.sens === "ENCAISSEMENT"
      ? [
          { compteId: p.compteTresorerieId, libelle, debit: m },
          { compteId: p.tiers.compteId, tiersId: p.tiers.id, libelle, credit: m },
        ]
      : [
          { compteId: p.tiers.compteId, tiersId: p.tiers.id, libelle, debit: m },
          { compteId: p.compteTresorerieId, libelle, credit: m },
        ];

  return {
    libelle,
    reference: p.reference ?? null,
    lignes,
    totalTtc: p.montant,
    totalHt: p.montant,
    totalTva: 0,
  };
}

/**
 * Écriture de liquidation de la TVA d'un mois.
 *
 * Elle solde les comptes de TVA collectée et déductible de la période, impute
 * le crédit antérieur, et constate soit une TVA à décaisser, soit un nouveau
 * crédit à reporter :
 *
 *   D 443x collectée (solde)      |
 *                                 | C 445x déductible (solde)
 *                                 | C 4449 crédit antérieur (imputé)
 *                                 | C 4441 TVA due          — ou —
 *   D 4449 crédit à reporter      |
 *
 * C'est cette écriture que le calcul de la TVA attend : sans elle, le compte
 * 4449 ne porte jamais le crédit, et le mois suivant ne le voit pas.
 */
export function genererLiquidationTva(
  declaration: DeclarationTva,
  comptes: { parNumero: (numero: string) => number; tvaDueId: number; creditAReporterId: number },
): EcritureGeneree {
  const libelle = `Liquidation de la TVA — ${declaration.periode}`;
  const lignes: LigneGeneree[] = [];

  for (const l of declaration.collectee) {
    if (l.montant === 0) continue;
    const id = comptes.parNumero(l.compteNumero);
    // Une collectée nette négative (avoirs l'emportant) se solde au crédit.
    lignes.push(
      l.montant > 0
        ? { compteId: id, libelle, debit: montant(l.montant) }
        : { compteId: id, libelle, credit: montant(-l.montant) },
    );
  }
  for (const l of declaration.deductible) {
    if (l.montant === 0) continue;
    const id = comptes.parNumero(l.compteNumero);
    lignes.push(
      l.montant > 0
        ? { compteId: id, libelle, credit: montant(l.montant) }
        : { compteId: id, libelle, debit: montant(-l.montant) },
    );
  }
  if (declaration.creditAnterieur > 0) {
    lignes.push({
      compteId: comptes.creditAReporterId,
      libelle: `${libelle} — imputation du crédit antérieur`,
      credit: montant(declaration.creditAnterieur),
    });
  }
  if (declaration.tvaDue > 0) {
    lignes.push({ compteId: comptes.tvaDueId, libelle, credit: montant(declaration.tvaDue) });
  }
  if (declaration.creditAReporter > 0) {
    lignes.push({
      compteId: comptes.creditAReporterId,
      libelle: `${libelle} — crédit à reporter`,
      debit: montant(declaration.creditAReporter),
    });
  }

  if (lignes.length === 0) {
    throw new PieceInvalideError(
      `Rien à liquider pour ${declaration.periode} : aucun mouvement de TVA sur la période.`,
    );
  }

  return {
    libelle,
    reference: declaration.periode,
    lignes,
    totalTtc: declaration.tvaDue,
    totalHt: 0,
    totalTva: declaration.tvaDue,
  };
}
