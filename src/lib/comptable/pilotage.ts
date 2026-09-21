// ---------------------------------------------------------------------------
// Tableau de bord de gestion mensuel — module pur (A1, docs/23).
//
// Le compte de résultat annuel arrive trop tard : une baisse du chiffre
// d'affaires ou une marge qui ne couvre plus les charges doivent se voir le
// mois où elles se produisent. Ce module découpe l'exercice en mois et
// calcule, pour chacun, les soldes intermédiaires de gestion SYSCOHADA —
// exactement ceux du compte de résultat, par les mêmes rattachements de
// comptes, pour qu'un total mensuel additionné sur l'année retombe sur la
// liasse.
//
// Rien n'est cumulé en base : tout se recalcule depuis les lignes d'écriture.
// Montants en centimes entiers.
// ---------------------------------------------------------------------------

import { calculerBalance, type Mouvement } from "./balance";
import { mensualiser, moisEntames, type LigneBudget } from "./budget";
import { calculerCompteResultat } from "./etats-financiers";
import { sommeMontants } from "./money";

/** Une ligne d'écriture de gestion, avec la date qui la range dans un mois. */
export type MouvementDate = Mouvement & { dateEcriture: string };

export type MoisPilotage = {
  /** Mois au format `AAAA-MM`. */
  mois: string;
  /** Ventes de marchandises (TA), base du taux de marge. */
  ventesMarchandises: number;
  /** Chiffre d'affaires (XB). */
  chiffreAffaires: number;
  /** Marge commerciale (XA). */
  margeCommerciale: number;
  /** Marge commerciale rapportée aux ventes de marchandises, en % ; nul sans vente. */
  tauxMarge: number | null;
  /** Valeur ajoutée (XC). */
  valeurAjoutee: number;
  /** Charges de personnel (RK). */
  chargesPersonnel: number;
  /** Excédent brut d'exploitation (XD). */
  ebe: number;
  /** Résultat d'exploitation (XE). */
  resultatExploitation: number;
  /** Résultat net (XI). */
  resultatNet: number;
  /** Chiffre d'affaires prévu au budget pour le mois ; nul sans budget. */
  budgetChiffreAffaires: number | null;
  /** Résultat prévu au budget pour le mois ; nul sans budget. */
  budgetResultat: number | null;
};

export type Pilotage = {
  /** Un élément par mois, du premier de l'exercice au dernier demandé. */
  mois: MoisPilotage[];
  /** Somme des mois : le « à date ». */
  cumul: Omit<MoisPilotage, "mois">;
};

/** Ce qu'il faut d'un budget pour le mensualiser : ses lignes et la longueur de l'exercice. */
export type BudgetPilotage = {
  lignes: Pick<LigneBudget, "compteNumero" | "montantAnnuel" | "mensualisation">[];
  nbMois: number;
};

/** Mois `AAAA-MM` d'une date ISO. */
export function moisDe(dateIso: string): string {
  return dateIso.slice(0, 7);
}

/** Les mois de `debut` à `fin` inclus, dans l'ordre. */
export function listerMois(debut: string, fin: string): string[] {
  const n = moisEntames(debut, fin);
  const [a, m] = debut.split("-").map(Number);
  const mois: string[] = [];
  for (let i = 0; i < n; i++) {
    const total = a * 12 + (m - 1) + i;
    const annee = Math.floor(total / 12);
    const numero = (total % 12) + 1;
    mois.push(`${annee}-${String(numero).padStart(2, "0")}`);
  }
  return mois;
}

function pct(part: number, base: number): number | null {
  return base === 0 ? null : Math.round((part / base) * 1000) / 10;
}

function estCharge(numero: string): boolean {
  return numero.startsWith("6") || (numero.startsWith("8") && Number(numero[1]) % 2 === 1);
}

/**
 * Budget mensuel de chiffre d'affaires et de résultat, un couple par mois de
 * l'exercice. Le chiffre d'affaires budgété reprend les comptes 70 ; le
 * résultat, produits moins charges des classes 6, 7 et 8.
 */
function mensualiserBudget(budget: BudgetPilotage): { ca: number[]; resultat: number[] } {
  const ca = Array(budget.nbMois).fill(0) as number[];
  const resultat = Array(budget.nbMois).fill(0) as number[];
  for (const l of budget.lignes) {
    const parMois = mensualiser(l.montantAnnuel, budget.nbMois, l.mensualisation);
    const signe = estCharge(l.compteNumero) ? -1 : 1;
    for (let i = 0; i < budget.nbMois; i++) {
      resultat[i] = sommeMontants([resultat[i], signe * parMois[i]]);
      if (l.compteNumero.startsWith("70")) ca[i] = sommeMontants([ca[i], parMois[i]]);
    }
  }
  return { ca, resultat };
}

/**
 * Le tableau de bord de l'exercice jusqu'à une date.
 *
 * Les mouvements postérieurs à `jusquAu` sont ignorés ; ceux antérieurs au
 * début de l'exercice ne devraient pas exister et sont ignorés de même. Le
 * budget, s'il est donné, se mensualise sur toute la longueur de l'exercice,
 * puis on n'en garde que les mois affichés.
 */
export function calculerPilotage(
  exercice: { dateDebut: string; dateFin: string },
  mouvements: MouvementDate[],
  jusquAu: string,
  budget: BudgetPilotage | null = null,
): Pilotage {
  const fin = jusquAu < exercice.dateFin ? jusquAu : exercice.dateFin;
  const moisAffiches = listerMois(exercice.dateDebut, fin);
  const parMois = new Map<string, MouvementDate[]>(moisAffiches.map((m) => [m, []]));

  for (const mv of mouvements) {
    if (mv.dateEcriture > fin || mv.dateEcriture < exercice.dateDebut) continue;
    parMois.get(moisDe(mv.dateEcriture))?.push(mv);
  }

  const budgetMensuel = budget ? mensualiserBudget(budget) : null;

  const mois: MoisPilotage[] = moisAffiches.map((cle, i) => {
    const { lignes } = calculerCompteResultat(calculerBalance(parMois.get(cle) ?? []));
    const poste = (code: string) => lignes.find((l) => l.code === code)?.montant ?? 0;
    const ventesMarchandises = poste("TA");
    const margeCommerciale = poste("XA");
    return {
      mois: cle,
      ventesMarchandises,
      chiffreAffaires: poste("XB"),
      margeCommerciale,
      tauxMarge: pct(margeCommerciale, ventesMarchandises),
      valeurAjoutee: poste("XC"),
      chargesPersonnel: poste("RK"),
      ebe: poste("XD"),
      resultatExploitation: poste("XE"),
      resultatNet: poste("XI"),
      budgetChiffreAffaires: budgetMensuel ? budgetMensuel.ca[i] ?? 0 : null,
      budgetResultat: budgetMensuel ? budgetMensuel.resultat[i] ?? 0 : null,
    };
  });

  const somme = (cle: keyof Omit<MoisPilotage, "mois" | "tauxMarge" | "budgetChiffreAffaires" | "budgetResultat">) =>
    sommeMontants(mois.map((m) => m[cle]));
  const sommeBudget = (cle: "budgetChiffreAffaires" | "budgetResultat") =>
    budgetMensuel ? sommeMontants(mois.map((m) => m[cle] ?? 0)) : null;

  const ventesMarchandises = somme("ventesMarchandises");
  const margeCommerciale = somme("margeCommerciale");

  return {
    mois,
    cumul: {
      ventesMarchandises,
      chiffreAffaires: somme("chiffreAffaires"),
      margeCommerciale,
      tauxMarge: pct(margeCommerciale, ventesMarchandises),
      valeurAjoutee: somme("valeurAjoutee"),
      chargesPersonnel: somme("chargesPersonnel"),
      ebe: somme("ebe"),
      resultatExploitation: somme("resultatExploitation"),
      resultatNet: somme("resultatNet"),
      budgetChiffreAffaires: sommeBudget("budgetChiffreAffaires"),
      budgetResultat: sommeBudget("budgetResultat"),
    },
  };
}
