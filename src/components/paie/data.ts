"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet, qs } from "@/lib/api-client";
import { formatMontantAffichage } from "@/lib/comptable/money";

// ---------------------------------------------------------------------------
// Types des réponses de /api/paie. Les montants viennent de PostgreSQL en
// chaînes « 1234.00 » : `francs` les affiche.
// ---------------------------------------------------------------------------

export type RegimeCnps = "GENERAL" | "AGRICOLE" | "ENSEIGNEMENT";
export type GroupeRisque = "A" | "B" | "C";
export type ModePaiement = "VIREMENT" | "CHEQUE" | "ESPECES";

export type RubriqueFixe = {
  id?: number;
  libelle: string;
  montant: string;
  cotisable: boolean;
  imposable: boolean;
};

export type Salarie = {
  id: number;
  contribuableId: number;
  matricule: string;
  nom: string;
  prenoms: string | null;
  niu: string | null;
  numeroCnps: string | null;
  dateNaissance: string | null;
  dateEmbauche: string;
  dateSortie: string | null;
  poste: string | null;
  categorie: string | null;
  echelon: string | null;
  salaireBase: string;
  regimeCnps: RegimeCnps;
  groupeRisque: GroupeRisque;
  modePaiement: ModePaiement;
  banque: string | null;
  avantagesNature: string[];
  actif: boolean;
  notes: string | null;
};

export type SalarieDetail = Salarie & { rubriquesFixes: RubriqueFixe[] };

export type StatutPeriode = "BROUILLON" | "VALIDEE";

export type PeriodeResume = {
  id: number;
  periode: string;
  statut: StatutPeriode;
  baremeValideDu: string;
  ecritureId: number | null;
  valideeLe: string | null;
  bulletins: number;
  totalBrut: string;
  totalNet: string;
  totalCharges: string;
};

export type ElementsBulletin = {
  joursAbsence: number;
  heuresSup: string | null;
  primes: RubriqueFixe[];
  avances: string | null;
  autresRetenues: { libelle: string; montant: string }[];
};

export type Bulletin = {
  id: number;
  periodeId: number;
  salarieId: number;
  elements: Partial<ElementsBulletin>;
  matricule: string;
  nomComplet: string;
  poste: string | null;
  categorie: string | null;
  numeroCnps: string | null;
  salaireBase: string;
  regimeCnps: RegimeCnps;
  groupeRisque: GroupeRisque;
  modePaiement: ModePaiement;
  brut: string;
  brutCotisable: string;
  brutImposable: string;
  cnpsSalarie: string;
  irpp: string;
  cac: string;
  cfcSalarie: string;
  tdl: string;
  rav: string;
  avances: string;
  autresRetenues: string;
  totalRetenues: string;
  netAPayer: string;
  cnpsEmployeur: string;
  cfcEmployeur: string;
  fne: string;
  chargesEmployeur: string;
  /** Écriture de trésorerie qui a réglé le net, ou null tant qu'il n'est pas payé. */
  reglementEcritureId: number | null;
};

export type PeriodeDetail = {
  id: number;
  contribuableId: number;
  periode: string;
  statut: StatutPeriode;
  baremeValideDu: string;
  ecritureId: number | null;
  valideeLe: string | null;
  bulletins: Bulletin[];
  totaux: Record<string, string>;
};

export type LigneBulletin = {
  id: number;
  ordre: number;
  type: "GAIN" | "RETENUE" | "EMPLOYEUR";
  code: string;
  libelle: string;
  base: string | null;
  taux: string | null;
  montant: string;
  enNature: boolean;
};

export type BulletinDetail = Bulletin & {
  periode: { id: number; periode: string; statut: StatutPeriode; contribuableId: number };
  lignes: LigneBulletin[];
};

/** Ce que le règlement d'un mois a besoin de savoir : journaux de trésorerie et état des bulletins. */
export type PreparationReglement = {
  periodeId: number;
  comptabilisee: boolean;
  journaux: { id: number; code: string; libelle: string; type: string; compteContrepartieId: number | null }[];
  bulletins: {
    id: number;
    matricule: string;
    nomComplet: string;
    modePaiement: ModePaiement;
    typeJournal: "BANQUE" | "CAISSE";
    netAPayer: string;
    reglementEcritureId: number | null;
  }[];
};

export function francs(numeric: string | number | null | undefined) {
  if (numeric === null || numeric === undefined || numeric === "") return "—";
  return formatMontantAffichage(Math.round(Number(numeric) * 100));
}

/** « 2026-06 » → « juin 2026 ». */
export function libelleMois(periode: string) {
  const [a, m] = periode.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

export const REGIME_LABELS: Record<RegimeCnps, string> = {
  GENERAL: "Général",
  AGRICOLE: "Agricole",
  ENSEIGNEMENT: "Enseignement privé",
};

export const GROUPE_LABELS: Record<GroupeRisque, string> = {
  A: "A — faible",
  B: "B — moyen",
  C: "C — élevé",
};

export const MODE_PAIEMENT_LABELS: Record<ModePaiement, string> = {
  VIREMENT: "Virement",
  CHEQUE: "Chèque",
  ESPECES: "Espèces",
};

export const AVANTAGES: { code: string; libelle: string }[] = [
  { code: "LOGEMENT", libelle: "Logement" },
  { code: "ELECTRICITE", libelle: "Électricité" },
  { code: "EAU", libelle: "Eau" },
  { code: "DOMESTIQUE", libelle: "Domestique" },
  { code: "VEHICULE", libelle: "Véhicule" },
  { code: "NOURRITURE", libelle: "Nourriture" },
];

export function useSalaries(contribuableId: number | undefined) {
  return useQuery({
    queryKey: ["paie-salaries", contribuableId],
    queryFn: () => apiGet<Salarie[]>(`/api/paie/salaries${qs({ contribuableId })}`),
    enabled: contribuableId !== undefined,
  });
}

export function useSalarie(id: number | null) {
  return useQuery({
    queryKey: ["paie-salarie", id],
    queryFn: () => apiGet<SalarieDetail>(`/api/paie/salaries/${id}`),
    enabled: id !== null,
  });
}

export function usePeriodes(contribuableId: number | undefined) {
  return useQuery({
    queryKey: ["paie-periodes", contribuableId],
    queryFn: () => apiGet<PeriodeResume[]>(`/api/paie/periodes${qs({ contribuableId })}`),
    enabled: contribuableId !== undefined,
  });
}

export function usePeriode(id: number | null) {
  return useQuery({
    queryKey: ["paie-periode", id],
    queryFn: () => apiGet<PeriodeDetail>(`/api/paie/periodes/${id}`),
    enabled: id !== null,
  });
}

export function useBulletin(id: number | null) {
  return useQuery({
    queryKey: ["paie-bulletin", id],
    queryFn: () => apiGet<BulletinDetail>(`/api/paie/bulletins/${id}`),
    enabled: id !== null,
  });
}

export function usePreparationReglement(periodeId: number | null) {
  return useQuery({
    queryKey: ["paie-reglement", periodeId],
    queryFn: () => apiGet<PreparationReglement>(`/api/paie/periodes/${periodeId}/reglement`),
    enabled: periodeId !== null,
  });
}
