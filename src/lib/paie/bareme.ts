// ---------------------------------------------------------------------------
// Barème de paie — Cameroun (E4).
//
// Tout ce qu'un bulletin retient ou que l'employeur supporte se calcule sur
// des taux et des seuils qui changent au gré des lois de finances. Aucun
// n'est codé dans le moteur : ils sont ici, dans un barème daté, stocké en
// paramètre (« paie_bareme ») et éditable par le cabinet. Le moteur reçoit la
// version en vigueur au mois de paie, et rien d'autre.
//
// Montants en francs CFA, taux en pourcentage. C'est ainsi que le cabinet
// les lit dans les textes ; la conversion en centimes est l'affaire du
// moteur.
// ---------------------------------------------------------------------------

/** Régime CNPS : il fixe le taux des prestations familiales. */
export type RegimeCnps = "GENERAL" | "AGRICOLE" | "ENSEIGNEMENT";

/** Groupe de risque professionnel : il fixe le taux des accidents du travail. */
export type GroupeRisque = "A" | "B" | "C";

/** Avantages en nature évalués forfaitairement, en pourcentage du brut en espèces. */
export type AvantageNature = "LOGEMENT" | "ELECTRICITE" | "EAU" | "DOMESTIQUE" | "VEHICULE" | "NOURRITURE";

/** Une tranche d'un barème progressif : `jusqua` inclus, `null` pour la dernière. */
export type Tranche = { jusqua: number | null; taux: number };

/** Une tranche d'un barème forfaitaire : `jusqua` inclus, un montant mensuel. */
export type TrancheForfait = { jusqua: number | null; montant: number };

export type BaremePaie = {
  /** Premier jour d'application, ISO. */
  valideDu: string;
  cnps: {
    /** Salaire cotisable mensuel au-delà duquel les cotisations ne montent plus. */
    plafondMensuel: number;
    pvidSalarie: number;
    pvidEmployeur: number;
    prestationsFamiliales: Record<RegimeCnps, number>;
    accidentsTravail: Record<GroupeRisque, number>;
  };
  irpp: {
    /** Brut mensuel imposable jusqu'auquel l'IRPP n'est pas dû. */
    seuilExonerationMensuel: number;
    /** Abattement pour frais professionnels, en pourcentage du brut imposable. */
    abattementFraisPro: number;
    /** Abattement forfaitaire sur le revenu net annuel. */
    abattementAnnuel: number;
    /** Tranches du revenu net annuel. */
    tranchesAnnuelles: Tranche[];
    /** Centimes additionnels communaux, en pourcentage de l'IRPP. */
    cac: number;
  };
  cfc: { salarie: number; employeur: number };
  fne: { employeur: number };
  /** Taxe de développement local, assise sur le salaire de base mensuel. */
  tdl: TrancheForfait[];
  /** Redevance audiovisuelle, assise sur le brut mensuel. Vide si elle ne s'applique pas. */
  rav: TrancheForfait[];
  avantagesNature: Record<AvantageNature, number>;
};

export const REGIME_CNPS_LABELS: Record<RegimeCnps, string> = {
  GENERAL: "Régime général",
  AGRICOLE: "Régime agricole",
  ENSEIGNEMENT: "Enseignement privé",
};

export const GROUPE_RISQUE_LABELS: Record<GroupeRisque, string> = {
  A: "Groupe A — risque faible",
  B: "Groupe B — risque moyen",
  C: "Groupe C — risque élevé",
};

export const AVANTAGE_NATURE_LABELS: Record<AvantageNature, string> = {
  LOGEMENT: "Logement",
  ELECTRICITE: "Électricité",
  EAU: "Eau",
  DOMESTIQUE: "Domestique",
  VEHICULE: "Véhicule",
  NOURRITURE: "Nourriture",
};

export const CLE_BAREME_PAIE = "paie_bareme";

/**
 * Barème installé au premier démarrage : la réglementation camerounaise
 * telle qu'elle s'applique depuis le relèvement du plafond CNPS à 750 000
 * (décret de 2016), IRPP sur salaires du CGI (art. 30 et suivants), CFC,
 * FNE, TDL et RAV. Il reste éditable dans Paramètres, et une nouvelle
 * version datée s'ajoute sans toucher aux précédentes : un bulletin de 2025
 * se recalcule toujours avec le barème de 2025.
 */
export const BAREME_PAIE_DEFAUT: BaremePaie[] = [
  {
    valideDu: "2016-07-01",
    cnps: {
      plafondMensuel: 750_000,
      pvidSalarie: 4.2,
      pvidEmployeur: 4.2,
      prestationsFamiliales: { GENERAL: 7, AGRICOLE: 5.65, ENSEIGNEMENT: 3.7 },
      accidentsTravail: { A: 1.75, B: 2.5, C: 5 },
    },
    irpp: {
      seuilExonerationMensuel: 62_000,
      abattementFraisPro: 30,
      abattementAnnuel: 500_000,
      tranchesAnnuelles: [
        { jusqua: 2_000_000, taux: 10 },
        { jusqua: 3_000_000, taux: 15 },
        { jusqua: 5_000_000, taux: 25 },
        { jusqua: null, taux: 35 },
      ],
      cac: 10,
    },
    cfc: { salarie: 1, employeur: 1.5 },
    fne: { employeur: 1 },
    tdl: [
      { jusqua: 61_999, montant: 0 },
      { jusqua: 75_000, montant: 250 },
      { jusqua: 100_000, montant: 500 },
      { jusqua: 125_000, montant: 750 },
      { jusqua: 150_000, montant: 1_000 },
      { jusqua: 200_000, montant: 1_250 },
      { jusqua: 250_000, montant: 1_500 },
      { jusqua: 300_000, montant: 2_000 },
      { jusqua: 500_000, montant: 2_250 },
      { jusqua: null, montant: 2_500 },
    ],
    rav: [
      { jusqua: 50_000, montant: 0 },
      { jusqua: 100_000, montant: 750 },
      { jusqua: 200_000, montant: 1_950 },
      { jusqua: 300_000, montant: 3_250 },
      { jusqua: 400_000, montant: 4_550 },
      { jusqua: 500_000, montant: 5_850 },
      { jusqua: 600_000, montant: 7_150 },
      { jusqua: 700_000, montant: 8_450 },
      { jusqua: 800_000, montant: 9_750 },
      { jusqua: 900_000, montant: 11_050 },
      { jusqua: 1_000_000, montant: 12_350 },
      { jusqua: null, montant: 13_000 },
    ],
    avantagesNature: {
      LOGEMENT: 15,
      ELECTRICITE: 4,
      EAU: 2,
      DOMESTIQUE: 5,
      VEHICULE: 10,
      NOURRITURE: 10,
    },
  },
];

/**
 * La version du barème en vigueur pour un mois de paie (« AAAA-MM ») : la
 * plus récente dont `valideDu` ne dépasse pas le premier jour du mois.
 * `null` si aucune ne s'applique encore — le moteur refuse alors de calculer
 * plutôt que d'inventer des taux.
 */
export function baremeEnVigueur(versions: BaremePaie[], periode: string): BaremePaie | null {
  const premierJour = `${periode}-01`;
  return (
    [...versions]
      .filter((v) => v.valideDu <= premierJour)
      .sort((a, b) => (a.valideDu < b.valideDu ? 1 : -1))[0] ?? null
  );
}

/** Vérifie qu'un barème est cohérent : tranches croissantes, dernière ouverte, taux positifs. */
export function verifierBareme(b: BaremePaie): string[] {
  const erreurs: string[] = [];
  const tranches = (nom: string, liste: { jusqua: number | null }[]) => {
    if (liste.length === 0) return;
    let precedent = -1;
    liste.forEach((t, i) => {
      const derniere = i === liste.length - 1;
      if (t.jusqua === null && !derniere) erreurs.push(`${nom} : seule la dernière tranche peut être ouverte.`);
      if (t.jusqua !== null && t.jusqua <= precedent) erreurs.push(`${nom} : les tranches doivent être croissantes.`);
      if (t.jusqua !== null) precedent = t.jusqua;
    });
    if (liste[liste.length - 1].jusqua !== null) erreurs.push(`${nom} : la dernière tranche doit être ouverte.`);
  };
  tranches("IRPP", b.irpp.tranchesAnnuelles);
  tranches("TDL", b.tdl);
  tranches("RAV", b.rav);
  if (b.irpp.tranchesAnnuelles.length === 0) erreurs.push("IRPP : au moins une tranche.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.valideDu)) erreurs.push("Date d'application invalide.");
  if (b.cnps.plafondMensuel <= 0) erreurs.push("CNPS : le plafond doit être positif.");
  return erreurs;
}
