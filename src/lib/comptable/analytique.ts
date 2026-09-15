// ---------------------------------------------------------------------------
// Comptabilité analytique — module pur (E5).
//
// La comptabilité générale dit *ce que* l'entreprise a dépensé et gagné ;
// l'analytique dit *pour quoi* : par activité, par site, par projet. Chaque
// façon de lire est un axe, chaque case de la lecture une section. Une
// ligne de charge ou de produit se ventile sur les sections d'un axe, en
// montant, entièrement ou en partie — ce qui n'est pas ventilé reste
// visible comme tel, et c'est ce qui permet de savoir où l'on en est.
//
// La ventilation ne modifie jamais l'écriture. Elle pose une lecture sur
// des lignes qui existent déjà, et se défait sans trace comptable.
//
// Montants en centimes entiers.
// ---------------------------------------------------------------------------

import { sommeMontants } from "./money";

export class VentilationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VentilationError";
  }
}

export type VentilationSaisie = { sectionId: number; montant: number };

/**
 * Vérifie une ventilation contre le montant de sa ligne : chaque part est
 * strictement positive, une section n'apparaît qu'une fois, et le total
 * ne dépasse pas la ligne. Rend ce qui reste non ventilé.
 */
export function validerVentilation(montantLigne: number, ventilations: VentilationSaisie[]): { reste: number } {
  if (!Number.isSafeInteger(montantLigne) || montantLigne <= 0) {
    throw new VentilationError("Seule une ligne portant un montant se ventile.");
  }
  const vues = new Set<number>();
  for (const v of ventilations) {
    if (!Number.isSafeInteger(v.montant) || v.montant <= 0) {
      throw new VentilationError("Chaque part ventilée doit être un montant strictement positif.");
    }
    if (vues.has(v.sectionId)) throw new VentilationError("Une section n'apparaît qu'une fois dans une ventilation.");
    vues.add(v.sectionId);
  }
  const total = sommeMontants(ventilations.map((v) => v.montant));
  if (total > montantLigne) {
    throw new VentilationError("La ventilation dépasse le montant de la ligne.");
  }
  return { reste: montantLigne - total };
}

export type CleRepartition = { sectionId: number; poids: number };

/**
 * Répartit un montant selon des poids — 50/30/20, ou 2/1 —, au centime :
 * chaque part est arrondie au plus proche et l'écart d'arrondi va à la part
 * la plus lourde, pour que la somme fasse exactement le montant.
 */
export function repartirParCle(montant: number, cle: CleRepartition[]): VentilationSaisie[] {
  if (!Number.isSafeInteger(montant) || montant <= 0) throw new VentilationError("Le montant à répartir doit être strictement positif.");
  const utiles = cle.filter((c) => c.poids > 0);
  if (utiles.length === 0) throw new VentilationError("La clé de répartition n'a aucun poids.");
  const totalPoids = utiles.reduce((t, c) => t + c.poids, 0);
  const parts = utiles.map((c) => ({ sectionId: c.sectionId, montant: Math.round((montant * c.poids) / totalPoids) }));
  const ecart = montant - sommeMontants(parts.map((p) => p.montant));
  if (ecart !== 0) {
    const plusLourde = parts.reduce((a, b) => (b.montant > a.montant ? b : a));
    plusLourde.montant += ecart;
  }
  return parts.filter((p) => p.montant > 0);
}

// ---------------------------------------------------------------------------
// Restitution
// ---------------------------------------------------------------------------

/** Une ligne de charge ou de produit, avec la part qu'une section en porte — ou null pour le reste non ventilé. */
export type LigneAnalytique = {
  compteNumero: string;
  compteLibelle: string;
  /** Montant de la part, positif, dans le sens de la ligne. */
  montant: number;
  sens: "DEBIT" | "CREDIT";
  sectionId: number | null;
};

export type Section = { id: number; code: string; libelle: string };

export type LigneRestitution = {
  section: Section | null;
  charges: number;
  produits: number;
  resultat: number;
  comptes: { numero: string; libelle: string; charges: number; produits: number }[];
};

/**
 * Le compte de résultat par section : pour chaque section, ses charges,
 * ses produits et leur différence, avec le détail par compte. Une charge
 * grossit au débit, un produit au crédit ; une ligne à contresens — un
 * avoir, une annulation — vient en moins.
 *
 * Les sections sans mouvement figurent quand même, à zéro : un centre de
 * coûts vide est une information. Le reste non ventilé vient en dernier,
 * section nulle, pour qu'on voie ce qui manque à la lecture.
 */
export function restitutionParSection(lignes: LigneAnalytique[], sections: Section[]): LigneRestitution[] {
  const parSection = new Map<number | null, LigneRestitution>();
  for (const s of sections) parSection.set(s.id, { section: s, charges: 0, produits: 0, resultat: 0, comptes: [] });

  for (const l of lignes) {
    if (l.montant === 0) continue;
    let r = parSection.get(l.sectionId);
    if (!r) {
      r = { section: null, charges: 0, produits: 0, resultat: 0, comptes: [] };
      parSection.set(l.sectionId, r);
    }
    // Classe 6 : charges ; classe 7 : produits ; classe 8 : HAO, charges aux
    // comptes impairs (81, 83, 85), produits aux pairs (82, 84, 86).
    const charge = l.compteNumero.startsWith("6") || (l.compteNumero.startsWith("8") && Number(l.compteNumero[1]) % 2 === 1);
    const signe = l.sens === "DEBIT" ? 1 : -1;
    let c = r.comptes.find((x) => x.numero === l.compteNumero);
    if (!c) {
      c = { numero: l.compteNumero, libelle: l.compteLibelle, charges: 0, produits: 0 };
      r.comptes.push(c);
    }
    if (charge) {
      c.charges += signe * l.montant;
      r.charges += signe * l.montant;
    } else {
      c.produits += -signe * l.montant;
      r.produits += -signe * l.montant;
    }
  }

  for (const r of parSection.values()) {
    r.resultat = r.produits - r.charges;
    r.comptes.sort((a, b) => a.numero.localeCompare(b.numero));
  }

  const nommees = [...parSection.values()].filter((r) => r.section !== null).sort((a, b) => a.section!.code.localeCompare(b.section!.code));
  const reste = parSection.get(null);
  return reste ? [...nommees, reste] : nommees;
}
