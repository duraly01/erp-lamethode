// ---------------------------------------------------------------------------
// Notes annexes aux états financiers SYSCOHADA révisé — module pur.
//
// Les notes sont, pour l'essentiel, le détail des postes du bilan et du compte
// de résultat, compte par compte, et quelques tableaux de mouvements — les
// immobilisations, les dettes financières — qui montrent d'où l'on part et où
// l'on arrive. Tout cela se déduit de la balance, à condition de distinguer
// l'ouverture (les à-nouveaux) des mouvements de l'exercice.
//
// Ce module ne produit **que** les notes chiffrées. Celles qui demandent une
// information absente des livres — effectifs, engagements hors bilan, dettes
// garanties par des sûretés, événements postérieurs à la clôture — ne peuvent
// pas être inventées et restent à rédiger.
//
// ⚠️ La numérotation des notes suit le modèle du système normal, telle que je
// la connais. Elle est portée en donnée, à titre indicatif, et doit être
// confirmée par l'expert-comptable : l'appariement des tableaux avec les
// numéros officiels conditionne la lisibilité de la liasse par l'administration.
//
// Montants en centimes entiers.
// ---------------------------------------------------------------------------

import { sommeMontants } from "./money";
import type { LigneBalance } from "./balance";
import { rattachementDuCompte } from "./postes-syscohada";

// ---------------------------------------------------------------------------
// Définition des notes
// ---------------------------------------------------------------------------

/**
 * Trois formes de note, selon ce qu'on veut lire :
 *
 * - `MOUVEMENTS` : d'où l'on part, ce qui entre, ce qui sort, où l'on arrive.
 *   Pour les immobilisations, les amortissements, le capital, les emprunts ;
 * - `SOLDES` : solde d'ouverture, solde de clôture et variation, compte par
 *   compte. Pour les stocks, les tiers, la trésorerie ;
 * - `CHARGES_PRODUITS` : le montant de l'exercice, compte par compte. Pour le
 *   compte de résultat.
 */
export type FormeNote = "MOUVEMENTS" | "SOLDES" | "CHARGES_PRODUITS";

export type DefinitionNote = {
  code: string;
  /** Numéro sur le modèle SYSCOHADA du système normal — indicatif. */
  numero: string;
  libelle: string;
  forme: FormeNote;
  /** Postes du bilan ou du compte de résultat dont la note détaille les comptes. */
  postes: string[];
  /**
   * Pour une note de mouvements : le sens dans lequel le compte grossit.
   * Un actif s'accroît au débit, une dette ou un amortissement au crédit.
   */
  sensCroissance?: "DEBIT" | "CREDIT";
  /** Restreint aux comptes d'amortissement ou, au contraire, les exclut. */
  role?: "BRUT" | "AMORTISSEMENT";
};

export const NOTES: DefinitionNote[] = [
  // --- Actif immobilisé -----------------------------------------------------
  {
    code: "IMMO_BRUT",
    numero: "3A",
    libelle: "Immobilisations brutes",
    forme: "MOUVEMENTS",
    postes: ["AE", "AF", "AG", "AJ", "AK", "AL", "AM", "AN", "AR", "AS"],
    sensCroissance: "DEBIT",
    role: "BRUT",
  },
  {
    code: "IMMO_AMORT",
    numero: "3C",
    libelle: "Amortissements et dépréciations des immobilisations",
    forme: "MOUVEMENTS",
    postes: ["AE", "AF", "AG", "AJ", "AK", "AL", "AM", "AN", "AR", "AS"],
    sensCroissance: "CREDIT",
    role: "AMORTISSEMENT",
  },

  // --- Actif circulant ---------------------------------------------------------
  { code: "ACTIF_HAO", numero: "5", libelle: "Actif circulant HAO", forme: "SOLDES", postes: ["BA"] },
  { code: "STOCKS", numero: "6", libelle: "Stocks et encours", forme: "SOLDES", postes: ["BB"] },
  { code: "CLIENTS", numero: "7", libelle: "Clients", forme: "SOLDES", postes: ["BI"] },
  { code: "AUTRES_CREANCES", numero: "8", libelle: "Autres créances", forme: "SOLDES", postes: ["BH", "BJ"] },
  { code: "TRESORERIE_ACTIF", numero: "11", libelle: "Trésorerie-actif", forme: "SOLDES", postes: ["BS"] },

  // --- Capitaux propres --------------------------------------------------------
  { code: "CAPITAL", numero: "13", libelle: "Capital", forme: "MOUVEMENTS", postes: ["CA"], sensCroissance: "CREDIT" },
  { code: "RESERVES", numero: "14", libelle: "Primes, réserves et report à nouveau", forme: "SOLDES", postes: ["CD", "CE", "CF", "CG", "CH"] },
  { code: "SUBVENTIONS", numero: "15A", libelle: "Subventions d'investissement", forme: "MOUVEMENTS", postes: ["CL"], sensCroissance: "CREDIT" },
  { code: "PROV_REGLEMENTEES", numero: "15B", libelle: "Provisions réglementées", forme: "MOUVEMENTS", postes: ["CM"], sensCroissance: "CREDIT" },

  // --- Dettes ------------------------------------------------------------------
  { code: "DETTES_FINANCIERES", numero: "16A", libelle: "Emprunts et dettes financières", forme: "MOUVEMENTS", postes: ["DA", "DB"], sensCroissance: "CREDIT" },
  { code: "PROVISIONS_RISQUES", numero: "16C", libelle: "Provisions pour risques et charges", forme: "MOUVEMENTS", postes: ["DC"], sensCroissance: "CREDIT" },
  { code: "DETTES_HAO", numero: "16D", libelle: "Dettes circulantes HAO", forme: "SOLDES", postes: ["DH"] },
  { code: "FOURNISSEURS", numero: "17", libelle: "Fournisseurs d'exploitation", forme: "SOLDES", postes: ["DJ", "DI"] },
  { code: "DETTES_FISCALES", numero: "18", libelle: "Dettes fiscales et sociales", forme: "SOLDES", postes: ["DK"] },
  { code: "AUTRES_DETTES", numero: "19", libelle: "Autres dettes", forme: "SOLDES", postes: ["DM"] },
  { code: "TRESORERIE_PASSIF", numero: "20", libelle: "Trésorerie-passif", forme: "SOLDES", postes: ["DR"] },

  // --- Compte de résultat --------------------------------------------------------
  { code: "CHIFFRE_AFFAIRES", numero: "21", libelle: "Chiffre d'affaires et autres produits", forme: "CHARGES_PRODUITS", postes: ["TA", "TB", "TC", "TD", "TE", "TF", "TG", "TH", "TI"] },
  { code: "ACHATS", numero: "22", libelle: "Achats", forme: "CHARGES_PRODUITS", postes: ["RA", "RB", "RC", "RD", "RE"] },
  { code: "TRANSPORTS", numero: "23", libelle: "Transports", forme: "CHARGES_PRODUITS", postes: ["RG"] },
  { code: "SERVICES_EXTERIEURS", numero: "24", libelle: "Services extérieurs", forme: "CHARGES_PRODUITS", postes: ["RH"] },
  { code: "IMPOTS_TAXES", numero: "25", libelle: "Impôts et taxes", forme: "CHARGES_PRODUITS", postes: ["RI"] },
  { code: "AUTRES_CHARGES", numero: "26", libelle: "Autres charges", forme: "CHARGES_PRODUITS", postes: ["RJ"] },
  { code: "PERSONNEL", numero: "27", libelle: "Charges de personnel", forme: "CHARGES_PRODUITS", postes: ["RK"] },
  // Une note ne mêle jamais charges et produits : leur total n'aurait pas de
  // sens. Dotations et reprises, revenus et frais, produits et charges HAO
  // font donc chacun leur note, comme sur le modèle.
  { code: "DOTATIONS", numero: "28", libelle: "Dotations aux amortissements, provisions et dépréciations", forme: "CHARGES_PRODUITS", postes: ["RL"] },
  { code: "REPRISES", numero: "28 bis", libelle: "Reprises d'amortissements, provisions et dépréciations", forme: "CHARGES_PRODUITS", postes: ["TJ"] },
  { code: "REVENUS_FINANCIERS", numero: "29", libelle: "Revenus financiers et assimilés", forme: "CHARGES_PRODUITS", postes: ["TK"] },
  { code: "FRAIS_FINANCIERS", numero: "30", libelle: "Frais financiers et charges assimilées", forme: "CHARGES_PRODUITS", postes: ["RM"] },
  { code: "PRODUITS_HAO", numero: "31", libelle: "Produits hors activités ordinaires", forme: "CHARGES_PRODUITS", postes: ["TN", "TO"] },
  { code: "CHARGES_HAO", numero: "32", libelle: "Charges hors activités ordinaires", forme: "CHARGES_PRODUITS", postes: ["RO", "RP"] },
  { code: "IMPOT_RESULTAT", numero: "33", libelle: "Participation et impôts sur le résultat", forme: "CHARGES_PRODUITS", postes: ["RQ", "RS"] },
];

/**
 * Notes que les livres ne peuvent pas produire. Elles figurent dans la liasse
 * et restent à rédiger : l'écran les rappelle pour qu'elles ne soient pas
 * oubliées, sans prétendre les remplir.
 */
export const NOTES_A_REDIGER: { numero: string; libelle: string }[] = [
  { numero: "1", libelle: "Dettes garanties par des sûretés réelles" },
  { numero: "2", libelle: "Informations obligatoires (règles et méthodes comptables)" },
  { numero: "3B", libelle: "Biens pris en location-acquisition" },
  { numero: "3D", libelle: "Plus et moins-values de cession détaillées par bien" },
  { numero: "16B", libelle: "Engagements de retraite et avantages assimilés" },
  { numero: "34", libelle: "Projet d'affectation du résultat" },
  { numero: "35", libelle: "Effectifs, masse salariale et personnel extérieur" },
  { numero: "36", libelle: "Événements postérieurs à la clôture" },
];

// ---------------------------------------------------------------------------
// Calcul
// ---------------------------------------------------------------------------

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
  notes: Note[];
  aRediger: typeof NOTES_A_REDIGER;
};

/** Solde signé d'un compte, positif si débiteur. */
function soldeSigne(l: LigneBalance | undefined) {
  return l ? l.soldeDebiteur - l.soldeCrediteur : 0;
}

/**
 * Vrai si le compte appartient à l'un des postes de la note, dans le rôle
 * demandé.
 *
 * Un compte à double sens — une banque, créditrice quand elle est à découvert
 * — ne figure que d'un côté : celui que son solde de clôture lui donne. Sans
 * cela il apparaîtrait à la fois en trésorerie-actif et en trésorerie-passif.
 */
function appartient(
  numero: string,
  soldeCloture: number,
  def: DefinitionNote,
): boolean {
  const r = rattachementDuCompte(numero);
  if (!r) return false;

  const poste =
    "poste" in r ? r.poste : soldeCloture >= 0 ? r.debiteur : r.crediteur;
  if (!def.postes.includes(poste)) return false;

  const role = "poste" in r ? (r.role ?? "BRUT") : "BRUT";
  return def.role ? role === def.role : true;
}

/**
 * Regroupe ouverture et mouvements par compte, pour tous les comptes qui
 * apparaissent dans l'une ou l'autre.
 */
function parCompte(ouverture: LigneBalance[], mouvements: LigneBalance[]) {
  const index = new Map<
    string,
    { libelle: string; ouverture?: LigneBalance; mouvements?: LigneBalance }
  >();
  for (const l of ouverture) {
    index.set(l.compteNumero, { libelle: l.compteLibelle, ouverture: l });
  }
  for (const l of mouvements) {
    const e = index.get(l.compteNumero);
    if (e) e.mouvements = l;
    else index.set(l.compteNumero, { libelle: l.compteLibelle, mouvements: l });
  }
  return [...index.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Un compte dont tout est nul n'apporte rien à la note. Mais un compte qui a
 * bougé dans l'année pour revenir à zéro y reste : la note montre les
 * mouvements, pas seulement les soldes.
 */
function vide(...montants: number[]) {
  return montants.every((m) => m === 0);
}

export function calculerNotesAnnexes(
  ouverture: LigneBalance[],
  mouvements: LigneBalance[],
): NotesAnnexes {
  const comptes = parCompte(ouverture, mouvements);

  const notes: Note[] = NOTES.map((def) => {
    const retenus = comptes.filter(([numero, c]) =>
      appartient(
        numero,
        soldeSigne(c.ouverture) + soldeSigne(c.mouvements),
        def,
      ),
    );

    if (def.forme === "MOUVEMENTS") {
      // Un compte qui grossit au crédit se lit en positif au crédit : on
      // change le signe des soldes pour que « début » et « fin » soient les
      // montants du bilan, pas des soldes débiteurs négatifs.
      const signe = def.sensCroissance === "CREDIT" ? -1 : 1;
      const lignes: LigneNoteMouvements[] = retenus
        .map(([numero, c]) => {
          const debut = signe * soldeSigne(c.ouverture);
          const augmentations =
            def.sensCroissance === "CREDIT"
              ? (c.mouvements?.totalCredit ?? 0)
              : (c.mouvements?.totalDebit ?? 0);
          const diminutions =
            def.sensCroissance === "CREDIT"
              ? (c.mouvements?.totalDebit ?? 0)
              : (c.mouvements?.totalCredit ?? 0);
          return {
            compteNumero: numero,
            compteLibelle: c.libelle,
            debut,
            augmentations,
            diminutions,
            fin: debut + augmentations - diminutions,
          };
        })
        .filter((l) => !vide(l.debut, l.augmentations, l.diminutions, l.fin));

      return {
        definition: def,
        forme: "MOUVEMENTS",
        lignes,
        total: {
          compteNumero: "",
          compteLibelle: "Total",
          debut: sommeMontants(lignes.map((l) => l.debut)),
          augmentations: sommeMontants(lignes.map((l) => l.augmentations)),
          diminutions: sommeMontants(lignes.map((l) => l.diminutions)),
          fin: sommeMontants(lignes.map((l) => l.fin)),
        },
      };
    }

    if (def.forme === "SOLDES") {
      // Les soldes sont présentés dans le sens du poste : positif pour un
      // actif débiteur comme pour un passif créditeur.
      const lignes: LigneNoteSoldes[] = retenus
        .map(([numero, c]) => {
          const r = rattachementDuCompte(numero)!;
          const debutSigne = soldeSigne(c.ouverture);
          const finSigne = debutSigne + soldeSigne(c.mouvements);
          // Le côté du bilan se lit sur le poste effectif à la clôture.
          const poste =
            "poste" in r ? r.poste : finSigne >= 0 ? r.debiteur : r.crediteur;
          const signe = poste.startsWith("B") || poste.startsWith("A") ? 1 : -1;
          return {
            compteNumero: numero,
            compteLibelle: c.libelle,
            debut: signe * debutSigne,
            fin: signe * finSigne,
            variation: signe * (finSigne - debutSigne),
          };
        })
        .filter((l) => !vide(l.debut, l.fin));

      return {
        definition: def,
        forme: "SOLDES",
        lignes,
        total: {
          compteNumero: "",
          compteLibelle: "Total",
          debut: sommeMontants(lignes.map((l) => l.debut)),
          fin: sommeMontants(lignes.map((l) => l.fin)),
          variation: sommeMontants(lignes.map((l) => l.variation)),
        },
      };
    }

    // Charges et produits : le montant de l'exercice, chacun dans son sens.
    const lignes: LigneNoteChargesProduits[] = retenus
      .map(([numero, c]) => {
        const s = soldeSigne(c.mouvements);
        const estProduit = numero.startsWith("7") || /^8[2468]/.test(numero);
        return {
          compteNumero: numero,
          compteLibelle: c.libelle,
          montant: estProduit ? -s : s,
        };
      })
      .filter((l) => l.montant !== 0);

    return {
      definition: def,
      forme: "CHARGES_PRODUITS",
      lignes,
      total: sommeMontants(lignes.map((l) => l.montant)),
    };
  });

  return { notes, aRediger: NOTES_A_REDIGER };
}
