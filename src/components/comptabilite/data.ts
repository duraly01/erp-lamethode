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
  /** Compte de trésorerie d'un journal de banque ou de caisse. */
  compteContrepartieId: number | null;
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
  "cpta-etats-financiers",
  "cpta-tva",
  "cpta-dsf",
  "cpta-flux-tresorerie",
  "cpta-notes-annexes",
  "cpta-rapprochements",
  "cpta-rapprochement",
  "cpta-postes-tiers",
  "cpta-pieces",
  "cpta-piece",
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

// ---------------------------------------------------------------------------
// États financiers (E2)
//
// Les montants sont en centimes entiers, comme la balance dont ils se
// déduisent. La colonne N-1 vaut `null` quand aucun exercice précédent n'est
// rattaché : c'est différent de zéro, qui affirmerait qu'il n'y avait rien.
// ---------------------------------------------------------------------------

export type LigneBilan = {
  code: string;
  libelle: string;
  niveau?: 1 | 2;
  estTotal: boolean;
  brut: number;
  amortissements: number;
  net: number;
  netPrecedent: number | null;
};

export type LigneResultat = {
  code: string;
  libelle: string;
  estTotal: boolean;
  montant: number;
  montantPrecedent: number | null;
};

export type CompteNonRattache = {
  compteNumero: string;
  compteLibelle: string;
  solde: number;
};

export type RattachementAConfirmer = {
  prefixe: string;
  poste: string;
  motif: string;
};

export type LigneSmt = {
  code: string;
  libelle: string;
  montant: number;
  estTotal: boolean;
};

/** Système minimal de trésorerie : les mêmes états, regroupés en quelques lignes. */
export type EtatsSmt = {
  actif: LigneSmt[];
  passif: LigneSmt[];
  recettes: LigneSmt[];
  depenses: LigneSmt[];
  resultatNet: number;
  totalActif: number;
  totalPassif: number;
  equilibre: boolean;
};

export type EtatsFinanciers = {
  exercice: Exercice;
  exercicePrecedent: { id: number; libelle: string } | null;
  smt: EtatsSmt;
  smtPrecedent: EtatsSmt | null;
  bilan: {
    actif: LigneBilan[];
    passif: LigneBilan[];
    totalActif: number;
    totalPassif: number;
    equilibre: boolean;
    ecart: number;
  };
  resultat: { lignes: LigneResultat[]; resultatNet: number };
  comptesNonRattaches: CompteNonRattache[];
  rattachementsAConfirmer: RattachementAConfirmer[];
};

export function useEtatsFinanciers(exerciceId?: number) {
  return useQuery({
    queryKey: ["cpta-etats-financiers", exerciceId],
    enabled: !!exerciceId,
    queryFn: () =>
      apiGet<EtatsFinanciers>(
        `/api/comptabilite/etats-financiers${qs({ exerciceId })}`,
      ),
  });
}

// ---------------------------------------------------------------------------
// Déclarations calculées depuis les livres (E2)
// ---------------------------------------------------------------------------

/** Déclaration du suivi des obligations, telle que l'API la renvoie. */
export type EcheanceDeclaration = {
  id: number;
  statut: string;
  dateEcheance: string;
  montant: string | null;
};

export type LigneTva = {
  compteNumero: string;
  compteLibelle: string;
  montant: number;
  totalDebit: number;
  totalCredit: number;
};

export type DeclarationTva = {
  exercice: Exercice;
  periode: string;
  dateDebut: string;
  dateFin: string;
  collectee: LigneTva[];
  deductible: LigneTva[];
  totalCollectee: number;
  totalDeductible: number;
  creditAnterieur: number;
  /** Non nul : des périodes antérieures n'ont pas été liquidées. */
  tvaAnterieureNonLiquidee: number;
  tvaDue: number;
  creditAReporter: number;
  declaration: EcheanceDeclaration | null;
};

export function useTva(exerciceId?: number, periode?: string) {
  return useQuery({
    queryKey: ["cpta-tva", exerciceId, periode],
    enabled: !!exerciceId && !!periode,
    queryFn: () =>
      apiGet<DeclarationTva>(`/api/comptabilite/tva${qs({ exerciceId, periode })}`),
  });
}

/** Montants nuls tant que le barème d'impôt n'est pas paramétré. */
export type Liquidation = {
  chiffreAffaires: number;
  resultatComptable: number;
  reintegrations: number;
  deductions: number;
  resultatFiscal: number;
  acomptesVerses: number;
  impotSurResultat: number | null;
  minimumPerception: number | null;
  impotRetenu: number | null;
  minimumApplique: boolean;
  soldeAPayer: number | null;
  creditImpot: number | null;
  baremeManquant: boolean;
};

export type Dsf = {
  exercice: Exercice;
  annee: string;
  etats: EtatsFinanciers;
  liquidation: Liquidation;
  declaration: EcheanceDeclaration | null;
};

export type RetraitementsSaisis = { reintegrations: string; deductions: string };

export function useDsf(exerciceId?: number, retraitements?: RetraitementsSaisis) {
  const { reintegrations = "", deductions = "" } = retraitements ?? {};
  return useQuery({
    queryKey: ["cpta-dsf", exerciceId, reintegrations, deductions],
    enabled: !!exerciceId,
    queryFn: () =>
      apiGet<Dsf>(
        `/api/comptabilite/dsf${qs({
          exerciceId,
          reintegrations: reintegrations || undefined,
          deductions: deductions || undefined,
        })}`,
      ),
  });
}

// ---------------------------------------------------------------------------
// Tableau des flux de trésorerie (E2)
// ---------------------------------------------------------------------------

export type LigneFlux = {
  code: string;
  libelle: string;
  /** Flux signé : négatif quand il décaisse. */
  montant: number;
  estTotal: boolean;
  section: "OUVERTURE" | "OPERATIONNEL" | "INVESTISSEMENT" | "FINANCEMENT" | "CLOTURE";
};

export type FluxTresorerie = {
  exercice: Exercice;
  sansANouveaux: boolean;
  lignes: LigneFlux[];
  tresorerieOuverture: number;
  tresorerieCloture: number;
  tresorerieReconstituee: number;
  ecart: number;
  coherent: boolean;
  comptesHorsTableau: {
    compteNumero: string;
    compteLibelle: string;
    variation: number;
  }[];
};

export function useFluxTresorerie(exerciceId?: number) {
  return useQuery({
    queryKey: ["cpta-flux-tresorerie", exerciceId],
    enabled: !!exerciceId,
    queryFn: () =>
      apiGet<FluxTresorerie>(
        `/api/comptabilite/flux-tresorerie${qs({ exerciceId })}`,
      ),
  });
}

// ---------------------------------------------------------------------------
// Notes annexes (E2)
// ---------------------------------------------------------------------------

export type DefinitionNote = {
  code: string;
  numero: string;
  libelle: string;
  forme: "MOUVEMENTS" | "SOLDES" | "CHARGES_PRODUITS";
  postes: string[];
};

export type LigneNoteMouvements = {
  compteNumero: string;
  compteLibelle: string;
  debut: number;
  augmentations: number;
  diminutions: number;
  fin: number;
};

export type LigneNoteSoldes = {
  compteNumero: string;
  compteLibelle: string;
  debut: number;
  fin: number;
  variation: number;
};

export type LigneNoteChargesProduits = {
  compteNumero: string;
  compteLibelle: string;
  montant: number;
};

export type Note =
  | { definition: DefinitionNote; forme: "MOUVEMENTS"; lignes: LigneNoteMouvements[]; total: LigneNoteMouvements }
  | { definition: DefinitionNote; forme: "SOLDES"; lignes: LigneNoteSoldes[]; total: LigneNoteSoldes }
  | { definition: DefinitionNote; forme: "CHARGES_PRODUITS"; lignes: LigneNoteChargesProduits[]; total: number };

export type NotesAnnexes = {
  exercice: Exercice;
  sansANouveaux: boolean;
  notes: Note[];
  aRediger: { numero: string; libelle: string }[];
};

export function useNotesAnnexes(exerciceId?: number) {
  return useQuery({
    queryKey: ["cpta-notes-annexes", exerciceId],
    enabled: !!exerciceId,
    queryFn: () =>
      apiGet<NotesAnnexes>(`/api/comptabilite/notes-annexes${qs({ exerciceId })}`),
  });
}

// ---------------------------------------------------------------------------
// Saisie assistée (E3)
// ---------------------------------------------------------------------------

export type Taxe = {
  id: number;
  code: string;
  libelle: string;
  /** Taux en pourcentage, « 19.2500 ». */
  taux: string;
  type: "TVA_COLLECTEE" | "TVA_DEDUCTIBLE" | "RETENUE" | "ACOMPTE";
  compteId: number | null;
  compteNumero: string | null;
  valideDu: string;
  valideAu: string | null;
};

export function useTaxes(contribuableId?: number) {
  return useQuery({
    queryKey: ["cpta-taxes", contribuableId],
    enabled: !!contribuableId,
    staleTime: DUREE_REFERENTIEL,
    queryFn: () =>
      apiGet<Taxe[]>(`/api/comptabilite/taxes${qs({ contribuableId })}`),
  });
}

// ---------------------------------------------------------------------------
// Rapprochement bancaire (E3)
// ---------------------------------------------------------------------------

export type Rapprochement = {
  id: number;
  exerciceId: number;
  compteId: number;
  dateRapprochement: string;
  soldeReleve: string;
  soldeComptable: string;
  ecart: string;
  cloture: boolean;
};

export type LigneBancaire = {
  ligneId: number;
  ecritureId: number;
  dateEcriture: string;
  numeroPiece: string | null;
  libelle: string | null;
  tiersLibelle: string | null;
  debit: number;
  credit: number;
  pointee: boolean;
};

export type EtatRapprochement = {
  soldeComptable: number;
  soldeReleve: number;
  debitsNonPointes: number;
  creditsNonPointes: number;
  soldeRapproche: number;
  ecart: number;
  juste: boolean;
  nonPointees: LigneBancaire[];
  pointees: LigneBancaire[];
};

export type RapprochementDetail = {
  rapprochement: Rapprochement;
  compte: { id: number; numero: string; libelle: string };
  etat: EtatRapprochement;
  proposition: LigneBancaire[] | null;
};

export function useRapprochements(exerciceId?: number, compteId?: number) {
  return useQuery({
    queryKey: ["cpta-rapprochements", exerciceId, compteId],
    enabled: !!exerciceId && !!compteId,
    queryFn: () =>
      apiGet<Rapprochement[]>(
        `/api/comptabilite/rapprochements${qs({ exerciceId, compteId })}`,
      ),
  });
}

export function useRapprochement(id?: number) {
  return useQuery({
    queryKey: ["cpta-rapprochement", id],
    enabled: !!id,
    queryFn: () => apiGet<RapprochementDetail>(`/api/comptabilite/rapprochements/${id}`),
  });
}

// ---------------------------------------------------------------------------
// Postes ouverts d'un tiers (lettrage à la saisie d'un règlement)
// ---------------------------------------------------------------------------

export type PosteOuvertTiers = {
  ligneId: number;
  compteId: number;
  tiersId: number | null;
  debit: string;
  credit: string;
  lettrage: string | null;
  dateEcriture: string;
  numeroPiece: string | null;
  libelle: string;
  dateEcheance: string | null;
  /** Reste dû en centimes, positif au débit (le tiers doit), négatif au crédit. */
  solde: number;
};

export function usePostesOuvertsTiers(tiersId?: number) {
  return useQuery({
    queryKey: ["cpta-postes-tiers", tiersId],
    enabled: !!tiersId,
    queryFn: () => apiGet<PosteOuvertTiers[]>(`/api/comptabilite/tiers/${tiersId}/postes-ouverts`),
  });
}

// ---------------------------------------------------------------------------
// Pièces persistées (E3)
// ---------------------------------------------------------------------------

export type TypePiece = "FACTURE_VENTE" | "FACTURE_ACHAT";
export type StatutComptable = "NON_COMPTABILISEE" | "BROUILLON" | "VALIDEE" | "CONTREPASSEE";
export type StatutReglement = "SANS_OBJET" | "EN_ATTENTE" | "EN_RETARD" | "REGLEE";

export type Piece = {
  id: number;
  exerciceId: number;
  type: TypePiece;
  reference: string | null;
  tiersId: number;
  tiers: { code: string; raisonSociale: string };
  datePiece: string;
  dateEcheance: string | null;
  totalHt: string;
  totalTva: string;
  totalTtc: string;
  ecritureId: number | null;
  numeroPiece: string | null;
  notes: string | null;
  statutComptable: StatutComptable;
  statutReglement: StatutReglement;
};

export type LignePiece = {
  id: number;
  ordre: number;
  compteId: number;
  compteNumero: string;
  compteLibelle: string;
  libelle: string | null;
  montantHt: string;
  taxeId: number | null;
  taxeLibelle: string | null;
  taux: string | null;
};

export type PieceDetail = Piece & { lignes: LignePiece[] };

export function usePieces(exerciceId?: number, filtre?: { type?: TypePiece; tiersId?: number }) {
  return useQuery({
    queryKey: ["cpta-pieces", exerciceId, filtre?.type ?? null, filtre?.tiersId ?? null],
    enabled: !!exerciceId,
    queryFn: () =>
      apiGet<Piece[]>(
        `/api/comptabilite/pieces${qs({ exerciceId, type: filtre?.type, tiersId: filtre?.tiersId })}`,
      ),
  });
}

export function usePiece(id?: number) {
  return useQuery({
    queryKey: ["cpta-piece", id],
    enabled: !!id,
    queryFn: () => apiGet<PieceDetail>(`/api/comptabilite/pieces/${id}`),
  });
}

// ---------------------------------------------------------------------------
// Immobilisations (E5)
// ---------------------------------------------------------------------------

export type ModeAmortissement = "LINEAIRE" | "DEGRESSIF";
export type StatutImmobilisation = "EN_SERVICE" | "CEDEE" | "REBUT";

export type Immobilisation = {
  id: number;
  contribuableId: number;
  code: string;
  libelle: string;
  description: string | null;
  compteId: number;
  compteAmortissementId: number | null;
  compteDotationId: number | null;
  dateAcquisition: string;
  dateMiseEnService: string;
  valeurOrigine: string;
  valeurResiduelle: string;
  mode: ModeAmortissement;
  dureeMois: number | null;
  fournisseurId: number | null;
  pieceId: number | null;
  referenceFacture: string | null;
  statut: StatutImmobilisation;
  dateSortie: string | null;
  prixCession: string | null;
  ecritureSortieId: number | null;
  notes: string | null;
  compteNumero: string;
  compteLibelle: string;
};

export type ImmobilisationResume = Immobilisation & {
  cumulAmortissements: string;
  valeurNette: string;
  doteeDansExercice: boolean | null;
};

export type LignePlanAmortissement = {
  dateDebut: string;
  dateFin: string;
  base: string;
  dotation: string;
  cumulFin: string;
  vncFin: string;
  exercice: { id: number; libelle: string; statut: string } | null;
  passee: { montant: string; ecritureId: number; numeroPiece: string | null } | null;
};

export type ImmobilisationDetail = Immobilisation & {
  fournisseur: { code: string; raisonSociale: string } | null;
  modifiable: boolean;
  plan: LignePlanAmortissement[];
  ecritureSortie: { numeroPiece: string | null; statut: string } | null;
};

export type PrevisionDotations = {
  exercice: { id: number; libelle: string; statut: string };
  lignes: { id: number; code: string; libelle: string; dotation: string }[];
};

export type LigneTableauImmobilisations = {
  id: number;
  code: string;
  libelle: string;
  compteNumero: string;
  brutDebut: string;
  acquisitions: string;
  sorties: string;
  brutFin: string;
  amortDebut: string;
  dotation: string;
  amortSorties: string;
  amortFin: string;
  vncFin: string;
  dotee: boolean;
};

export type TableauImmobilisations = {
  exercice: { id: number; libelle: string; dateDebut: string; dateFin: string };
  lignes: LigneTableauImmobilisations[];
  totaux: Omit<LigneTableauImmobilisations, "id" | "code" | "libelle" | "compteNumero" | "dotee">;
};

export function useImmobilisations(contribuableId?: number, exerciceId?: number) {
  return useQuery({
    queryKey: ["cpta-immobilisations", contribuableId, exerciceId],
    enabled: !!contribuableId,
    queryFn: () => apiGet<ImmobilisationResume[]>(`/api/comptabilite/immobilisations${qs({ contribuableId, exerciceId })}`),
  });
}

export function useImmobilisation(id?: number) {
  return useQuery({
    queryKey: ["cpta-immobilisation", id],
    enabled: !!id,
    queryFn: () => apiGet<ImmobilisationDetail>(`/api/comptabilite/immobilisations/${id}`),
  });
}

export function usePrevisionDotations(exerciceId?: number) {
  return useQuery({
    queryKey: ["cpta-dotations", exerciceId],
    enabled: !!exerciceId,
    queryFn: () => apiGet<PrevisionDotations>(`/api/comptabilite/immobilisations/dotations${qs({ exerciceId })}`),
  });
}

export function useTableauImmobilisations(exerciceId?: number) {
  return useQuery({
    queryKey: ["cpta-tableau-immobilisations", exerciceId],
    enabled: !!exerciceId,
    queryFn: () => apiGet<TableauImmobilisations>(`/api/comptabilite/immobilisations/tableau${qs({ exerciceId })}`),
  });
}

// ---------------------------------------------------------------------------
// Comptabilité analytique (E5)
// ---------------------------------------------------------------------------

export type SectionAnalytique = { id: number; axeId: number; code: string; libelle: string; actif: boolean };
export type AxeAnalytique = { id: number; contribuableId: number; code: string; libelle: string; actif: boolean; sections: SectionAnalytique[] };

export type LigneAVentiler = {
  ligneId: number;
  ecritureId: number;
  numeroPiece: string | null;
  dateEcriture: string;
  journalCode: string;
  libelle: string;
  compteId: number;
  compteNumero: string;
  compteLibelle: string;
  montant: string;
  sens: "DEBIT" | "CREDIT";
  ventilations: { sectionId: number; montant: string }[];
  reste: string;
};

export type LignesAnalytiques = {
  axe: { id: number; code: string; libelle: string };
  sections: { id: number; code: string; libelle: string; actif: boolean }[];
  lignes: LigneAVentiler[];
};

export type RestitutionAnalytique = {
  exercice: { id: number; libelle: string };
  axe: { id: number; code: string; libelle: string };
  lignes: {
    section: { id: number; code: string; libelle: string } | null;
    charges: string;
    produits: string;
    resultat: string;
    comptes: { numero: string; libelle: string; charges: string; produits: string }[];
  }[];
  totaux: { charges: string; produits: string; resultat: string };
};

export function useAxesAnalytiques(contribuableId?: number) {
  return useQuery({
    queryKey: ["cpta-axes", contribuableId],
    enabled: !!contribuableId,
    queryFn: () => apiGet<AxeAnalytique[]>(`/api/comptabilite/analytique/axes${qs({ contribuableId })}`),
  });
}

export function useLignesAnalytiques(exerciceId?: number, axeId?: number, etat?: "A_VENTILER" | "TOUTES", compte?: string) {
  return useQuery({
    queryKey: ["cpta-analytique-lignes", exerciceId, axeId, etat, compte],
    enabled: !!exerciceId && !!axeId,
    queryFn: () => apiGet<LignesAnalytiques>(`/api/comptabilite/analytique/lignes${qs({ exerciceId, axeId, etat, compte })}`),
  });
}

export function useRestitutionAnalytique(exerciceId?: number, axeId?: number) {
  return useQuery({
    queryKey: ["cpta-analytique-restitution", exerciceId, axeId],
    enabled: !!exerciceId && !!axeId,
    queryFn: () => apiGet<RestitutionAnalytique>(`/api/comptabilite/analytique/restitution${qs({ exerciceId, axeId })}`),
  });
}
