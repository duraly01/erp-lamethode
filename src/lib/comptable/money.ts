// ---------------------------------------------------------------------------
// Arithmétique monétaire — module pur, testable unitairement.
//
// Tous les calculs comptables se font ici en **centimes entiers**, jamais en
// nombres à virgule flottante. La raison n'est pas théorique : en flottant,
// 0.1 + 0.2 vaut 0.30000000000000004, et parseFloat("0.29") * 100 vaut
// 28.999999999999996. Sur un bilan, un centime d'écart est une anomalie qui
// bloque une clôture et qu'il faut ensuite chercher à la main.
//
// Le franc CFA ne se divise pas en pratique, mais les colonnes sont en
// numeric(14,2) : on conserve donc deux décimales, ne serait-ce que pour les
// devises étrangères et les taux appliqués à une base.
// ---------------------------------------------------------------------------

/**
 * Plafond imposé par les colonnes `numeric(14, 2)` : 12 chiffres avant la
 * virgule, soit 999 999 999 999,99 unités.
 */
export const MONTANT_MAX_CENTIMES = 99_999_999_999_999;

/** Erreur de conversion : la valeur reçue n'est pas un montant exploitable. */
export class MontantInvalideError extends Error {
  constructor(public readonly valeur: unknown) {
    super(`Montant invalide : ${JSON.stringify(valeur)}`);
    this.name = "MontantInvalideError";
  }
}

const FORMAT_MONTANT = /^(-)?(\d+)(?:[.,](\d*))?$/;

/**
 * Convertit un montant en centimes entiers.
 *
 * Accepte les chaînes rendues par PostgreSQL pour une colonne `numeric`
 * ("1234.56"), la virgule décimale de la saisie francophone ("1234,56"), et
 * les nombres. Au-delà de deux décimales, l'arrondi se fait au centime le plus
 * proche, le demi s'éloignant de zéro — la règle usuelle en comptabilité.
 *
 * `null`, `undefined` et la chaîne vide valent zéro : une ligne d'écriture
 * laissée vide d'un côté est un cas normal, pas une erreur.
 */
export function parseMontant(
  valeur: string | number | null | undefined,
): number {
  if (valeur === null || valeur === undefined || valeur === "") return 0;

  // Un nombre passe par sa représentation textuelle : c'est le seul moyen de
  // ne pas propager l'imprécision du flottant dans la conversion.
  const texte =
    typeof valeur === "number"
      ? Number.isFinite(valeur)
        ? valeur.toFixed(3)
        : ""
      : valeur.trim().replace(/\s/g, "");

  const m = FORMAT_MONTANT.exec(texte);
  if (!m) throw new MontantInvalideError(valeur);

  const [, signe, entier, fraction = ""] = m;
  const deuxPremieres = (fraction + "00").slice(0, 2);

  let centimes = Number(entier) * 100 + Number(deuxPremieres);
  // Arrondi au centime le plus proche, d'après la troisième décimale.
  if (fraction.length > 2 && Number(fraction[2]) >= 5) centimes += 1;

  if (!Number.isSafeInteger(centimes)) throw new MontantInvalideError(valeur);
  return signe === "-" ? -centimes : centimes;
}

/**
 * Rend un montant sous la forme attendue par une colonne `numeric(14, 2)`,
 * avec toujours deux décimales : "1234.56", "-40.00", "0.00".
 */
export function formatMontant(centimes: number): string {
  if (!Number.isSafeInteger(centimes)) throw new MontantInvalideError(centimes);
  const negatif = centimes < 0;
  const absolu = Math.abs(centimes);
  const entier = Math.floor(absolu / 100);
  const reste = absolu % 100;
  return `${negatif ? "-" : ""}${entier}.${String(reste).padStart(2, "0")}`;
}

/** Somme exacte d'une série de montants en centimes. */
export function sommeMontants(montants: number[]): number {
  let total = 0;
  for (const m of montants) {
    if (!Number.isSafeInteger(m)) throw new MontantInvalideError(m);
    total += m;
  }
  if (!Number.isSafeInteger(total)) throw new MontantInvalideError(total);
  return total;
}

/** Un montant tient-il dans une colonne `numeric(14, 2)` ? */
export function montantDansLesBornes(centimes: number): boolean {
  return (
    Number.isSafeInteger(centimes) &&
    Math.abs(centimes) <= MONTANT_MAX_CENTIMES
  );
}

/**
 * Applique un taux exprimé en pourcentage à une base, et arrondit au centime.
 *
 * Le taux est reçu tel qu'il est stocké dans `cpta_taxes.taux` — "19.2500"
 * pour la TVA camerounaise — et traité lui aussi en entier (ici en
 * dix-millièmes de pourcent) pour que le calcul reste exact.
 */
export function appliquerTaux(
  baseCentimes: number,
  taux: string | number,
): number {
  if (!Number.isSafeInteger(baseCentimes)) {
    throw new MontantInvalideError(baseCentimes);
  }
  const tauxTexte =
    typeof taux === "number" ? taux.toFixed(4) : String(taux).trim();
  const m = FORMAT_MONTANT.exec(tauxTexte);
  if (!m) throw new MontantInvalideError(taux);

  const [, signe, entier, fraction = ""] = m;
  // Taux en dix-millièmes : 19,2500 % → 192500.
  const tauxEntier = Number(entier) * 10_000 + Number((fraction + "0000").slice(0, 4));
  const produit = baseCentimes * (signe === "-" ? -tauxEntier : tauxEntier);

  // Division par 10 000 (décimales du taux) × 100 (pourcentage), avec arrondi
  // au centime le plus proche, le demi s'éloignant de zéro.
  const diviseur = 1_000_000;
  const arrondi =
    produit >= 0
      ? Math.floor((produit + diviseur / 2) / diviseur)
      : -Math.floor((-produit + diviseur / 2) / diviseur);

  if (!Number.isSafeInteger(arrondi)) throw new MontantInvalideError(produit);
  return arrondi;
}

/**
 * Présentation lisible d'un montant.
 *
 * Deux séparateurs, tous deux insécables, conformes à la typographie
 * française : une espace fine (U+202F) entre les groupes de milliers, une
 * espace insécable ordinaire (U+00A0) avant la devise. Ni le montant ni son
 * unité ne doivent se couper en fin de ligne, notamment dans un tableau de
 * balance ou sur une facture.
 *
 * Les décimales sont omises lorsqu'elles sont nulles, ce qui est le cas
 * courant en francs CFA.
 */
export function formatMontantAffichage(
  centimes: number,
  devise = "FCFA",
): string {
  const negatif = centimes < 0;
  const absolu = Math.abs(centimes);
  const entier = Math.floor(absolu / 100);
  const reste = absolu % 100;

  const groupes = String(entier).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const decimales = reste === 0 ? "" : `,${String(reste).padStart(2, "0")}`;

  return `${negatif ? "-" : ""}${groupes}${decimales} ${devise}`;
}
