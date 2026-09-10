import { exigeDsf } from "@/lib/igs";

// ---------------------------------------------------------------------------
// Référentiel métier LaMethode Cabinet & Services
// ---------------------------------------------------------------------------

export type DeclarationType =
  | "DSF"
  | "SOLDE_DSF"
  | "IRPP"
  | "BEF"
  | "BAIL"
  | "PRECOMPTE_LOYER"
  | "TVA"
  | "ACOMPTE_IS"
  | "CNPS"
  | "PATENTE"
  | "IGS"
  | "IGS_ANNUELLE"
  | "AUTRE";

export type Periodicite = "MENSUELLE" | "TRIMESTRIELLE" | "ANNUELLE";
export type StatutDeclaration =
  | "A_FAIRE"
  | "DEPOSEE"
  | "PAYEE"
  | "EN_RETARD"
  | "EXONERE";
export type StatutAcf = "EN_COURS" | "BLOQUE" | "DELIVRE" | "REJETE";
/** Régimes d'imposition applicables au Cameroun (CGI). */
export type RegimeFiscal = "REEL" | "IGS";

export const DECLARATION_TYPES: Record<
  DeclarationType,
  { label: string; periodicite: Periodicite; description: string }
> = {
  DSF: {
    label: "DSF",
    periodicite: "ANNUELLE",
    description: "Déclaration Statistique et Fiscale",
  },
  SOLDE_DSF: {
    label: "Solde DSF",
    periodicite: "ANNUELLE",
    description: "Solde de l'impôt sur les sociétés / IRPP à la liquidation de la DSF",
  },
  BEF: {
    label: "BEF",
    periodicite: "ANNUELLE",
    description: "Déclaration du Bénéficiaire Effectif",
  },
  BAIL: {
    label: "Bail",
    periodicite: "ANNUELLE",
    description: "Déclaration et enregistrement des baux",
  },
  PATENTE: {
    label: "Patente",
    periodicite: "ANNUELLE",
    description: "Contribution des patentes",
  },
  IGS: {
    label: "IGS",
    periodicite: "TRIMESTRIELLE",
    description:
      "Impôt Général Synthétique — forfait annuel payé par quarts trimestriels",
  },
  IGS_ANNUELLE: {
    label: "Déclaration annuelle IGS",
    periodicite: "ANNUELLE",
    description:
      "Déclaration annuelle de chiffre d'affaires des contribuables à l'IGS (télédéclaration Harmony 2)",
  },
  IRPP: {
    label: "IRPP",
    periodicite: "MENSUELLE",
    description: "Impôt sur le Revenu des Personnes Physiques (retenue salaires)",
  },
  PRECOMPTE_LOYER: {
    label: "Précompte sur loyer",
    periodicite: "MENSUELLE",
    description: "Retenue à la source sur les loyers versés",
  },
  TVA: {
    label: "TVA",
    periodicite: "MENSUELLE",
    description: "Taxe sur la Valeur Ajoutée",
  },
  ACOMPTE_IS: {
    label: "Acompte IS",
    periodicite: "MENSUELLE",
    description: "Acompte mensuel de l'Impôt sur les Sociétés",
  },
  CNPS: {
    label: "CNPS",
    periodicite: "MENSUELLE",
    description: "Cotisations sociales CNPS",
  },
  AUTRE: {
    label: "Autre",
    periodicite: "MENSUELLE",
    description: "Autre déclaration",
  },
};

export const DECLARATION_TYPES_ANNUELLES = (
  Object.keys(DECLARATION_TYPES) as DeclarationType[]
).filter((t) => DECLARATION_TYPES[t].periodicite === "ANNUELLE");

export const DECLARATION_TYPES_MENSUELLES = (
  Object.keys(DECLARATION_TYPES) as DeclarationType[]
).filter((t) => DECLARATION_TYPES[t].periodicite === "MENSUELLE" && t !== "AUTRE");

export const DECLARATION_TYPES_TRIMESTRIELLES = (
  Object.keys(DECLARATION_TYPES) as DeclarationType[]
).filter((t) => DECLARATION_TYPES[t].periodicite === "TRIMESTRIELLE");

// ---------------------------------------------------------------------------
// Obligations déclaratives par régime
// ---------------------------------------------------------------------------

/**
 * Obligations standards d'un contribuable selon son régime.
 *
 * L'IGS est libératoire — il remplace l'impôt sur le revenu, la patente et la
 * TVA — donc pas de déclarations mensuelles. Restent le forfait trimestriel et
 * la déclaration annuelle de chiffre d'affaires ; à partir de la classe 8
 * (CA ≥ 10 M FCFA) s'y ajoute la DSF.
 */
export function obligationsPourRegime(
  regime: RegimeFiscal,
  igsClasse?: number | null,
): {
  annuelles: DeclarationType[];
  trimestrielles: DeclarationType[];
  mensuelles: DeclarationType[];
} {
  if (regime === "IGS") {
    return {
      annuelles: exigeDsf(igsClasse)
        ? ["IGS_ANNUELLE", "DSF"]
        : ["IGS_ANNUELLE"],
      trimestrielles: ["IGS"],
      mensuelles: [],
    };
  }
  return {
    annuelles: ["DSF", "BEF", "PATENTE"],
    trimestrielles: [],
    mensuelles: ["TVA", "IRPP", "ACOMPTE_IS", "CNPS"],
  };
}

/**
 * Échéance d'une obligation annuelle. La date dépend du couple type/régime :
 * la DSF est due au 15 mars pour un contribuable au Réel, mais au 15 mai
 * lorsqu'elle accompagne un dossier IGS, et la déclaration annuelle IGS au
 * 15 avril. Toutes portent sur l'exercice écoulé, donc l'année N+1.
 */
export function echeanceAnnuelle(
  type: DeclarationType,
  annee: number,
  regime: RegimeFiscal,
): string {
  const jour15 = (moisIndex: number) =>
    new Date(Date.UTC(annee + 1, moisIndex, 15)).toISOString().slice(0, 10);

  if (type === "IGS_ANNUELLE") return jour15(3); // 15 avril
  if (type === "DSF" && regime === "IGS") return jour15(4); // 15 mai
  return defaultEcheanceAnnuelle(annee); // 15 mars
}

export const PERIODICITE_LABELS: Record<Periodicite, string> = {
  MENSUELLE: "Mensuelle",
  TRIMESTRIELLE: "Trimestrielle",
  ANNUELLE: "Annuelle",
};

/** Exemple de saisie de période attendu pour chaque périodicité. */
export const PERIODE_PLACEHOLDERS: Record<Periodicite, string> = {
  MENSUELLE: "2026-01",
  TRIMESTRIELLE: "2026-T1",
  ANNUELLE: "2026",
};

export const STATUT_DECLARATION_LABELS: Record<StatutDeclaration, string> = {
  A_FAIRE: "À faire",
  DEPOSEE: "Déposée",
  PAYEE: "Payée",
  EN_RETARD: "En retard",
  EXONERE: "Exonérée",
};

export const STATUT_DECLARATION_COLORS: Record<StatutDeclaration, string> = {
  A_FAIRE: "bg-slate-100 text-slate-700 border-slate-300",
  DEPOSEE: "bg-blue-100 text-blue-700 border-blue-300",
  PAYEE: "bg-emerald-100 text-emerald-700 border-emerald-300",
  EN_RETARD: "bg-red-100 text-red-700 border-red-300",
  EXONERE: "bg-purple-100 text-purple-700 border-purple-300",
};

export const STATUT_ACF_LABELS: Record<StatutAcf, string> = {
  EN_COURS: "En cours",
  BLOQUE: "Bloqué",
  DELIVRE: "Délivré",
  REJETE: "Rejeté",
};

export const STATUT_ACF_COLORS: Record<StatutAcf, string> = {
  EN_COURS: "bg-amber-100 text-amber-700 border-amber-300",
  BLOQUE: "bg-red-100 text-red-700 border-red-300",
  DELIVRE: "bg-emerald-100 text-emerald-700 border-emerald-300",
  REJETE: "bg-slate-200 text-slate-700 border-slate-300",
};

export const REGIME_FISCAL_LABELS: Record<RegimeFiscal, string> = {
  REEL: "Régime du Réel",
  IGS: "Impôt Général Synthétique (IGS)",
};

/** Libellés compacts, pour les badges et les colonnes de tableau. */
export const REGIME_FISCAL_LABELS_COURTS: Record<RegimeFiscal, string> = {
  REEL: "Réel",
  IGS: "IGS",
};

export const MOIS_LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export function formatDateFR(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function isEnRetard(dateEcheance: string, statut: StatutDeclaration) {
  if (statut === "PAYEE" || statut === "DEPOSEE" || statut === "EXONERE") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const echeance = new Date(dateEcheance);
  return echeance.getTime() < today.getTime();
}

// Génère la date d'échéance par défaut pour une déclaration mensuelle :
// le 15 du mois suivant la période déclarée (ex: période "2026-01" -> échéance 2026-02-15)
export function defaultEcheanceMensuelle(annee: number, mois: number): string {
  const d = new Date(Date.UTC(annee, mois, 15)); // mois est 0-11 pour le mois suivant
  return d.toISOString().slice(0, 10);
}

// Génère la date d'échéance par défaut pour une déclaration annuelle :
// 15 mars de l'année suivante (échéance légale DSF au Cameroun)
export function defaultEcheanceAnnuelle(annee: number): string {
  const d = new Date(Date.UTC(annee + 1, 2, 15));
  return d.toISOString().slice(0, 10);
}
