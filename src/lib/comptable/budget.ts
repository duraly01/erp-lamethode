// ---------------------------------------------------------------------------
// Budget et contrôle budgétaire — module pur (E6).
//
// Un budget est une prévision de charges et de produits sur un exercice,
// compte par compte et, quand il s'appuie sur un axe analytique, section
// par section. Le contrôle budgétaire le confronte au réalisé à une date :
// ce qui était prévu jusque-là, ce qui a été constaté, l'écart.
//
// La prévision annuelle se mensualise, uniformément ou selon des poids —
// une boulangerie ne vend pas pareil en décembre et en août. Le budget « à
// date » est la somme des mois entamés : celui en cours compte entier, pour
// que la comparaison se fasse à fin de mois, comme on la lit d'ordinaire.
//
// Montants en centimes entiers.
// ---------------------------------------------------------------------------

import { repartirParCle } from "./analytique";
import { sommeMontants } from "./money";

export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetError";
  }
}

/**
 * Les mois d'un exercice, en montants : uniforme à défaut de poids, sinon
 * selon les poids fournis — un par mois, dans l'ordre de l'exercice.
 */
export function mensualiser(montantAnnuel: number, nbMois: number, poids: number[] | null | undefined): number[] {
  if (!Number.isInteger(nbMois) || nbMois <= 0) throw new BudgetError("Un exercice compte au moins un mois.");
  if (!Number.isSafeInteger(montantAnnuel) || montantAnnuel < 0) throw new BudgetError("Le montant annuel doit être un montant positif ou nul.");
  if (poids && poids.length !== nbMois) throw new BudgetError(`La mensualisation attend ${nbMois} poids, un par mois.`);
  if (montantAnnuel === 0) return Array(nbMois).fill(0);
  const cle = (poids ?? Array(nbMois).fill(1)).map((p, i) => ({ sectionId: i, poids: p }));
  if (cle.every((c) => c.poids <= 0)) throw new BudgetError("La mensualisation n'a aucun poids.");
  const parts = repartirParCle(montantAnnuel, cle);
  const mois = Array(nbMois).fill(0) as number[];
  for (const p of parts) mois[p.sectionId] = p.montant;
  return mois;
}

/** Budget cumulé des `moisEcoules` premiers mois. */
export function budgetADate(montantAnnuel: number, nbMois: number, poids: number[] | null | undefined, moisEcoules: number): number {
  const mois = mensualiser(montantAnnuel, nbMois, poids);
  return sommeMontants(mois.slice(0, Math.max(0, Math.min(moisEcoules, nbMois))));
}

/** Nombre de mois de l'exercice entamés à la date, celui en cours compris. */
export function moisEntames(dateDebut: string, date: string): number {
  const [a1, m1] = dateDebut.split("-").map(Number);
  const [a2, m2] = date.split("-").map(Number);
  return Math.max(0, (a2 - a1) * 12 + (m2 - m1) + 1);
}

// ---------------------------------------------------------------------------
// Contrôle
// ---------------------------------------------------------------------------

export type LigneBudget = {
  id: number;
  compteNumero: string;
  compteLibelle: string;
  sectionId: number | null;
  montantAnnuel: number;
  mensualisation: number[] | null;
};

/** Le réalisé d'un compte — et d'une section, si le budget en a — : charge ou produit net, positif dans son sens. */
export type Realise = {
  compteNumero: string;
  compteLibelle: string;
  sectionId: number | null;
  montant: number;
};

export type LigneControle = {
  compteNumero: string;
  compteLibelle: string;
  sectionId: number | null;
  nature: "CHARGE" | "PRODUIT";
  budgetAnnuel: number;
  budgetADate: number;
  realise: number;
  /** Réalisé moins budget à date : positif, on a dépensé ou vendu plus que prévu. */
  ecart: number;
  /** Écart rapporté au budget à date, en pourcentage ; null sans budget. */
  ecartPct: number | null;
  /** Réalisé rapporté au budget annuel, en pourcentage ; null sans budget. */
  consommationPct: number | null;
  /** Vrai pour une ligne réalisée sans prévision. */
  horsBudget: boolean;
};

export type Totaux = { budgetAnnuel: number; budgetADate: number; realise: number; ecart: number };

export type Controle = {
  moisEcoules: number;
  nbMois: number;
  lignes: LigneControle[];
  charges: Totaux;
  produits: Totaux;
  /** Produits moins charges. */
  resultat: Totaux;
};

function nature(numero: string): "CHARGE" | "PRODUIT" {
  return numero.startsWith("6") || (numero.startsWith("8") && Number(numero[1]) % 2 === 1) ? "CHARGE" : "PRODUIT";
}

function pct(part: number, base: number): number | null {
  return base === 0 ? null : Math.round((part / base) * 1000) / 10;
}

/**
 * Confronte le budget au réalisé : une ligne par couple compte/section
 * prévu, plus une pour chaque couple réalisé sans prévision — c'est
 * souvent là que se cache la mauvaise nouvelle.
 */
export function controleBudgetaire(budget: LigneBudget[], realises: Realise[], nbMois: number, moisEcoules: number): Controle {
  const cle = (compteNumero: string, sectionId: number | null) => `${compteNumero}|${sectionId ?? ""}`;
  const parCle = new Map<string, LigneControle>();

  for (const b of budget) {
    const k = cle(b.compteNumero, b.sectionId);
    const existante = parCle.get(k);
    const aDate = budgetADate(b.montantAnnuel, nbMois, b.mensualisation, moisEcoules);
    if (existante) {
      existante.budgetAnnuel += b.montantAnnuel;
      existante.budgetADate += aDate;
    } else {
      parCle.set(k, {
        compteNumero: b.compteNumero,
        compteLibelle: b.compteLibelle,
        sectionId: b.sectionId,
        nature: nature(b.compteNumero),
        budgetAnnuel: b.montantAnnuel,
        budgetADate: aDate,
        realise: 0,
        ecart: 0,
        ecartPct: null,
        consommationPct: null,
        horsBudget: false,
      });
    }
  }
  for (const r of realises) {
    if (r.montant === 0) continue;
    const k = cle(r.compteNumero, r.sectionId);
    let l = parCle.get(k);
    if (!l) {
      l = {
        compteNumero: r.compteNumero,
        compteLibelle: r.compteLibelle,
        sectionId: r.sectionId,
        nature: nature(r.compteNumero),
        budgetAnnuel: 0,
        budgetADate: 0,
        realise: 0,
        ecart: 0,
        ecartPct: null,
        consommationPct: null,
        horsBudget: true,
      };
      parCle.set(k, l);
    }
    l.realise += r.montant;
  }

  const lignes = [...parCle.values()]
    .map((l) => ({
      ...l,
      ecart: l.realise - l.budgetADate,
      ecartPct: pct(l.realise - l.budgetADate, l.budgetADate),
      consommationPct: pct(l.realise, l.budgetAnnuel),
    }))
    .sort((a, b) => a.compteNumero.localeCompare(b.compteNumero) || (a.sectionId ?? 0) - (b.sectionId ?? 0));

  const totaux = (n: "CHARGE" | "PRODUIT"): Totaux => {
    const siennes = lignes.filter((l) => l.nature === n);
    const t = {
      budgetAnnuel: sommeMontants(siennes.map((l) => l.budgetAnnuel)),
      budgetADate: sommeMontants(siennes.map((l) => l.budgetADate)),
      realise: sommeMontants(siennes.map((l) => l.realise)),
    };
    return { ...t, ecart: t.realise - t.budgetADate };
  };
  const charges = totaux("CHARGE");
  const produits = totaux("PRODUIT");
  const resultat = {
    budgetAnnuel: produits.budgetAnnuel - charges.budgetAnnuel,
    budgetADate: produits.budgetADate - charges.budgetADate,
    realise: produits.realise - charges.realise,
  };
  return { moisEcoules, nbMois, lignes, charges, produits, resultat: { ...resultat, ecart: resultat.realise - resultat.budgetADate } };
}
