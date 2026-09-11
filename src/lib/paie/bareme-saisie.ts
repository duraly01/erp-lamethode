// ---------------------------------------------------------------------------
// Barème de paie — aller-retour entre le barème et sa saisie à l'écran.
//
// Un champ de formulaire tient du texte, et le cabinet y tape « 5,65 » ou
// « 750 000 » comme il le lit dans le texte réglementaire. Le barème, lui,
// tient des nombres. Ce module fait la conversion dans les deux sens et, au
// retour, désigne en français chaque valeur qui n'en est pas une : l'éditeur
// n'a plus qu'à afficher la liste.
// ---------------------------------------------------------------------------

import { AVANTAGE_NATURE_LABELS, GROUPE_RISQUE_LABELS, REGIME_CNPS_LABELS, type BaremePaie } from "./bareme";

/** Le barème tel qu'il est saisi : chaque nombre devient une chaîne, `null` devient « ». */
export type Saisie<T> = T extends number | null
  ? string
  : T extends (infer U)[]
    ? Saisie<U>[]
    : T extends object
      ? { [K in keyof T]: Saisie<T[K]> }
      : T;

export type BaremeSaisi = Saisie<BaremePaie>;

/** Un nombre comme le cabinet l'écrit : « 750 000 », « 4,2 ». */
export function ecrireNombre(n: number): string {
  const [entier, decimales] = String(n).split(".");
  const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return decimales ? `${groupe},${decimales}` : groupe;
}

/** Prépare un barème pour l'écran. Les tranches ouvertes (`jusqua: null`) se saisissent vides. */
export function versSaisie(bareme: BaremePaie): BaremeSaisi {
  const convertir = (v: unknown): unknown => {
    if (v === null) return "";
    if (typeof v === "number") return ecrireNombre(v);
    if (Array.isArray(v)) return v.map(convertir);
    if (typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, convertir(x)]));
    return v;
  };
  return convertir(bareme) as BaremeSaisi;
}

/**
 * Lit un nombre saisi à la française : espaces (y compris insécables) entre
 * les milliers, virgule ou point pour les décimales. `null` si ce n'en est
 * pas un.
 */
export function lireNombre(brut: string): number | null {
  const propre = brut.replace(/[\s  ]/g, "").replace(",", ".");
  if (propre === "" || !/^\d+(\.\d+)?$/.test(propre)) return null;
  return Number(propre);
}

type Lecture = { bareme: BaremePaie; erreurs: string[] };

/**
 * Relit un barème saisi. Les erreurs sont toutes rapportées d'un coup, chacune
 * nommant le champ tel qu'il apparaît à l'écran. Quand une valeur ne se lit
 * pas, `-1` prend sa place dans le barème rendu : il ne doit être utilisé
 * que si `erreurs` est vide.
 */
export function depuisSaisie(saisi: BaremeSaisi): Lecture {
  const erreurs: string[] = [];

  const nombre = (brut: string, libelle: string, { entier = false, pourcent = false } = {}): number => {
    const n = lireNombre(brut);
    if (n === null) {
      erreurs.push(`${libelle} : nombre attendu.`);
      return -1;
    }
    if (entier && !Number.isInteger(n)) erreurs.push(`${libelle} : montant entier attendu, en francs.`);
    if (pourcent && n > 100) erreurs.push(`${libelle} : un taux ne dépasse pas 100 %.`);
    return n;
  };
  const francs = (brut: string, libelle: string) => nombre(brut, libelle, { entier: true });
  const taux = (brut: string, libelle: string) => nombre(brut, libelle, { pourcent: true });
  /** Une borne de tranche : vide pour « et au-delà ». */
  const borne = (brut: string, libelle: string): number | null => (brut.trim() === "" ? null : francs(brut, libelle));

  const bareme: BaremePaie = {
    valideDu: saisi.valideDu.trim(),
    cnps: {
      plafondMensuel: francs(saisi.cnps.plafondMensuel, "CNPS — plafond mensuel"),
      pvidSalarie: taux(saisi.cnps.pvidSalarie, "CNPS — PVID part salariale"),
      pvidEmployeur: taux(saisi.cnps.pvidEmployeur, "CNPS — PVID part patronale"),
      prestationsFamiliales: {
        GENERAL: taux(saisi.cnps.prestationsFamiliales.GENERAL, `Prestations familiales — ${REGIME_CNPS_LABELS.GENERAL}`),
        AGRICOLE: taux(saisi.cnps.prestationsFamiliales.AGRICOLE, `Prestations familiales — ${REGIME_CNPS_LABELS.AGRICOLE}`),
        ENSEIGNEMENT: taux(saisi.cnps.prestationsFamiliales.ENSEIGNEMENT, `Prestations familiales — ${REGIME_CNPS_LABELS.ENSEIGNEMENT}`),
      },
      accidentsTravail: {
        A: taux(saisi.cnps.accidentsTravail.A, `Accidents du travail — ${GROUPE_RISQUE_LABELS.A}`),
        B: taux(saisi.cnps.accidentsTravail.B, `Accidents du travail — ${GROUPE_RISQUE_LABELS.B}`),
        C: taux(saisi.cnps.accidentsTravail.C, `Accidents du travail — ${GROUPE_RISQUE_LABELS.C}`),
      },
    },
    irpp: {
      seuilExonerationMensuel: francs(saisi.irpp.seuilExonerationMensuel, "IRPP — seuil d'exonération mensuel"),
      abattementFraisPro: taux(saisi.irpp.abattementFraisPro, "IRPP — abattement pour frais professionnels"),
      abattementAnnuel: francs(saisi.irpp.abattementAnnuel, "IRPP — abattement annuel"),
      tranchesAnnuelles: saisi.irpp.tranchesAnnuelles.map((t, i) => ({
        jusqua: borne(t.jusqua, `IRPP — tranche ${i + 1}, jusqu'à`),
        taux: taux(t.taux, `IRPP — tranche ${i + 1}, taux`),
      })),
      cac: taux(saisi.irpp.cac, "Centimes additionnels communaux"),
    },
    cfc: {
      salarie: taux(saisi.cfc.salarie, "CFC part salariale"),
      employeur: taux(saisi.cfc.employeur, "CFC part patronale"),
    },
    fne: { employeur: taux(saisi.fne.employeur, "FNE") },
    tdl: saisi.tdl.map((t, i) => ({
      jusqua: borne(t.jusqua, `TDL — tranche ${i + 1}, jusqu'à`),
      montant: francs(t.montant, `TDL — tranche ${i + 1}, montant`),
    })),
    rav: saisi.rav.map((t, i) => ({
      jusqua: borne(t.jusqua, `RAV — tranche ${i + 1}, jusqu'à`),
      montant: francs(t.montant, `RAV — tranche ${i + 1}, montant`),
    })),
    avantagesNature: {
      LOGEMENT: taux(saisi.avantagesNature.LOGEMENT, `Avantage en nature — ${AVANTAGE_NATURE_LABELS.LOGEMENT}`),
      ELECTRICITE: taux(saisi.avantagesNature.ELECTRICITE, `Avantage en nature — ${AVANTAGE_NATURE_LABELS.ELECTRICITE}`),
      EAU: taux(saisi.avantagesNature.EAU, `Avantage en nature — ${AVANTAGE_NATURE_LABELS.EAU}`),
      DOMESTIQUE: taux(saisi.avantagesNature.DOMESTIQUE, `Avantage en nature — ${AVANTAGE_NATURE_LABELS.DOMESTIQUE}`),
      VEHICULE: taux(saisi.avantagesNature.VEHICULE, `Avantage en nature — ${AVANTAGE_NATURE_LABELS.VEHICULE}`),
      NOURRITURE: taux(saisi.avantagesNature.NOURRITURE, `Avantage en nature — ${AVANTAGE_NATURE_LABELS.NOURRITURE}`),
    },
  };

  return { bareme, erreurs };
}

/**
 * Date d'application proposée pour une nouvelle version : le 1er janvier qui
 * vient, puisque c'est la loi de finances qui change les taux. Elle reste à
 * corriger si le texte dit autrement.
 */
export function dateNouvelleVersion(aujourdhui: string): string {
  return `${Number(aujourdhui.slice(0, 4)) + 1}-01-01`;
}
