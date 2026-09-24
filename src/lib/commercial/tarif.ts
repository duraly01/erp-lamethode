// ---------------------------------------------------------------------------
// Grille tarifaire — module pur (S1, docs/23).
//
// Chez le client des entretiens, le prix vit dans la caisse de chaque
// boutique : on le modifie ici, il reste l'ancien là-bas, et personne ne sait
// lequel fait foi. Le remède n'est pas de mieux propager le prix, c'est de
// cesser de le recopier — un prix est le croisement d'un tarif, d'un article
// et d'une date, résolu au moment de la vente.
//
// Une période court de `valideDu` à `valideAu` inclus ; `valideAu` nul
// signifie « jusqu'à nouvel ordre ». Deux prix du même article dans le même
// tarif ne peuvent pas se chevaucher — sans quoi « le » prix d'un jour donné
// n'existerait pas.
//
// Montants en centimes entiers, dates ISO `AAAA-MM-JJ` comparables
// lexicographiquement.
// ---------------------------------------------------------------------------

export class TarifError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TarifError";
  }
}

/** Une ligne de prix, telle qu'on la lit en base. */
export type PeriodePrix = {
  id: number;
  valideDu: string;
  /** Nul : ouverte, donc en vigueur jusqu'à nouvel ordre. */
  valideAu: string | null;
  prixHt: number;
};

/** La période couvre-t-elle cette date ? */
export function couvre(p: Pick<PeriodePrix, "valideDu" | "valideAu">, date: string): boolean {
  return p.valideDu <= date && (p.valideAu === null || date <= p.valideAu);
}

/**
 * Le prix en vigueur à une date, ou `null` si l'article n'en a pas ce jour-là.
 *
 * Rendre `null` plutôt que se rabattre sur le prix le plus proche est
 * délibéré : un article sans prix ne doit pas se vendre à un prix deviné. La
 * vente est refusée, et c'est le comportement voulu — c'est exactement la
 * facture manuscrite « au prix de base » que le système actuel produit.
 */
export function prixADate(periodes: PeriodePrix[], date: string): PeriodePrix | null {
  return periodes.find((p) => couvre(p, date)) ?? null;
}

/** Deux périodes se recouvrent-elles, ne serait-ce que d'un jour ? */
export function seChevauchent(
  a: Pick<PeriodePrix, "valideDu" | "valideAu">,
  b: Pick<PeriodePrix, "valideDu" | "valideAu">,
): boolean {
  const aprèsB = b.valideAu !== null && a.valideDu > b.valideAu;
  const avantB = a.valideAu !== null && a.valideAu < b.valideDu;
  return !aprèsB && !avantB;
}

/**
 * Vérifie qu'un jeu de périodes est cohérent : aucun chevauchement.
 *
 * La base ne peut pas le garantir — il y faudrait une contrainte `EXCLUDE` et
 * l'extension `btree_gist`, qu'un hébergement mutualisé ne laisse pas créer.
 * L'invariant est donc tenu ici, et c'est la seule porte d'entrée des prix.
 */
export function verifierCoherence(periodes: PeriodePrix[]): void {
  const triees = [...periodes].sort((x, y) => (x.valideDu < y.valideDu ? -1 : x.valideDu > y.valideDu ? 1 : 0));
  for (let i = 1; i < triees.length; i++) {
    if (seChevauchent(triees[i - 1], triees[i])) {
      throw new TarifError(
        `Deux prix se chevauchent : celui du ${triees[i - 1].valideDu} et celui du ${triees[i].valideDu}.`,
      );
    }
  }
}

/** La veille d'une date ISO. */
function veille(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type ChangementPrix = {
  /** Périodes à clore, avec leur nouvelle date de fin. */
  aClore: { id: number; valideAu: string }[];
  /** La période à ouvrir. */
  aOuvrir: { valideDu: string; valideAu: string | null; prixHt: number };
};

/**
 * Ce qu'il faut écrire pour qu'un nouveau prix s'applique à partir d'une date.
 *
 * Changer un prix n'écrase jamais : la période en cours est close la veille,
 * une nouvelle s'ouvre. Une vente de mars se relit ainsi au prix de mars —
 * ce que le cabinet ne peut pas faire aujourd'hui, et sans quoi aucune marge
 * passée n'est vérifiable.
 *
 * Rien n'est écrit ici : la fonction décrit le changement, le service
 * l'applique en transaction.
 */
export function planifierChangement(
  periodes: PeriodePrix[],
  aPartirDu: string,
  prixHt: number,
): ChangementPrix {
  if (!Number.isSafeInteger(prixHt) || prixHt < 0) {
    throw new TarifError("Un prix est un montant positif ou nul.");
  }
  if (periodes.some((p) => p.valideDu === aPartirDu)) {
    throw new TarifError(`Un prix commence déjà le ${aPartirDu} : modifiez-le plutôt que d'en ouvrir un second.`);
  }

  const fin = veille(aPartirDu);
  const aClore: { id: number; valideAu: string }[] = [];
  for (const p of periodes) {
    // Une période antérieure qui déborde sur la nouvelle est close la veille.
    if (p.valideDu < aPartirDu && (p.valideAu === null || p.valideAu >= aPartirDu)) {
      aClore.push({ id: p.id, valideAu: fin });
    }
  }

  // La nouvelle période s'arrête à la veille de la suivante, s'il en existe une.
  const suivantes = periodes.filter((p) => p.valideDu > aPartirDu).map((p) => p.valideDu).sort();
  const valideAu = suivantes.length > 0 ? veille(suivantes[0]) : null;

  return { aClore, aOuvrir: { valideDu: aPartirDu, valideAu, prixHt } };
}
