// ---------------------------------------------------------------------------
// Impôt Général Synthétique (IGS) — Cameroun, CGI art. C40
//
// L'IGS est un impôt forfaitaire annuel assis sur une grille de classes
// déterminées par le chiffre d'affaires annuel. Il est libératoire : il
// remplace l'impôt sur le revenu, la patente et la TVA pour les petites
// entreprises. Il se paie par quarts, trimestriellement.
//
// Le barème est stocké en base (paramètre « igs_bareme ») pour rester
// modifiable par le cabinet à chaque loi de finances, sans redéploiement.
// ---------------------------------------------------------------------------

/** Une classe du barème IGS. */
export type IgsClasse = {
  /** Numéro de classe (1 à N). */
  classe: number;
  /** Borne inférieure du chiffre d'affaires annuel, en FCFA (incluse). */
  caMin: number;
  /** Borne supérieure du CA annuel, en FCFA (incluse). `null` = dernière classe. */
  caMax: number | null;
  /** Montant annuel d'IGS dû, en FCFA. 0 = exonéré. */
  montant: number;
};

export type IgsBareme = IgsClasse[];

/** Nombre de classes du barème géré par l'ERP (CGI art. C40). */
export const IGS_NB_CLASSES = 12;

/**
 * Au-delà de ce chiffre d'affaires annuel, le contribuable sort de l'IGS et
 * bascule obligatoirement au régime du Réel.
 */
export const IGS_CA_PLAFOND = 50_000_000;

/**
 * Abattement appliqué au montant du barème pour les adhérents d'un Centre de
 * Gestion Agréé (CGA) : les tarifs sont réduits de moitié.
 */
export const IGS_ABATTEMENT_CGA = 0.5;

/**
 * Barème par défaut installé au premier démarrage (CGI art. C40).
 *
 * Note sur la classe 1 : le texte publié dit « moins de 500 000 » puis fait
 * démarrer la classe 2 à 500 001, ce qui laisse le montant exact de 500 000
 * sans classe. La borne haute est fixée ici à 500 000 inclus pour supprimer ce
 * trou, dans le sens le plus favorable au contribuable (exonération).
 *
 * Le barème reste éditable dans Paramètres → Barème IGS, pour absorber les
 * lois de finances suivantes sans redéploiement.
 */
export const IGS_BAREME_DEFAUT: IgsBareme = [
  { classe: 1, caMin: 0, caMax: 500_000, montant: 0 }, // exonéré
  { classe: 2, caMin: 500_001, caMax: 1_000_000, montant: 20_000 },
  { classe: 3, caMin: 1_000_001, caMax: 2_000_000, montant: 40_000 },
  { classe: 4, caMin: 2_000_001, caMax: 3_000_000, montant: 75_000 },
  { classe: 5, caMin: 3_000_001, caMax: 5_000_000, montant: 125_000 },
  { classe: 6, caMin: 5_000_001, caMax: 7_500_000, montant: 200_000 },
  { classe: 7, caMin: 7_500_001, caMax: 10_000_000, montant: 300_000 },
  { classe: 8, caMin: 10_000_001, caMax: 15_000_000, montant: 500_000 },
  { classe: 9, caMin: 15_000_001, caMax: 20_000_000, montant: 700_000 },
  { classe: 10, caMin: 20_000_001, caMax: 30_000_000, montant: 1_000_000 },
  { classe: 11, caMin: 30_000_001, caMax: 40_000_000, montant: 1_500_000 },
  { classe: 12, caMin: 40_000_001, caMax: 50_000_000, montant: 2_000_000 },
];

/**
 * À partir de cette classe (CA ≥ 10 000 000 FCFA), le contribuable à l'IGS doit
 * en outre déposer une Déclaration Statistique et Fiscale et tenir une
 * comptabilité selon le système minimal de trésorerie OHADA.
 */
export const IGS_CLASSE_MIN_DSF = 8;

/** Le contribuable à l'IGS doit-il déposer une DSF, vu sa classe ? */
export function exigeDsf(classe: number | null | undefined): boolean {
  return classe != null && classe >= IGS_CLASSE_MIN_DSF;
}

/** Une classe non renseignée (bornes et montant à zéro) est « à compléter ». */
export function isClasseRenseignee(c: IgsClasse): boolean {
  return !(c.caMin === 0 && c.caMax === 0 && c.montant === 0);
}

/** Numéros des classes restant à compléter par le cabinet. */
export function classesACompleter(bareme: IgsBareme): number[] {
  return bareme.filter((c) => !isClasseRenseignee(c)).map((c) => c.classe);
}

/** Le barème est complet quand chacune de ses classes est renseignée. */
export function isBaremeComplet(bareme: IgsBareme): boolean {
  return bareme.length > 0 && classesACompleter(bareme).length === 0;
}

/** Retourne la classe correspondant à un chiffre d'affaires, ou `null`. */
export function classeForCa(
  ca: number | null | undefined,
  bareme: IgsBareme = IGS_BAREME_DEFAUT,
): IgsClasse | null {
  if (ca == null || ca < 0) return null;
  for (const c of bareme) {
    if (!isClasseRenseignee(c)) continue;
    if (ca >= c.caMin && (c.caMax === null || ca <= c.caMax)) return c;
  }
  return null;
}

/**
 * Montant annuel d'IGS dû pour une classe donnée, abattement CGA compris.
 * Retourne `null` si la classe est inconnue ou pas encore renseignée.
 */
export function montantAnnuel(
  classe: number | null | undefined,
  bareme: IgsBareme = IGS_BAREME_DEFAUT,
  cgaAdherent = false,
): number | null {
  if (classe == null) return null;
  const c = bareme.find((b) => b.classe === classe);
  if (!c || !isClasseRenseignee(c)) return null;
  const brut = c.montant;
  return cgaAdherent ? Math.round(brut * (1 - IGS_ABATTEMENT_CGA)) : brut;
}

/** Quart trimestriel de l'IGS annuel (arrondi au franc supérieur). */
export function montantTrimestriel(
  classe: number | null | undefined,
  bareme: IgsBareme = IGS_BAREME_DEFAUT,
  cgaAdherent = false,
): number | null {
  const annuel = montantAnnuel(classe, bareme, cgaAdherent);
  return annuel === null ? null : Math.ceil(annuel / 4);
}

/**
 * Le CA dépasse-t-il le seuil de sortie de l'IGS ? Dans ce cas le contribuable
 * doit basculer au régime du Réel.
 */
export function depasseSeuilIgs(ca: number | null | undefined): boolean {
  return ca != null && ca > IGS_CA_PLAFOND;
}

// ---------------------------------------------------------------------------
// Échéancier trimestriel
// ---------------------------------------------------------------------------

/** Période d'un trimestre au format « 2026-T1 ». */
export function periodeTrimestre(annee: number, trimestre: number): string {
  return `${annee}-T${trimestre}`;
}

/**
 * Échéances légales de paiement de l'IGS : 15 mars, 15 juin, 15 septembre et
 * 15 décembre de l'année d'imposition. Les quatre versements tombent donc
 * dans l'année courante, contrairement à une lecture « 15 jours après la fin
 * du trimestre » qui reporterait le quatrième sur janvier N+1.
 */
const MOIS_ECHEANCE_IGS = [2, 5, 8, 11]; // mars, juin, septembre, décembre (0-indexés)

export function echeanceTrimestre(annee: number, trimestre: number): string {
  const mois = MOIS_ECHEANCE_IGS[trimestre - 1];
  if (mois === undefined) {
    throw new Error(`Trimestre invalide : ${trimestre} (attendu 1 à 4).`);
  }
  const d = new Date(Date.UTC(annee, mois, 15));
  return d.toISOString().slice(0, 10);
}

/** Les quatre échéances trimestrielles d'une année. */
export function echeancesAnnee(
  annee: number,
): { trimestre: number; periode: string; dateEcheance: string }[] {
  return [1, 2, 3, 4].map((t) => ({
    trimestre: t,
    periode: periodeTrimestre(annee, t),
    dateEcheance: echeanceTrimestre(annee, t),
  }));
}
