"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet, qs } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types des réponses de /api/comptabilite
//
// Les montants de la balance et du grand livre sont rendus en **centimes
// entiers** par le moteur comptable : ils s'affichent avec
// `formatMontantAffichage`, jamais avec une division par 100.
// Les montants des lignes d'écriture, eux, viennent directement de PostgreSQL
// et sont donc des chaînes « 1234.56 ».
// ---------------------------------------------------------------------------

export type Exercice = {
  id: number;
  contribuableId: number;
  libelle: string;
  dateDebut: string;
  dateFin: string;
  systeme: "NORMAL" | "SMT";
  statut: "OUVERT" | "CLOS" | "VERROUILLE";
};

export type Compte = {
  id: number;
  numero: string;
  libelle: string;
  classe: number;
  type: "ACTIF" | "PASSIF" | "CHARGE" | "PRODUIT";
  collectif: boolean;
  lettrable: boolean;
  rapprochable: boolean;
  actif: boolean;
};

export type Journal = {
  id: number;
  code: string;
  libelle: string;
  type: string;
  actif: boolean;
};

export type Ecriture = {
  id: number;
  exerciceId: number;
  journalId: number;
  numeroPiece: string | null;
  dateEcriture: string;
  libelle: string;
  reference: string | null;
  statut: "BROUILLON" | "VALIDEE" | "CONTREPASSEE";
  origine: string;
  contrepasseEcritureId: number | null;
};

export type LigneEcriture = {
  id: number;
  ordre: number;
  compteId: number;
  tiersId: number | null;
  libelle: string | null;
  debit: string;
  credit: string;
  lettrage: string | null;
  dateEcheance: string | null;
};

export type EcritureComplete = Ecriture & { lignes: LigneEcriture[] };

export type LigneBalance = {
  compteId: number;
  compteNumero: string;
  compteLibelle: string;
  totalDebit: number;
  totalCredit: number;
  soldeDebiteur: number;
  soldeCrediteur: number;
};

export type Balance = {
  exercice: Exercice;
  lignes: LigneBalance[];
  totaux: {
    totalDebit: number;
    totalCredit: number;
    totalSoldeDebiteur: number;
    totalSoldeCrediteur: number;
    equilibree: boolean;
  };
};

export type LigneGrandLivre = {
  ligneId: number;
  ecritureId: number;
  dateEcriture: string;
  numeroPiece: string | null;
  journalCode: string;
  libelle: string | null;
  tiersLibelle: string | null;
  lettrage: string | null;
  debit: number;
  credit: number;
  soldeProgressif: number;
};

export type CompteGrandLivre = {
  compteId: number;
  compteNumero: string;
  compteLibelle: string;
  soldeInitial: number;
  lignes: LigneGrandLivre[];
  totalDebit: number;
  totalCredit: number;
  soldeFinal: number;
};

export type GrandLivre = { exercice: Exercice; comptes: CompteGrandLivre[] };

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

/** Le référentiel change rarement : inutile de le recharger à chaque écran. */
const DUREE_REFERENTIEL = 5 * 60_000;

export function useExercices(contribuableId?: number) {
  return useQuery({
    queryKey: ["cpta-exercices", contribuableId],
    enabled: !!contribuableId,
    queryFn: () =>
      apiGet<Exercice[]>(`/api/comptabilite/exercices${qs({ contribuableId })}`),
  });
}

export function useComptes(contribuableId?: number) {
  return useQuery({
    queryKey: ["cpta-comptes", contribuableId],
    enabled: !!contribuableId,
    staleTime: DUREE_REFERENTIEL,
    queryFn: () =>
      apiGet<Compte[]>(`/api/comptabilite/comptes${qs({ contribuableId })}`),
  });
}

export function useJournaux(contribuableId?: number) {
  return useQuery({
    queryKey: ["cpta-journaux", contribuableId],
    enabled: !!contribuableId,
    staleTime: DUREE_REFERENTIEL,
    queryFn: () =>
      apiGet<Journal[]>(`/api/comptabilite/journaux${qs({ contribuableId })}`),
  });
}

export function useEcritures(exerciceId?: number, journalId?: number) {
  return useQuery({
    queryKey: ["cpta-ecritures", exerciceId, journalId],
    enabled: !!exerciceId,
    queryFn: () =>
      apiGet<Ecriture[]>(
        `/api/comptabilite/ecritures${qs({ exerciceId, journalId })}`,
      ),
  });
}

export function useEcriture(ecritureId?: number) {
  return useQuery({
    queryKey: ["cpta-ecriture", ecritureId],
    enabled: !!ecritureId,
    queryFn: () =>
      apiGet<EcritureComplete>(`/api/comptabilite/ecritures/${ecritureId}`),
  });
}

export function useBalance(exerciceId?: number) {
  return useQuery({
    queryKey: ["cpta-balance", exerciceId],
    enabled: !!exerciceId,
    queryFn: () =>
      apiGet<Balance>(`/api/comptabilite/balance${qs({ exerciceId })}`),
  });
}

export function useGrandLivre(exerciceId?: number, compteId?: number) {
  return useQuery({
    queryKey: ["cpta-grand-livre", exerciceId, compteId],
    enabled: !!exerciceId,
    queryFn: () =>
      apiGet<GrandLivre>(
        `/api/comptabilite/grand-livre${qs({ exerciceId, compteId })}`,
      ),
  });
}

/** Toutes les données de la comptabilité dépendent de l'exercice affiché. */
export const CLES_A_RAFRAICHIR = [
  "cpta-ecritures",
  "cpta-ecriture",
  "cpta-balance",
  "cpta-grand-livre",
];

export type Tiers = {
  id: number;
  code: string;
  raisonSociale: string;
  types: string[];
  compteId: number | null;
};

export function useTiers(contribuableId?: number) {
  return useQuery({
    queryKey: ["cpta-tiers", contribuableId],
    enabled: !!contribuableId,
    staleTime: DUREE_REFERENTIEL,
    queryFn: () =>
      apiGet<Tiers[]>(`/api/comptabilite/tiers${qs({ contribuableId })}`),
  });
}
