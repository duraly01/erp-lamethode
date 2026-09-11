/**
 * Postes des états financiers SYSCOHADA révisé (AUDCIF) et rattachement des
 * comptes.
 *
 * Le bilan et le compte de résultat ne se déduisent pas des classes de comptes :
 * chaque compte est rattaché à un poste codé (AD, BI, CP, TA, RH…), et ce
 * rattachement est une décision normative, pas un calcul. Il est donc écrit ici
 * en **données**, une ligne par règle, pour qu'un expert-comptable puisse le
 * relire et le corriger sans lire de code.
 *
 * ⚠️ Ce rattachement doit être validé par l'expert-comptable référent avant
 * qu'une DSF en soit tirée. Les rattachements dont je suis le moins sûr sont
 * rassemblés dans `RATTACHEMENTS_A_CONFIRMER`, plus bas, et l'écran des états
 * financiers les signale.
 *
 * Résolution : un compte prend le poste du **préfixe le plus long** qui le
 * couvre. « 40 » attrape donc 401 et 408, tandis que « 4091 », plus précis,
 * emporte le compte d'avances vers l'actif. C'est ce qui permet de garantir
 * qu'un compte appartient à un poste et un seul — invariant vérifié par les
 * tests sur la totalité du plan de référence.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Rôle d'un compte dans son poste. */
export type RoleCompte =
  /** Valeur d'origine, colonne « brut » du bilan. */
  | "BRUT"
  /** Amortissement ou dépréciation, colonne « amort./dépréc. », à déduire. */
  | "AMORTISSEMENT";

/**
 * Rattachement d'un compte à un poste.
 *
 * Certains comptes se présentent à l'actif ou au passif selon le sens de leur
 * solde — un compte courant d'associé est une créance s'il est débiteur, une
 * dette s'il est créditeur. Ceux-là portent deux postes.
 */
export type Rattachement =
  | { poste: string; role?: RoleCompte }
  | { debiteur: string; crediteur: string };

/** Un poste du bilan : soit des comptes, soit la somme d'autres postes. */
export type PosteBilan = {
  code: string;
  libelle: string;
  /** Un poste de total n'a pas de comptes : il additionne d'autres postes. */
  total?: string[];
  /** Niveau de titre, pour l'indentation de l'état. */
  niveau?: 1 | 2;
};

/** Sens naturel d'un poste du compte de résultat. */
export type SensPoste = "PRODUIT" | "CHARGE";

export type PosteResultat = {
  code: string;
  libelle: string;
  sens?: SensPoste;
  /** Solde intermédiaire : somme signée d'autres postes. */
  composition?: { plus: string[]; moins: string[] };
};

// ---------------------------------------------------------------------------
// Bilan — Actif
// ---------------------------------------------------------------------------

export const POSTES_BILAN_ACTIF: PosteBilan[] = [
  { code: "AD", libelle: "Immobilisations incorporelles", niveau: 1, total: ["AE", "AF", "AG"] },
  { code: "AE", libelle: "Frais de développement et de prospection", niveau: 2 },
  { code: "AF", libelle: "Brevets, licences, logiciels et droits similaires", niveau: 2 },
  { code: "AG", libelle: "Fonds commercial et droit au bail", niveau: 2 },

  { code: "AI", libelle: "Immobilisations corporelles", niveau: 1, total: ["AJ", "AK", "AL", "AM", "AN"] },
  { code: "AJ", libelle: "Terrains", niveau: 2 },
  { code: "AK", libelle: "Bâtiments", niveau: 2 },
  { code: "AL", libelle: "Aménagements, agencements et installations", niveau: 2 },
  { code: "AM", libelle: "Matériel, mobilier et actifs biologiques", niveau: 2 },
  { code: "AN", libelle: "Matériel de transport", niveau: 2 },

  { code: "AQ", libelle: "Immobilisations financières", niveau: 1, total: ["AR", "AS"] },
  { code: "AR", libelle: "Titres de participation", niveau: 2 },
  { code: "AS", libelle: "Autres immobilisations financières", niveau: 2 },

  { code: "AZ", libelle: "TOTAL ACTIF IMMOBILISÉ", total: ["AD", "AI", "AQ"] },

  { code: "BA", libelle: "Actif circulant HAO", niveau: 1 },
  { code: "BB", libelle: "Stocks et encours", niveau: 1 },
  { code: "BG", libelle: "Créances et emplois assimilés", niveau: 1, total: ["BH", "BI", "BJ"] },
  { code: "BH", libelle: "Fournisseurs, avances versées", niveau: 2 },
  { code: "BI", libelle: "Clients", niveau: 2 },
  { code: "BJ", libelle: "Autres créances", niveau: 2 },

  { code: "BK", libelle: "TOTAL ACTIF CIRCULANT", total: ["BA", "BB", "BG"] },

  { code: "BS", libelle: "Banques, chèques postaux, caisse et assimilés", niveau: 1 },
  { code: "BT", libelle: "TOTAL TRÉSORERIE-ACTIF", total: ["BS"] },

  { code: "BZ", libelle: "TOTAL GÉNÉRAL", total: ["AZ", "BK", "BT"] },
];

// ---------------------------------------------------------------------------
// Bilan — Passif
// ---------------------------------------------------------------------------

export const POSTES_BILAN_PASSIF: PosteBilan[] = [
  { code: "CA", libelle: "Capital", niveau: 2 },
  { code: "CD", libelle: "Primes liées au capital social", niveau: 2 },
  { code: "CE", libelle: "Écarts de réévaluation", niveau: 2 },
  { code: "CF", libelle: "Réserves indisponibles", niveau: 2 },
  { code: "CG", libelle: "Réserves libres", niveau: 2 },
  { code: "CH", libelle: "Report à nouveau (+ ou −)", niveau: 2 },
  { code: "CJ", libelle: "Résultat net de l'exercice (bénéfice + ou perte −)", niveau: 2 },
  { code: "CL", libelle: "Subventions d'investissement", niveau: 2 },
  { code: "CM", libelle: "Provisions réglementées", niveau: 2 },
  { code: "CP", libelle: "TOTAL CAPITAUX PROPRES", total: ["CA", "CD", "CE", "CF", "CG", "CH", "CJ", "CL", "CM"] },

  { code: "DA", libelle: "Emprunts et dettes financières diverses", niveau: 2 },
  { code: "DB", libelle: "Dettes de location acquisition", niveau: 2 },
  { code: "DC", libelle: "Provisions pour risques et charges", niveau: 2 },
  { code: "DD", libelle: "TOTAL DETTES FINANCIÈRES", total: ["DA", "DB", "DC"] },

  { code: "DF", libelle: "TOTAL RESSOURCES STABLES", total: ["CP", "DD"] },

  { code: "DH", libelle: "Dettes circulantes HAO", niveau: 2 },
  { code: "DI", libelle: "Clients, avances reçues", niveau: 2 },
  { code: "DJ", libelle: "Fournisseurs d'exploitation", niveau: 2 },
  { code: "DK", libelle: "Dettes fiscales et sociales", niveau: 2 },
  { code: "DM", libelle: "Autres dettes", niveau: 2 },
  { code: "DP", libelle: "TOTAL PASSIF CIRCULANT", total: ["DH", "DI", "DJ", "DK", "DM"] },

  { code: "DR", libelle: "Banques, crédits de trésorerie et d'escompte", niveau: 2 },
  { code: "DT", libelle: "TOTAL TRÉSORERIE-PASSIF", total: ["DR"] },

  { code: "DZ", libelle: "TOTAL GÉNÉRAL", total: ["DF", "DP", "DT"] },
];

// ---------------------------------------------------------------------------
// Compte de résultat
// ---------------------------------------------------------------------------

export const POSTES_RESULTAT: PosteResultat[] = [
  { code: "TA", libelle: "Ventes de marchandises", sens: "PRODUIT" },
  { code: "RA", libelle: "Achats de marchandises", sens: "CHARGE" },
  { code: "RB", libelle: "Variation de stocks de marchandises", sens: "CHARGE" },
  { code: "XA", libelle: "MARGE COMMERCIALE", composition: { plus: ["TA"], moins: ["RA", "RB"] } },

  { code: "TB", libelle: "Ventes de produits fabriqués", sens: "PRODUIT" },
  { code: "TC", libelle: "Travaux et services vendus", sens: "PRODUIT" },
  { code: "TD", libelle: "Produits accessoires", sens: "PRODUIT" },
  { code: "XB", libelle: "CHIFFRE D'AFFAIRES", composition: { plus: ["TA", "TB", "TC", "TD"], moins: [] } },

  { code: "TE", libelle: "Production stockée (ou déstockage)", sens: "PRODUIT" },
  { code: "TF", libelle: "Production immobilisée", sens: "PRODUIT" },
  { code: "TG", libelle: "Subventions d'exploitation", sens: "PRODUIT" },
  { code: "TH", libelle: "Autres produits", sens: "PRODUIT" },
  { code: "TI", libelle: "Transferts de charges d'exploitation", sens: "PRODUIT" },

  { code: "RC", libelle: "Achats de matières premières et fournitures liées", sens: "CHARGE" },
  { code: "RD", libelle: "Variation de stocks de matières premières", sens: "CHARGE" },
  { code: "RE", libelle: "Autres achats", sens: "CHARGE" },
  { code: "RG", libelle: "Transports", sens: "CHARGE" },
  { code: "RH", libelle: "Services extérieurs", sens: "CHARGE" },
  { code: "RI", libelle: "Impôts et taxes", sens: "CHARGE" },
  { code: "RJ", libelle: "Autres charges", sens: "CHARGE" },

  {
    code: "XC",
    libelle: "VALEUR AJOUTÉE",
    composition: {
      plus: ["XA", "TB", "TC", "TD", "TE", "TF", "TG", "TH", "TI"],
      moins: ["RC", "RD", "RE", "RG", "RH", "RI", "RJ"],
    },
  },

  { code: "RK", libelle: "Charges de personnel", sens: "CHARGE" },
  { code: "XD", libelle: "EXCÉDENT BRUT D'EXPLOITATION", composition: { plus: ["XC"], moins: ["RK"] } },

  { code: "TJ", libelle: "Reprises d'amortissements, provisions et dépréciations", sens: "PRODUIT" },
  { code: "RL", libelle: "Dotations aux amortissements, provisions et dépréciations", sens: "CHARGE" },
  { code: "XE", libelle: "RÉSULTAT D'EXPLOITATION", composition: { plus: ["XD", "TJ"], moins: ["RL"] } },

  { code: "TK", libelle: "Revenus financiers et assimilés", sens: "PRODUIT" },
  { code: "RM", libelle: "Frais financiers et charges assimilées", sens: "CHARGE" },
  { code: "XF", libelle: "RÉSULTAT FINANCIER", composition: { plus: ["TK"], moins: ["RM"] } },

  { code: "XG", libelle: "RÉSULTAT DES ACTIVITÉS ORDINAIRES", composition: { plus: ["XE", "XF"], moins: [] } },

  { code: "TN", libelle: "Produits des cessions d'immobilisations", sens: "PRODUIT" },
  { code: "TO", libelle: "Autres produits HAO", sens: "PRODUIT" },
  { code: "RO", libelle: "Valeurs comptables des cessions d'immobilisations", sens: "CHARGE" },
  { code: "RP", libelle: "Autres charges HAO", sens: "CHARGE" },
  { code: "XH", libelle: "RÉSULTAT HORS ACTIVITÉS ORDINAIRES", composition: { plus: ["TN", "TO"], moins: ["RO", "RP"] } },

  { code: "RQ", libelle: "Participation des travailleurs", sens: "CHARGE" },
  { code: "RS", libelle: "Impôts sur le résultat", sens: "CHARGE" },
  { code: "XI", libelle: "RÉSULTAT NET", composition: { plus: ["XG", "XH"], moins: ["RQ", "RS"] } },
];

// ---------------------------------------------------------------------------
// Rattachement des comptes aux postes
//
// Une entrée par préfixe, du plus général au plus précis. Le préfixe le plus
// long l'emporte : les exceptions se posent donc simplement à côté de la règle
// générale, sans avoir à la réécrire.
// ---------------------------------------------------------------------------

export const RATTACHEMENTS: Record<string, Rattachement> = {
  // --- Classe 1 — Ressources durables -------------------------------------
  "10": { poste: "CA" },
  "104": { poste: "CD" },
  "105": { poste: "CE" },
  "106": { poste: "CF" },
  "1068": { poste: "CG" },
  "11": { poste: "CH" },
  "13": { poste: "CJ" },
  "14": { poste: "CL" },
  "15": { poste: "CM" },
  "16": { poste: "DA" },
  "17": { poste: "DB" },
  "19": { poste: "DC" },

  // --- Classe 2 — Actif immobilisé ----------------------------------------
  "21": { poste: "AF" },
  "211": { poste: "AE" },
  "215": { poste: "AG" },
  "22": { poste: "AJ" },
  "23": { poste: "AK" },
  "235": { poste: "AL" },
  "24": { poste: "AM" },
  "245": { poste: "AN" },
  "26": { poste: "AR" },
  "27": { poste: "AS" },

  // Amortissements et dépréciations : même poste que le bien, en déduction.
  "281": { poste: "AF", role: "AMORTISSEMENT" },
  "2813": { poste: "AK", role: "AMORTISSEMENT" },
  "284": { poste: "AM", role: "AMORTISSEMENT" },
  "2845": { poste: "AN", role: "AMORTISSEMENT" },
  "291": { poste: "AF", role: "AMORTISSEMENT" },

  // --- Classe 3 — Stocks ---------------------------------------------------
  "3": { poste: "BB" },
  "39": { poste: "BB", role: "AMORTISSEMENT" },

  // --- Classe 4 — Tiers ----------------------------------------------------
  "40": { poste: "DJ" },
  "409": { poste: "BH" },
  "41": { poste: "BI" },
  "419": { poste: "DI" },
  "42": { poste: "DK" },
  "421": { poste: "BJ" },
  "43": { poste: "DK" },
  "44": { poste: "DK" },
  "4449": { poste: "BJ" },
  "445": { poste: "BJ" },
  "449": { debiteur: "BJ", crediteur: "DK" },
  "46": { debiteur: "BJ", crediteur: "DM" },
  "465": { poste: "DM" },
  "47": { debiteur: "BJ", crediteur: "DM" },
  "478": { poste: "BJ" },
  "479": { poste: "DM" },
  "48": { poste: "DH" },
  "485": { poste: "BA" },
  "49": { poste: "BI", role: "AMORTISSEMENT" },

  // --- Classe 5 — Trésorerie -----------------------------------------------
  "5": { poste: "BS" },
  "561": { poste: "DR" },
  "564": { poste: "DR" },
  "565": { poste: "DR" },
  "566": { poste: "DR" },

  // --- Classe 6 — Charges ---------------------------------------------------
  "601": { poste: "RA" },
  "6031": { poste: "RB" },
  "602": { poste: "RC" },
  "6032": { poste: "RD" },
  "604": { poste: "RE" },
  "605": { poste: "RE" },
  "608": { poste: "RE" },
  "61": { poste: "RG" },
  "62": { poste: "RH" },
  "63": { poste: "RH" },
  "64": { poste: "RI" },
  "65": { poste: "RJ" },
  "659": { poste: "RL" },
  "66": { poste: "RK" },
  "67": { poste: "RM" },
  "68": { poste: "RL" },
  "69": { poste: "RL" },

  // --- Classe 7 — Produits --------------------------------------------------
  "701": { poste: "TA" },
  "702": { poste: "TB" },
  "703": { poste: "TB" },
  "704": { poste: "TB" },
  "705": { poste: "TC" },
  "706": { poste: "TC" },
  "707": { poste: "TD" },
  "71": { poste: "TG" },
  "72": { poste: "TF" },
  "73": { poste: "TE" },
  "75": { poste: "TH" },
  "759": { poste: "TJ" },
  "77": { poste: "TK" },
  "78": { poste: "TI" },
  "787": { poste: "TK" },
  "79": { poste: "TJ" },

  // --- Classe 8 — Hors activités ordinaires ---------------------------------
  "81": { poste: "RO" },
  "82": { poste: "TN" },
  "83": { poste: "RP" },
  "84": { poste: "TO" },
  "85": { poste: "RP" },
  "86": { poste: "TO" },
  "87": { poste: "RQ" },
  "88": { poste: "TO" },
  "89": { poste: "RS" },
};

/**
 * Rattachements que je n'ai pas pu adosser à une source normative sans
 * ambiguïté, et qui appellent donc une confirmation avant la première DSF.
 *
 * Ils fonctionnent — les états s'équilibrent — mais ils déplacent des montants
 * d'un poste à l'autre, ce qui se voit sur la liasse. L'écran des états
 * financiers les affiche, pour que personne ne les découvre après dépôt.
 */
export const RATTACHEMENTS_A_CONFIRMER: {
  prefixe: string;
  poste: string;
  motif: string;
}[] = [
  {
    prefixe: "659",
    poste: "RL",
    motif:
      "Charges provisionnées d'exploitation : rattachées aux dotations, l'AUDCIF les présentant parfois sur une ligne distincte.",
  },
  {
    prefixe: "759",
    poste: "TJ",
    motif: "Reprises de charges provisionnées, par symétrie avec le 659.",
  },
  {
    prefixe: "291",
    poste: "AF",
    motif:
      "Dépréciations des immobilisations incorporelles : imputées aux brevets et logiciels, qui en constituent l'essentiel, faute de ventilation dans le plan de référence.",
  },
  {
    prefixe: "85",
    poste: "RP",
    motif:
      "Dotations aux provisions réglementées : classées en charges HAO. À vérifier si le cabinet les présente en dotations d'exploitation.",
  },
  {
    prefixe: "88",
    poste: "TO",
    motif: "Subventions d'équilibre : classées en produits HAO.",
  },
];

// ---------------------------------------------------------------------------
// Résolution
// ---------------------------------------------------------------------------

const PREFIXES_TRIES = Object.keys(RATTACHEMENTS).sort(
  (a, b) => b.length - a.length,
);

/**
 * Poste d'un compte, par le préfixe le plus long qui le couvre.
 *
 * Retourne `null` pour un compte qu'aucune règle ne couvre — cas qui ne doit
 * jamais se produire sur le plan de référence, et que les états financiers
 * signalent plutôt que d'escamoter : un compte oublié fausse silencieusement
 * un total, ce qui est bien pire qu'une erreur visible.
 */
export function rattachementDuCompte(numero: string): Rattachement | null {
  for (const prefixe of PREFIXES_TRIES) {
    if (numero.startsWith(prefixe)) return RATTACHEMENTS[prefixe];
  }
  return null;
}

/**
 * Poste effectif d'un compte, le sens du solde tranchant pour les comptes qui
 * peuvent figurer des deux côtés du bilan.
 *
 * `solde` est exprimé en centimes, positif si débiteur.
 */
export function posteDuCompte(numero: string, solde: number): string | null {
  const r = rattachementDuCompte(numero);
  if (!r) return null;
  if ("poste" in r) return r.poste;
  return solde >= 0 ? r.debiteur : r.crediteur;
}

/** Index des postes par code, toutes sections confondues. */
export const POSTES_PAR_CODE = new Map<string, PosteBilan | PosteResultat>([
  ...POSTES_BILAN_ACTIF.map((p) => [p.code, p] as const),
  ...POSTES_BILAN_PASSIF.map((p) => [p.code, p] as const),
  ...POSTES_RESULTAT.map((p) => [p.code, p] as const),
]);
