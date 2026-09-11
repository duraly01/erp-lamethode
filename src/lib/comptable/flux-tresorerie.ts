// ---------------------------------------------------------------------------
// Tableau des flux de trésorerie SYSCOHADA révisé — module pur.
//
// Le tableau explique le passage de la trésorerie d'ouverture à celle de
// clôture par trois familles de flux : opérationnels, d'investissement, de
// financement. Il se construit par la méthode indirecte, en partant du
// résultat net que l'on corrige des charges et produits sans effet sur la
// trésorerie, puis des variations du besoin en fonds de roulement.
//
// Ce qui est fourni au module :
//
// - l'**ouverture** : la balance des seules écritures d'à-nouveaux. C'est le
//   bilan de départ, tel qu'il a été repris ;
// - les **mouvements** : la balance de toutes les autres écritures de
//   l'exercice. Ce sont les flux de la période, avec pour chaque compte ses
//   débits et ses crédits — pas seulement son solde, car un emprunt souscrit
//   et un emprunt remboursé sont deux flux distincts, même s'ils se
//   neutralisent au bilan.
//
// Invariant : la trésorerie de clôture reconstituée par les flux doit
// retrouver celle que porte la balance. L'écart est calculé et rendu, jamais
// absorbé — c'est lui qui révèle un compte hors tableau ou une cession passée
// sur des comptes inattendus.
//
// Montants en centimes entiers. Convention de signe : un flux est **signé**,
// négatif quand il décaisse, comme sur le modèle officiel.
// ---------------------------------------------------------------------------

import { sommeMontants } from "./money";
import type { LigneBalance } from "./balance";
import { calculerCompteResultat } from "./etats-financiers";
import { rattachementDuCompte } from "./postes-syscohada";

// ---------------------------------------------------------------------------
// Lignes du tableau
// ---------------------------------------------------------------------------

export type LigneFlux = {
  code: string;
  libelle: string;
  /** Flux signé, en centimes. */
  montant: number;
  estTotal: boolean;
  /** Numéro de section pour la présentation. */
  section: "OUVERTURE" | "OPERATIONNEL" | "INVESTISSEMENT" | "FINANCEMENT" | "CLOTURE";
};

type DefinitionLigne = {
  code: string;
  libelle: string;
  section: LigneFlux["section"];
  total?: string[];
};

export const LIGNES_FLUX: DefinitionLigne[] = [
  { code: "ZA", libelle: "Trésorerie nette à l'ouverture", section: "OUVERTURE" },

  { code: "FA", libelle: "Capacité d'autofinancement globale (CAFG)", section: "OPERATIONNEL" },
  { code: "FB", libelle: "Variation de l'actif circulant HAO", section: "OPERATIONNEL" },
  { code: "FC", libelle: "Variation des stocks", section: "OPERATIONNEL" },
  { code: "FD", libelle: "Variation des créances et emplois assimilés", section: "OPERATIONNEL" },
  { code: "FE", libelle: "Variation du passif circulant", section: "OPERATIONNEL" },
  { code: "ZB", libelle: "Flux de trésorerie des activités opérationnelles", section: "OPERATIONNEL", total: ["FA", "FB", "FC", "FD", "FE"] },

  { code: "FF", libelle: "Décaissements liés aux acquisitions d'immobilisations incorporelles", section: "INVESTISSEMENT" },
  { code: "FG", libelle: "Décaissements liés aux acquisitions d'immobilisations corporelles", section: "INVESTISSEMENT" },
  { code: "FH", libelle: "Décaissements liés aux acquisitions d'immobilisations financières", section: "INVESTISSEMENT" },
  { code: "FI", libelle: "Encaissements liés aux cessions d'immobilisations incorporelles et corporelles", section: "INVESTISSEMENT" },
  { code: "FJ", libelle: "Encaissements liés aux cessions d'immobilisations financières", section: "INVESTISSEMENT" },
  { code: "ZC", libelle: "Flux de trésorerie des activités d'investissement", section: "INVESTISSEMENT", total: ["FF", "FG", "FH", "FI", "FJ"] },

  { code: "FK", libelle: "Augmentations de capital par apports nouveaux", section: "FINANCEMENT" },
  { code: "FL", libelle: "Subventions d'investissement reçues", section: "FINANCEMENT" },
  { code: "FM", libelle: "Prélèvements sur le capital", section: "FINANCEMENT" },
  { code: "FN", libelle: "Dividendes versés", section: "FINANCEMENT" },
  { code: "FO", libelle: "Emprunts", section: "FINANCEMENT" },
  { code: "FP", libelle: "Autres dettes financières", section: "FINANCEMENT" },
  { code: "FQ", libelle: "Remboursements des emprunts et autres dettes financières", section: "FINANCEMENT" },
  { code: "ZD", libelle: "Flux de trésorerie des activités de financement", section: "FINANCEMENT", total: ["FK", "FL", "FM", "FN", "FO", "FP", "FQ"] },

  { code: "ZE", libelle: "Variation de la trésorerie nette de la période", section: "CLOTURE", total: ["ZB", "ZC", "ZD"] },
  { code: "ZF", libelle: "Trésorerie nette à la clôture", section: "CLOTURE", total: ["ZA", "ZE"] },
];

// ---------------------------------------------------------------------------
// Rattachement des comptes aux flux
// ---------------------------------------------------------------------------

/**
 * Comment un compte alimente le tableau.
 *
 * - `variation` : c'est le solde net de ses mouvements qui compte, changé de
 *   signe — un stock qui grossit a coûté de la trésorerie ;
 * - `debits` / `credits` : les deux sens sont deux flux distincts, chacun vers
 *   sa ligne. Un emprunt souscrit puis remboursé dans l'année s'annule au bilan
 *   mais figure deux fois au tableau ;
 * - `hors: true` : le compte bouge sans trésorerie. L'affectation du résultat
 *   déplace des montants entre réserves, report à nouveau et résultat, sans
 *   qu'un franc ne sorte. Ces comptes sont exclus délibérément, et le contrôle
 *   de cohérence se charge de dire si l'exclusion était abusive.
 */
export type RegleFlux =
  | { variation: string }
  | { debits?: string; credits?: string }
  | { hors: true; motif: string };

export const REGLES_FLUX: Record<string, RegleFlux> = {
  // --- Capitaux propres ----------------------------------------------------
  "10": { credits: "FK", debits: "FM" },
  "105": { hors: true, motif: "Écart de réévaluation : sans contrepartie en trésorerie." },
  "106": { hors: true, motif: "Réserves : affectation du résultat, sans flux." },
  "11": { hors: true, motif: "Report à nouveau : affectation du résultat, sans flux." },
  "13": { hors: true, motif: "Résultat en instance d'affectation : sans flux." },
  // Subvention reçue au crédit, quote-part virée au résultat au débit : le net
  // est ce qui a réellement été encaissé.
  "14": { variation: "FL" },
  // Provisions réglementées : dotations et reprises passent par des comptes
  // HAO absents du calcul de la CAFG, leur variation est donc reprise ici.
  "15": { variation: "FA" },
  "16": { credits: "FO", debits: "FQ" },
  "165": { credits: "FP", debits: "FQ" },
  "168": { credits: "FP", debits: "FQ" },
  "17": { credits: "FP", debits: "FQ" },
  "19": { hors: true, motif: "Provisions : dotations et reprises sont déjà dans la CAFG." },

  // --- Immobilisations -------------------------------------------------------
  // Les acquisitions sont lues au débit. Les sorties (crédits) ne sont pas des
  // flux : la cession encaisse son prix, porté par FI depuis les produits de
  // cession, et sa valeur comptable est neutralisée dans la CAFG.
  "21": { debits: "FF" },
  "22": { debits: "FG" },
  "23": { debits: "FG" },
  "24": { debits: "FG" },
  "25": { debits: "FG" },
  "26": { debits: "FH" },
  "27": { debits: "FH" },
  "28": { hors: true, motif: "Amortissements : dotations et reprises sont déjà dans la CAFG." },
  "29": { hors: true, motif: "Dépréciations : dotations et reprises sont déjà dans la CAFG." },

  // --- Dividendes -------------------------------------------------------------
  // Le crédit (dividendes décidés) est la contrepartie d'un compte de résultat
  // affecté, sans flux. Seul le débit décaisse.
  "465": { debits: "FN" },
};

/**
 * Comptes lus pour la CAFG, par rôle.
 *
 * La CAFG part du résultat net et le corrige de ce qui n'a pas de contrepartie
 * en trésorerie : dotations et reprises, valeur comptable des actifs cédés. Les
 * produits de cession en sont retirés pour figurer en flux d'investissement,
 * où ils sont encaissés.
 */
export const COMPTES_CAFG = {
  dotations: ["68", "69", "659"],
  reprises: ["79", "759"],
  valeursComptablesCedees: ["81", "654"],
  produitsCessions: ["82", "754"],
} as const;

/** Les comptes de trésorerie, découverts compris : le tableau raisonne en net. */
const TRESORERIE = "5";

const PREFIXES_TRIES = Object.keys(REGLES_FLUX).sort((a, b) => b.length - a.length);

function regleDuCompte(numero: string): RegleFlux | null {
  for (const p of PREFIXES_TRIES) {
    if (numero.startsWith(p)) return REGLES_FLUX[p];
  }
  return null;
}

function correspond(numero: string, prefixes: readonly string[]) {
  return prefixes.some((p) => numero.startsWith(p));
}

/** Ligne de variation d'un compte des classes 3 et 4, via son poste de bilan. */
function ligneVariationCirculant(numero: string): string | null {
  const r = rattachementDuCompte(numero);
  if (!r) return null;
  if ("poste" in r && r.role === "AMORTISSEMENT") return "HORS";

  const poste = "poste" in r ? r.poste : r.debiteur; // même signe des deux côtés
  if (poste === "BA") return "FB";
  if (poste === "BB") return "FC";
  if (["BH", "BI", "BJ"].includes(poste)) return "FD";
  if (["DH", "DI", "DJ", "DK", "DM"].includes(poste)) return "FE";
  if (["BS", "DR"].includes(poste)) return "TRESORERIE";
  return null;
}

// ---------------------------------------------------------------------------
// Calcul
// ---------------------------------------------------------------------------

export type CompteHorsTableau = {
  compteNumero: string;
  compteLibelle: string;
  /** Solde net des mouvements de la période, positif si débiteur. */
  variation: number;
};

export type FluxTresorerie = {
  lignes: LigneFlux[];
  tresorerieOuverture: number;
  tresorerieCloture: number;
  /** Trésorerie de clôture reconstituée par les flux. */
  tresorerieReconstituee: number;
  /** `tresorerieReconstituee − tresorerieCloture`. Doit être nul. */
  ecart: number;
  coherent: boolean;
  /**
   * Comptes mouvementés qu'aucune règle ne couvre. Ils expliquent en général
   * l'écart, et doivent être rattachés.
   */
  comptesHorsTableau: CompteHorsTableau[];
};

function soldeSigne(l: LigneBalance) {
  return l.soldeDebiteur - l.soldeCrediteur;
}

/** Trésorerie nette d'une balance : tous les comptes de classe 5, signés. */
export function tresorerieNette(lignes: LigneBalance[]): number {
  return sommeMontants(
    lignes.filter((l) => l.compteNumero.startsWith(TRESORERIE)).map(soldeSigne),
  );
}

export function calculerFluxTresorerie(
  ouverture: LigneBalance[],
  mouvements: LigneBalance[],
): FluxTresorerie {
  const valeurs = new Map<string, number[]>();
  const ajouter = (code: string, montant: number) => {
    const liste = valeurs.get(code);
    if (liste) liste.push(montant);
    else valeurs.set(code, [montant]);
  };

  const horsTableau: CompteHorsTableau[] = [];

  // --- CAFG, à partir du résultat de la période --------------------------------
  const resultat = calculerCompteResultat(mouvements);
  ajouter("FA", resultat.resultatNet);

  for (const l of mouvements) {
    const n = l.compteNumero;
    const delta = soldeSigne(l);

    if (correspond(n, COMPTES_CAFG.dotations)) ajouter("FA", delta);
    else if (correspond(n, COMPTES_CAFG.reprises)) ajouter("FA", delta); // créditeur : négatif
    else if (correspond(n, COMPTES_CAFG.valeursComptablesCedees)) ajouter("FA", delta);
    else if (correspond(n, COMPTES_CAFG.produitsCessions)) {
      ajouter("FA", delta); // créditeur : retire le produit de la CAFG
      ajouter(n.startsWith("826") ? "FJ" : "FI", -delta); // et l'encaisse en investissement
    }
  }

  // --- Bilan : variations et flux bruts -----------------------------------------
  for (const l of mouvements) {
    const n = l.compteNumero;
    const classe = n[0];
    if (["6", "7", "8"].includes(classe)) continue; // résultat : déjà dans la CAFG
    if (classe === TRESORERIE) continue; // c'est ce que le tableau reconstitue

    // Une règle explicite l'emporte, quelle que soit la classe : les dividendes
    // à payer (465) sont un compte de tiers, mais leur versement est un flux de
    // financement et non une variation du passif circulant.
    const regle = regleDuCompte(n);
    if (regle) {
      if ("hors" in regle) continue;
      if ("variation" in regle) {
        ajouter(regle.variation, -soldeSigne(l));
        continue;
      }
      if (regle.debits && l.totalDebit) ajouter(regle.debits, -l.totalDebit);
      if (regle.credits && l.totalCredit) ajouter(regle.credits, l.totalCredit);
      continue;
    }

    // À défaut, un compte de stocks ou de tiers suit son poste de bilan.
    if (classe === "3" || classe === "4") {
      const ligne = ligneVariationCirculant(n);
      if (ligne && ligne !== "HORS" && ligne !== "TRESORERIE") {
        // Une hausse d'actif circulant consomme, une hausse de passif dégage :
        // dans les deux cas c'est l'opposé de la variation débitrice.
        ajouter(ligne, -soldeSigne(l));
        continue;
      }
      if (ligne === "HORS") continue;
    }

    horsTableau.push({
      compteNumero: n,
      compteLibelle: l.compteLibelle,
      variation: soldeSigne(l),
    });
  }

  // --- Trésorerie -------------------------------------------------------------------
  const tresorerieOuverture = tresorerieNette(ouverture);
  const tresorerieCloture = tresorerieOuverture + tresorerieNette(mouvements);
  ajouter("ZA", tresorerieOuverture);

  // --- Lignes, totaux dans l'ordre de dépendance -----------------------------------
  const calculees = new Map<string, number>();
  const lignes: LigneFlux[] = LIGNES_FLUX.map((def) => {
    const montant = def.total
      ? sommeMontants(def.total.map((c) => calculees.get(c) ?? 0))
      : sommeMontants(valeurs.get(def.code) ?? []);
    calculees.set(def.code, montant);
    return {
      code: def.code,
      libelle: def.libelle,
      montant: montant === 0 ? 0 : montant,
      estTotal: !!def.total,
      section: def.section,
    };
  });

  const tresorerieReconstituee = calculees.get("ZF") ?? 0;
  const ecart = tresorerieReconstituee - tresorerieCloture;

  return {
    lignes,
    tresorerieOuverture,
    tresorerieCloture,
    tresorerieReconstituee,
    ecart: ecart === 0 ? 0 : ecart,
    coherent: ecart === 0,
    comptesHorsTableau: horsTableau,
  };
}
