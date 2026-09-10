// ---------------------------------------------------------------------------
// Facturation — logique pure (montants, TVA, numérotation, montant en lettres)
//
// Aucun accès base ni Node ici : ce module est importable côté client comme
// côté serveur, et entièrement testable.
// ---------------------------------------------------------------------------

export type CategorieLigne =
  | "HONORAIRES"
  | "IMPOT_TRESOR"
  | "CNPS"
  | "FRAIS"
  | "AUTRE";

export type StatutFacture =
  | "BROUILLON"
  | "ENVOYEE"
  | "PARTIELLE"
  | "PAYEE"
  | "EN_RETARD"
  | "ANNULEE";

export type ModeReglement =
  | "ESPECES"
  | "VIREMENT"
  | "MOBILE_MONEY"
  | "CHEQUE"
  | "AUTRE";

export const CATEGORIE_LIGNE_LABELS: Record<CategorieLigne, string> = {
  HONORAIRES: "Honoraires",
  IMPOT_TRESOR: "Trésor",
  CNPS: "CNPS",
  FRAIS: "Frais",
  AUTRE: "Autre",
};

export const STATUT_FACTURE_LABELS: Record<StatutFacture, string> = {
  BROUILLON: "Brouillon",
  ENVOYEE: "Envoyée",
  PARTIELLE: "Partiellement réglée",
  PAYEE: "Payée",
  EN_RETARD: "En retard",
  ANNULEE: "Annulée",
};

export const STATUT_FACTURE_COLORS: Record<StatutFacture, string> = {
  BROUILLON: "bg-slate-100 text-slate-700 border-slate-300",
  ENVOYEE: "bg-blue-100 text-blue-700 border-blue-300",
  PARTIELLE: "bg-amber-100 text-amber-700 border-amber-300",
  PAYEE: "bg-emerald-100 text-emerald-700 border-emerald-300",
  EN_RETARD: "bg-red-100 text-red-700 border-red-300",
  ANNULEE: "bg-slate-200 text-slate-500 border-slate-300",
};

export const MODE_REGLEMENT_LABELS: Record<ModeReglement, string> = {
  ESPECES: "Espèces",
  VIREMENT: "Virement",
  MOBILE_MONEY: "Mobile Money",
  CHEQUE: "Chèque",
  AUTRE: "Autre",
};

/** Taux de TVA camerounais applicable aux prestations de service. */
export const TVA_TAUX_DEFAUT = 19.25;

// ---------------------------------------------------------------------------
// Identité du cabinet
// ---------------------------------------------------------------------------

/** Coordonnées légales imprimées en pied de facture, éditables en Paramètres. */
export type IdentiteCabinet = {
  raisonSociale: string;
  niu: string;
  rccm: string;
  adresse: string;
  telephone: string;
  email: string;
  siteWeb: string;
  ville: string;
};

/**
 * Valeurs par défaut.
 *
 * ⚠️ Le NIU et le RCCM imprimés sur le fichier de papier entête fourni
 * (M121700012100C / RCCM/RC/YDE/2021/B/12345) ne sont **pas** ceux du cabinet.
 * Ce sont les valeurs ci-dessous qui font foi ; c'est la raison pour laquelle
 * le bandeau de pied d'origine n'est pas repris et que le pied est redessiné.
 */
export const IDENTITE_CABINET_DEFAUT: IdentiteCabinet = {
  raisonSociale: "Cabinet LaMethode — Cabinet & Services",
  niu: "M082217553824H",
  rccm: "RC/YAO/2022/B/1538",
  adresse: "L'Intendance, BP 13837 Yaoundé",
  telephone: "+237 6 20 83 67 86",
  email: "temejeanjacques@lamethode.cm",
  siteWeb: "www.lamethode.cm",
  ville: "Yaoundé",
};

/**
 * Taux de TVA proposé selon la nature de la ligne.
 *
 * Seuls les honoraires du cabinet sont une prestation taxable. Les impôts et
 * cotisations reversés pour le compte du client, comme les frais bancaires
 * avancés, sont des débours : ils transitent sans TVA. Le taux reste
 * modifiable ligne à ligne.
 */
export function tauxTvaParDefaut(categorie: CategorieLigne): number {
  return categorie === "HONORAIRES" ? TVA_TAUX_DEFAUT : 0;
}

// ---------------------------------------------------------------------------
// Totaux
// ---------------------------------------------------------------------------

export type LigneMontant = { montantHt: number; tauxTva: number };

export type TotauxFacture = {
  totalHt: number;
  totalTva: number;
  totalTtc: number;
};

/** Arrondi au centime, en passant par les entiers pour éviter la dérive. */
function arrondi2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Totalise une facture. La TVA est calculée ligne à ligne puis sommée : c'est
 * ce que fait une facture papier, et cela reste juste quand plusieurs taux
 * cohabitent (honoraires taxés + débours à 0 %).
 */
export function calculeTotaux(lignes: LigneMontant[]): TotauxFacture {
  let ht = 0;
  let tva = 0;
  for (const l of lignes) {
    const lht = arrondi2(l.montantHt);
    ht += lht;
    tva += arrondi2((lht * l.tauxTva) / 100);
  }
  const totalHt = arrondi2(ht);
  const totalTva = arrondi2(tva);
  return { totalHt, totalTva, totalTtc: arrondi2(totalHt + totalTva) };
}

/** Reste à payer sur une facture, jamais négatif. */
export function resteAPayer(totalTtc: number, montantRegle: number): number {
  return Math.max(0, arrondi2(totalTtc - montantRegle));
}

/** Jour calendaire local au format « AAAA-MM-JJ ». */
export function jourCalendaire(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Statut déduit de l'état de règlement et de l'échéance.
 *
 * Un brouillon et une facture annulée gardent leur statut : ils ne dépendent
 * pas du paiement. Pour les autres, le règlement prime sur le retard — une
 * facture soldée après échéance est « payée », pas « en retard ».
 */
export function statutCalcule(f: {
  statut: StatutFacture;
  totalTtc: number;
  montantRegle: number;
  dateEcheance: string;
  aujourdHui?: Date;
}): StatutFacture {
  if (f.statut === "BROUILLON" || f.statut === "ANNULEE") return f.statut;

  if (f.totalTtc > 0 && f.montantRegle >= f.totalTtc) return "PAYEE";
  if (f.montantRegle > 0) return "PARTIELLE";

  // Comparaison sur le jour calendaire, en chaînes « AAAA-MM-JJ » : l'échéance
  // est une date sans heure, la mêler à un instant UTC rendrait le retard
  // dépendant du fuseau de la machine.
  if (f.dateEcheance < jourCalendaire(f.aujourdHui ?? new Date())) {
    return "EN_RETARD";
  }
  return "ENVOYEE";
}

// ---------------------------------------------------------------------------
// Numérotation
// ---------------------------------------------------------------------------

/** Numéro de facture : « FA-2026-0007 ». La séquence repart à 1 chaque année. */
export function formatNumeroFacture(
  prefixe: string,
  annee: number,
  sequence: number,
): string {
  return `${prefixe}-${annee}-${String(sequence).padStart(4, "0")}`;
}

/** Extrait la séquence d'un numéro, ou 0 si le format ne correspond pas. */
export function sequenceDepuisNumero(
  numero: string,
  prefixe: string,
  annee: number,
): number {
  const attendu = `${prefixe}-${annee}-`;
  if (!numero.startsWith(attendu)) return 0;
  const n = Number(numero.slice(attendu.length));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Montant en toutes lettres
// ---------------------------------------------------------------------------

const UNITES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit",
  "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];

const DIZAINES = [
  "", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante",
  "quatre-vingt", "quatre-vingt",
];

/** 0 à 99. Gère les vigésimales (70-79, 90-99) et les « et un ». */
function sousCent(n: number): string {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;

  // 70-79 et 90-99 se construisent sur soixante/quatre-vingt + 10 à 19.
  if (d === 7 || d === 9) {
    if (d === 7 && u === 1) return "soixante et onze";
    return `${DIZAINES[d]}-${UNITES[10 + u]}`;
  }
  if (u === 0) return d === 8 ? "quatre-vingts" : DIZAINES[d];
  // « quatre-vingt-un » ne prend pas de « et », contrairement à vingt et un.
  if (u === 1 && d !== 8) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
}

/** 0 à 999. « cent » s'accorde seulement s'il termine le groupe. */
function sousMille(n: number): string {
  if (n < 100) return sousCent(n);
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (r === 0) return c === 1 ? "cent" : `${UNITES[c]} cents`;
  return c === 1 ? `cent ${sousCent(r)}` : `${UNITES[c]} cent ${sousCent(r)}`;
}

const ECHELLES: { valeur: number; singulier: string; pluriel: string }[] = [
  { valeur: 1_000_000_000, singulier: "milliard", pluriel: "milliards" },
  { valeur: 1_000_000, singulier: "million", pluriel: "millions" },
  // « mille » est invariable : deux mille, jamais deux milles.
  { valeur: 1_000, singulier: "mille", pluriel: "mille" },
];

/**
 * Écrit un entier en toutes lettres. Utilisé pour la mention manuscrite
 * obligatoire sur les factures (« arrêtée à la somme de… »).
 */
export function nombreEnLettres(n: number): string {
  if (!Number.isFinite(n)) throw new Error("Nombre invalide.");
  const entier = Math.floor(Math.abs(n));
  if (entier === 0) return "zéro";

  const morceaux: string[] = [];
  let reste = entier;

  for (const e of ECHELLES) {
    const quotient = Math.floor(reste / e.valeur);
    if (quotient === 0) continue;
    reste %= e.valeur;
    // « mille » et non « un mille » ; en revanche « un million ».
    const prefixe =
      quotient === 1 && e.valeur === 1_000 ? "" : `${sousMille(quotient)} `;
    morceaux.push(`${prefixe}${quotient > 1 ? e.pluriel : e.singulier}`);
  }

  if (reste > 0) morceaux.push(sousMille(reste));
  const mots = morceaux.join(" ");
  return n < 0 ? `moins ${mots}` : mots;
}

/** Montant en toutes lettres, suffixé de la devise. */
export function montantEnLettres(montant: number, devise = "francs CFA"): string {
  return `${nombreEnLettres(Math.round(montant))} ${devise}`;
}

/**
 * Séparateur de milliers en espace ordinaire.
 *
 * `toLocaleString("fr-FR")` insère une espace fine insécable (U+202F) absente
 * des polices Helvetica de base : dans un PDF, elle s'imprime en « / ». On la
 * normalise donc systématiquement.
 */
export function formatNombre(n: number): string {
  return Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ");
}

/** Formatage monétaire français, sans décimales (le franc CFA n'en a pas). */
export function formatFcfa(montant: number | string | null | undefined): string {
  const n = typeof montant === "string" ? Number(montant) : (montant ?? 0);
  if (!Number.isFinite(n)) return "—";
  return `${formatNombre(n)} FCFA`;
}

/** Libellé lisible d'une période : « 2026-01 » → « janvier 2026 ». */
const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
  "septembre", "octobre", "novembre", "décembre",
];

export function libellePeriode(periode: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periode);
  if (!m) return periode;
  const mois = Number(m[2]);
  if (mois < 1 || mois > 12) return periode;
  return `${MOIS[mois - 1]} ${m[1]}`;
}

/**
 * Objet de facture, avec élision devant les mois commençant par une voyelle :
 * « du mois d'avril 2026 », et non « du mois de avril 2026 ».
 */
export function objetParDefaut(periode: string): string {
  const libelle = libellePeriode(periode);
  const article = /^[aeiouâéèêîôû]/i.test(libelle) ? "d'" : "de ";
  return `Versements spontanés du mois ${article}${libelle}`;
}
