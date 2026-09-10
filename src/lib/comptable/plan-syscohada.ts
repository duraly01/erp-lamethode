/**
 * Plan comptable SYSCOHADA révisé — référentiel livré avec l'ERP.
 *
 * Ce plan est copié dans `cpta_comptes` à l'ouverture du premier exercice d'un
 * contribuable, qui peut ensuite l'enrichir ou en désactiver des comptes. Le
 * référentiel lui-même n'est jamais modifié : il reste la base commune.
 *
 * Périmètre : les comptes qu'une PME camerounaise utilise réellement. Le plan
 * officiel en compte davantage ; les subdivisions manquantes se créent au cas
 * par cas depuis l'écran Plan comptable.
 *
 * ⚠️ À faire valider par l'expert-comptable référent avant la première mise en
 * service, en particulier les comptes de TVA et de charges sociales, qui
 * conditionnent les déclarations.
 */

/** Nature d'un compte, pour la présentation aux états financiers. */
export type TypeCompte = "ACTIF" | "PASSIF" | "CHARGE" | "PRODUIT";

export type CompteReference = {
  numero: string;
  libelle: string;
  classe: number;
  type: TypeCompte;
  /** Compte collectif de tiers : la saisie exige un tiers. */
  collectif?: boolean;
  lettrable?: boolean;
  /** Compte de trésorerie susceptible d'être rapproché d'un relevé. */
  rapprochable?: boolean;
};

// ---------------------------------------------------------------------------
// Classe 1 — Ressources durables
// ---------------------------------------------------------------------------

const CLASSE_1: CompteReference[] = [
  { numero: "101", libelle: "Capital social", classe: 1, type: "PASSIF" },
  { numero: "104", libelle: "Primes liées au capital social", classe: 1, type: "PASSIF" },
  { numero: "105", libelle: "Écarts de réévaluation", classe: 1, type: "PASSIF" },
  { numero: "1061", libelle: "Réserve légale", classe: 1, type: "PASSIF" },
  { numero: "1062", libelle: "Réserves statutaires", classe: 1, type: "PASSIF" },
  { numero: "1068", libelle: "Autres réserves", classe: 1, type: "PASSIF" },
  { numero: "110", libelle: "Report à nouveau créditeur", classe: 1, type: "PASSIF" },
  { numero: "119", libelle: "Report à nouveau débiteur", classe: 1, type: "PASSIF" },
  { numero: "130", libelle: "Résultat en instance d'affectation", classe: 1, type: "PASSIF" },
  { numero: "131", libelle: "Résultat net : bénéfice", classe: 1, type: "PASSIF" },
  { numero: "139", libelle: "Résultat net : perte", classe: 1, type: "PASSIF" },
  { numero: "141", libelle: "Subventions d'équipement", classe: 1, type: "PASSIF" },
  { numero: "151", libelle: "Amortissements dérogatoires", classe: 1, type: "PASSIF" },
  { numero: "161", libelle: "Emprunts obligataires", classe: 1, type: "PASSIF" },
  { numero: "162", libelle: "Emprunts et dettes auprès des établissements de crédit", classe: 1, type: "PASSIF", lettrable: true },
  { numero: "165", libelle: "Dépôts et cautionnements reçus", classe: 1, type: "PASSIF" },
  { numero: "168", libelle: "Autres emprunts et dettes", classe: 1, type: "PASSIF" },
  { numero: "172", libelle: "Dettes de location acquisition", classe: 1, type: "PASSIF" },
  { numero: "191", libelle: "Provisions pour litiges", classe: 1, type: "PASSIF" },
  { numero: "197", libelle: "Provisions pour charges à répartir", classe: 1, type: "PASSIF" },
];

// ---------------------------------------------------------------------------
// Classe 2 — Actif immobilisé
// ---------------------------------------------------------------------------

const CLASSE_2: CompteReference[] = [
  { numero: "211", libelle: "Frais de développement et de prospection", classe: 2, type: "ACTIF" },
  { numero: "212", libelle: "Brevets, licences, concessions et droits similaires", classe: 2, type: "ACTIF" },
  { numero: "213", libelle: "Logiciels et sites internet", classe: 2, type: "ACTIF" },
  { numero: "215", libelle: "Fonds commercial", classe: 2, type: "ACTIF" },
  { numero: "221", libelle: "Terrains agricoles et forestiers", classe: 2, type: "ACTIF" },
  { numero: "222", libelle: "Terrains nus", classe: 2, type: "ACTIF" },
  { numero: "223", libelle: "Terrains bâtis", classe: 2, type: "ACTIF" },
  { numero: "231", libelle: "Bâtiments industriels, agricoles et commerciaux", classe: 2, type: "ACTIF" },
  { numero: "232", libelle: "Bâtiments administratifs et commerciaux", classe: 2, type: "ACTIF" },
  { numero: "233", libelle: "Ouvrages d'infrastructure", classe: 2, type: "ACTIF" },
  { numero: "235", libelle: "Aménagements et agencements des bâtiments", classe: 2, type: "ACTIF" },
  { numero: "241", libelle: "Matériel et outillage industriel et commercial", classe: 2, type: "ACTIF" },
  { numero: "243", libelle: "Matériel d'emballage récupérable et identifiable", classe: 2, type: "ACTIF" },
  { numero: "244", libelle: "Matériel et mobilier de bureau", classe: 2, type: "ACTIF" },
  { numero: "2444", libelle: "Matériel informatique", classe: 2, type: "ACTIF" },
  { numero: "245", libelle: "Matériel de transport", classe: 2, type: "ACTIF" },
  { numero: "246", libelle: "Actifs biologiques", classe: 2, type: "ACTIF" },
  { numero: "261", libelle: "Titres de participation dans des sociétés sous contrôle exclusif", classe: 2, type: "ACTIF" },
  { numero: "275", libelle: "Dépôts et cautionnements versés", classe: 2, type: "ACTIF", lettrable: true },
  { numero: "2812", libelle: "Amortissements des brevets, licences et logiciels", classe: 2, type: "ACTIF" },
  { numero: "2813", libelle: "Amortissements des bâtiments", classe: 2, type: "ACTIF" },
  { numero: "2841", libelle: "Amortissements du matériel et outillage", classe: 2, type: "ACTIF" },
  { numero: "2844", libelle: "Amortissements du matériel et mobilier de bureau", classe: 2, type: "ACTIF" },
  { numero: "2845", libelle: "Amortissements du matériel de transport", classe: 2, type: "ACTIF" },
  { numero: "291", libelle: "Dépréciations des immobilisations incorporelles", classe: 2, type: "ACTIF" },
];

// ---------------------------------------------------------------------------
// Classe 3 — Stocks
// ---------------------------------------------------------------------------

const CLASSE_3: CompteReference[] = [
  { numero: "311", libelle: "Marchandises", classe: 3, type: "ACTIF" },
  { numero: "321", libelle: "Matières premières", classe: 3, type: "ACTIF" },
  { numero: "322", libelle: "Fournitures liées", classe: 3, type: "ACTIF" },
  { numero: "331", libelle: "Matières consommables", classe: 3, type: "ACTIF" },
  { numero: "335", libelle: "Emballages", classe: 3, type: "ACTIF" },
  { numero: "341", libelle: "Produits en cours", classe: 3, type: "ACTIF" },
  { numero: "361", libelle: "Produits finis", classe: 3, type: "ACTIF" },
  { numero: "381", libelle: "Marchandises en cours de route", classe: 3, type: "ACTIF" },
  { numero: "391", libelle: "Dépréciations des stocks de marchandises", classe: 3, type: "ACTIF" },
];

// ---------------------------------------------------------------------------
// Classe 4 — Tiers
// ---------------------------------------------------------------------------

const CLASSE_4: CompteReference[] = [
  { numero: "401", libelle: "Fournisseurs, dettes en compte", classe: 4, type: "PASSIF", collectif: true, lettrable: true },
  { numero: "4011", libelle: "Fournisseurs locaux", classe: 4, type: "PASSIF", collectif: true, lettrable: true },
  { numero: "4012", libelle: "Fournisseurs étrangers", classe: 4, type: "PASSIF", collectif: true, lettrable: true },
  { numero: "408", libelle: "Fournisseurs, factures non parvenues", classe: 4, type: "PASSIF", lettrable: true },
  { numero: "4091", libelle: "Fournisseurs, avances et acomptes versés", classe: 4, type: "ACTIF", collectif: true, lettrable: true },
  { numero: "411", libelle: "Clients", classe: 4, type: "ACTIF", collectif: true, lettrable: true },
  { numero: "4111", libelle: "Clients locaux", classe: 4, type: "ACTIF", collectif: true, lettrable: true },
  { numero: "4112", libelle: "Clients à l'exportation", classe: 4, type: "ACTIF", collectif: true, lettrable: true },
  { numero: "416", libelle: "Créances clients litigieuses ou douteuses", classe: 4, type: "ACTIF", collectif: true, lettrable: true },
  { numero: "418", libelle: "Clients, produits à recevoir", classe: 4, type: "ACTIF", lettrable: true },
  { numero: "4191", libelle: "Clients, avances et acomptes reçus", classe: 4, type: "PASSIF", collectif: true, lettrable: true },
  { numero: "421", libelle: "Personnel, avances et acomptes", classe: 4, type: "ACTIF", collectif: true, lettrable: true },
  { numero: "422", libelle: "Personnel, rémunérations dues", classe: 4, type: "PASSIF", collectif: true, lettrable: true },
  { numero: "423", libelle: "Personnel, oppositions et saisies-arrêts", classe: 4, type: "PASSIF" },
  { numero: "428", libelle: "Personnel, charges à payer", classe: 4, type: "PASSIF" },
  { numero: "431", libelle: "Sécurité sociale (CNPS)", classe: 4, type: "PASSIF", lettrable: true },
  { numero: "438", libelle: "Organismes sociaux, charges à payer", classe: 4, type: "PASSIF" },
  { numero: "441", libelle: "État, impôt sur les bénéfices", classe: 4, type: "PASSIF", lettrable: true },
  { numero: "442", libelle: "État, autres impôts et taxes", classe: 4, type: "PASSIF", lettrable: true },
  { numero: "4431", libelle: "État, TVA facturée sur ventes", classe: 4, type: "PASSIF" },
  { numero: "4432", libelle: "État, TVA facturée sur prestations de services", classe: 4, type: "PASSIF" },
  { numero: "4441", libelle: "État, TVA due", classe: 4, type: "PASSIF", lettrable: true },
  { numero: "4449", libelle: "État, crédit de TVA à reporter", classe: 4, type: "ACTIF" },
  { numero: "4451", libelle: "État, TVA récupérable sur immobilisations", classe: 4, type: "ACTIF" },
  { numero: "4452", libelle: "État, TVA récupérable sur achats", classe: 4, type: "ACTIF" },
  { numero: "4453", libelle: "État, TVA récupérable sur transports", classe: 4, type: "ACTIF" },
  { numero: "4454", libelle: "État, TVA récupérable sur services extérieurs", classe: 4, type: "ACTIF" },
  { numero: "4471", libelle: "État, impôt sur salaires (IRPP)", classe: 4, type: "PASSIF", lettrable: true },
  { numero: "4472", libelle: "État, précompte sur loyers", classe: 4, type: "PASSIF", lettrable: true },
  { numero: "4473", libelle: "État, acompte d'impôt sur le revenu (AIR)", classe: 4, type: "ACTIF", lettrable: true },
  { numero: "449", libelle: "État, créances et dettes diverses", classe: 4, type: "PASSIF", lettrable: true },
  { numero: "461", libelle: "Associés, opérations sur le capital", classe: 4, type: "PASSIF" },
  { numero: "462", libelle: "Associés, comptes courants", classe: 4, type: "PASSIF", collectif: true, lettrable: true },
  { numero: "465", libelle: "Associés, dividendes à payer", classe: 4, type: "PASSIF" },
  { numero: "471", libelle: "Comptes d'attente", classe: 4, type: "ACTIF", lettrable: true },
  { numero: "4718", libelle: "Autres créditeurs divers", classe: 4, type: "PASSIF", lettrable: true },
  { numero: "481", libelle: "Fournisseurs d'investissement", classe: 4, type: "PASSIF", collectif: true, lettrable: true },
  { numero: "485", libelle: "Créances sur cessions d'immobilisations", classe: 4, type: "ACTIF", lettrable: true },
  { numero: "491", libelle: "Dépréciations des comptes clients", classe: 4, type: "ACTIF" },
];

// ---------------------------------------------------------------------------
// Classe 5 — Trésorerie
// ---------------------------------------------------------------------------

const CLASSE_5: CompteReference[] = [
  { numero: "521", libelle: "Banques locales", classe: 5, type: "ACTIF", rapprochable: true, lettrable: true },
  { numero: "5211", libelle: "Banque — compte principal", classe: 5, type: "ACTIF", rapprochable: true, lettrable: true },
  { numero: "524", libelle: "Banques, autres comptes", classe: 5, type: "ACTIF", rapprochable: true },
  { numero: "531", libelle: "Chèques postaux", classe: 5, type: "ACTIF", rapprochable: true },
  // Le Mobile Money n'a pas de compte dédié dans le plan officiel. Il est
  // rattaché aux établissements financiers assimilés : subdivision à confirmer
  // avec l'expert-comptable, mais indispensable sur ce marché.
  { numero: "5381", libelle: "Mobile Money — MTN MoMo", classe: 5, type: "ACTIF", rapprochable: true },
  { numero: "5382", libelle: "Mobile Money — Orange Money", classe: 5, type: "ACTIF", rapprochable: true },
  { numero: "571", libelle: "Caisse siège social", classe: 5, type: "ACTIF" },
  { numero: "572", libelle: "Caisse succursale", classe: 5, type: "ACTIF" },
  { numero: "585", libelle: "Virements de fonds", classe: 5, type: "ACTIF", lettrable: true },
];

// ---------------------------------------------------------------------------
// Classe 6 — Charges des activités ordinaires
// ---------------------------------------------------------------------------

const CLASSE_6: CompteReference[] = [
  { numero: "601", libelle: "Achats de marchandises", classe: 6, type: "CHARGE" },
  { numero: "602", libelle: "Achats de matières premières et fournitures liées", classe: 6, type: "CHARGE" },
  { numero: "6031", libelle: "Variations des stocks de marchandises", classe: 6, type: "CHARGE" },
  { numero: "6032", libelle: "Variations des stocks de matières premières", classe: 6, type: "CHARGE" },
  { numero: "604", libelle: "Achats stockés de matières et fournitures consommables", classe: 6, type: "CHARGE" },
  { numero: "6051", libelle: "Fournitures non stockables — eau", classe: 6, type: "CHARGE" },
  { numero: "6052", libelle: "Fournitures non stockables — électricité", classe: 6, type: "CHARGE" },
  { numero: "6053", libelle: "Fournitures non stockables — carburants", classe: 6, type: "CHARGE" },
  { numero: "6055", libelle: "Fournitures de bureau", classe: 6, type: "CHARGE" },
  { numero: "608", libelle: "Achats d'emballages", classe: 6, type: "CHARGE" },
  { numero: "611", libelle: "Transports sur achats", classe: 6, type: "CHARGE" },
  { numero: "612", libelle: "Transports sur ventes", classe: 6, type: "CHARGE" },
  { numero: "613", libelle: "Transports pour le compte du personnel", classe: 6, type: "CHARGE" },
  { numero: "618", libelle: "Autres frais de transport", classe: 6, type: "CHARGE" },
  { numero: "621", libelle: "Sous-traitance générale", classe: 6, type: "CHARGE" },
  { numero: "6221", libelle: "Locations de terrains", classe: 6, type: "CHARGE" },
  { numero: "6222", libelle: "Locations de bâtiments", classe: 6, type: "CHARGE" },
  { numero: "6223", libelle: "Locations de matériel et outillage", classe: 6, type: "CHARGE" },
  { numero: "624", libelle: "Entretien, réparations et maintenance", classe: 6, type: "CHARGE" },
  { numero: "625", libelle: "Primes d'assurance", classe: 6, type: "CHARGE" },
  { numero: "626", libelle: "Études, recherches et documentation", classe: 6, type: "CHARGE" },
  { numero: "627", libelle: "Publicité, publications, relations publiques", classe: 6, type: "CHARGE" },
  { numero: "628", libelle: "Frais de télécommunications", classe: 6, type: "CHARGE" },
  { numero: "631", libelle: "Frais bancaires", classe: 6, type: "CHARGE" },
  { numero: "6324", libelle: "Honoraires", classe: 6, type: "CHARGE" },
  { numero: "633", libelle: "Frais de formation du personnel", classe: 6, type: "CHARGE" },
  { numero: "634", libelle: "Redevances pour brevets, licences et logiciels", classe: 6, type: "CHARGE" },
  { numero: "635", libelle: "Cotisations", classe: 6, type: "CHARGE" },
  { numero: "637", libelle: "Rémunérations de personnel extérieur", classe: 6, type: "CHARGE" },
  { numero: "638", libelle: "Autres charges externes", classe: 6, type: "CHARGE" },
  { numero: "6411", libelle: "Impôts fonciers et taxes annexes", classe: 6, type: "CHARGE" },
  { numero: "6413", libelle: "Patentes, licences et taxes annexes", classe: 6, type: "CHARGE" },
  { numero: "6414", libelle: "Taxes sur appointements et salaires", classe: 6, type: "CHARGE" },
  { numero: "645", libelle: "Impôts et taxes indirects", classe: 6, type: "CHARGE" },
  { numero: "646", libelle: "Droits d'enregistrement", classe: 6, type: "CHARGE" },
  { numero: "647", libelle: "Pénalités et amendes fiscales", classe: 6, type: "CHARGE" },
  { numero: "651", libelle: "Pertes sur créances clients", classe: 6, type: "CHARGE" },
  { numero: "654", libelle: "Valeurs comptables des cessions courantes d'immobilisations", classe: 6, type: "CHARGE" },
  { numero: "658", libelle: "Charges diverses", classe: 6, type: "CHARGE" },
  { numero: "6611", libelle: "Appointements, salaires et commissions", classe: 6, type: "CHARGE" },
  { numero: "6612", libelle: "Primes et gratifications", classe: 6, type: "CHARGE" },
  { numero: "663", libelle: "Indemnités forfaitaires versées au personnel", classe: 6, type: "CHARGE" },
  { numero: "6641", libelle: "Charges sociales sur rémunération du personnel national", classe: 6, type: "CHARGE" },
  { numero: "668", libelle: "Autres charges sociales", classe: 6, type: "CHARGE" },
  { numero: "671", libelle: "Intérêts des emprunts", classe: 6, type: "CHARGE" },
  { numero: "674", libelle: "Autres intérêts", classe: 6, type: "CHARGE" },
  { numero: "676", libelle: "Pertes de change", classe: 6, type: "CHARGE" },
  { numero: "6811", libelle: "Dotations aux amortissements des immobilisations incorporelles", classe: 6, type: "CHARGE" },
  { numero: "6813", libelle: "Dotations aux amortissements des immobilisations corporelles", classe: 6, type: "CHARGE" },
  { numero: "6911", libelle: "Dotations aux provisions d'exploitation", classe: 6, type: "CHARGE" },
  { numero: "6594", libelle: "Charges provisionnées d'exploitation sur créances", classe: 6, type: "CHARGE" },
];

// ---------------------------------------------------------------------------
// Classe 7 — Produits des activités ordinaires
// ---------------------------------------------------------------------------

const CLASSE_7: CompteReference[] = [
  { numero: "701", libelle: "Ventes de marchandises", classe: 7, type: "PRODUIT" },
  { numero: "702", libelle: "Ventes de produits finis", classe: 7, type: "PRODUIT" },
  { numero: "705", libelle: "Travaux facturés", classe: 7, type: "PRODUIT" },
  { numero: "706", libelle: "Services vendus", classe: 7, type: "PRODUIT" },
  { numero: "707", libelle: "Produits accessoires", classe: 7, type: "PRODUIT" },
  { numero: "7071", libelle: "Ports, emballages perdus et autres frais facturés", classe: 7, type: "PRODUIT" },
  { numero: "711", libelle: "Subventions d'exploitation sur produits", classe: 7, type: "PRODUIT" },
  { numero: "721", libelle: "Production immobilisée — immobilisations incorporelles", classe: 7, type: "PRODUIT" },
  { numero: "734", libelle: "Variations des stocks de produits en cours", classe: 7, type: "PRODUIT" },
  { numero: "736", libelle: "Variations des stocks de produits finis", classe: 7, type: "PRODUIT" },
  { numero: "754", libelle: "Produits des cessions courantes d'immobilisations", classe: 7, type: "PRODUIT" },
  { numero: "758", libelle: "Produits divers", classe: 7, type: "PRODUIT" },
  { numero: "771", libelle: "Intérêts de prêts", classe: 7, type: "PRODUIT" },
  { numero: "776", libelle: "Gains de change", classe: 7, type: "PRODUIT" },
  { numero: "781", libelle: "Transferts de charges d'exploitation", classe: 7, type: "PRODUIT" },
  { numero: "791", libelle: "Reprises de provisions d'exploitation", classe: 7, type: "PRODUIT" },
  { numero: "7594", libelle: "Reprises de charges provisionnées d'exploitation sur créances", classe: 7, type: "PRODUIT" },
];

// ---------------------------------------------------------------------------
// Classe 8 — Autres charges et produits (hors activités ordinaires)
// ---------------------------------------------------------------------------

const CLASSE_8: CompteReference[] = [
  { numero: "812", libelle: "Valeurs comptables des cessions d'immobilisations corporelles", classe: 8, type: "CHARGE" },
  { numero: "822", libelle: "Produits des cessions d'immobilisations corporelles", classe: 8, type: "PRODUIT" },
  { numero: "831", libelle: "Charges HAO constatées", classe: 8, type: "CHARGE" },
  { numero: "834", libelle: "Pertes sur créances HAO", classe: 8, type: "CHARGE" },
  { numero: "841", libelle: "Produits HAO constatés", classe: 8, type: "PRODUIT" },
  { numero: "848", libelle: "Transferts de charges HAO", classe: 8, type: "PRODUIT" },
  { numero: "851", libelle: "Dotations aux provisions réglementées", classe: 8, type: "CHARGE" },
  { numero: "861", libelle: "Reprises de provisions réglementées", classe: 8, type: "PRODUIT" },
  { numero: "871", libelle: "Participation des travailleurs", classe: 8, type: "CHARGE" },
  { numero: "881", libelle: "Subventions d'équilibre", classe: 8, type: "PRODUIT" },
  { numero: "891", libelle: "Impôts sur les bénéfices de l'exercice", classe: 8, type: "CHARGE" },
];

/** Plan comptable de référence, dans l'ordre des classes. */
export const PLAN_SYSCOHADA: CompteReference[] = [
  ...CLASSE_1,
  ...CLASSE_2,
  ...CLASSE_3,
  ...CLASSE_4,
  ...CLASSE_5,
  ...CLASSE_6,
  ...CLASSE_7,
  ...CLASSE_8,
];

// ---------------------------------------------------------------------------
// Journaux livrés à l'ouverture d'un exercice
// ---------------------------------------------------------------------------

export type JournalReference = {
  code: string;
  libelle: string;
  type: "ACHAT" | "VENTE" | "BANQUE" | "CAISSE" | "DIVERS" | "A_NOUVEAUX";
  /** Compte de contrepartie automatique, désigné par son numéro. */
  compteContrepartie?: string;
};

export const JOURNAUX_PAR_DEFAUT: JournalReference[] = [
  { code: "AC", libelle: "Journal des achats", type: "ACHAT" },
  { code: "VE", libelle: "Journal des ventes", type: "VENTE" },
  { code: "BQ", libelle: "Journal de banque", type: "BANQUE", compteContrepartie: "5211" },
  { code: "CA", libelle: "Journal de caisse", type: "CAISSE", compteContrepartie: "571" },
  { code: "OD", libelle: "Opérations diverses", type: "DIVERS" },
  { code: "AN", libelle: "À-nouveaux", type: "A_NOUVEAUX" },
];

// ---------------------------------------------------------------------------
// Taxes livrées — Cameroun
// ---------------------------------------------------------------------------

export type TaxeReference = {
  code: string;
  libelle: string;
  /** Taux en pourcentage. */
  taux: string;
  type: "TVA_COLLECTEE" | "TVA_DEDUCTIBLE" | "RETENUE" | "ACOMPTE";
  /** Compte de rattachement, désigné par son numéro. */
  compte: string;
  valideDu: string;
};

/**
 * Taux en vigueur à la date de rédaction. Ils sont **datés** : une évolution en
 * loi de finances se traduit par une nouvelle ligne avec un nouveau `valideDu`,
 * et par la clôture de l'ancienne — jamais par la modification d'un taux
 * existant, qui fausserait tout recalcul de période antérieure.
 *
 * ⚠️ À faire confirmer par l'expert-comptable avant mise en service.
 */
export const TAXES_PAR_DEFAUT: TaxeReference[] = [
  { code: "TVA1925", libelle: "TVA collectée 19,25 %", taux: "19.2500", type: "TVA_COLLECTEE", compte: "4431", valideDu: "2019-01-01" },
  { code: "TVA1925D", libelle: "TVA déductible 19,25 %", taux: "19.2500", type: "TVA_DEDUCTIBLE", compte: "4452", valideDu: "2019-01-01" },
  { code: "TVA0", libelle: "Exonéré / taux zéro", taux: "0.0000", type: "TVA_COLLECTEE", compte: "4431", valideDu: "2019-01-01" },
  { code: "AIR22", libelle: "Acompte d'impôt sur le revenu 2,2 %", taux: "2.2000", type: "ACOMPTE", compte: "4473", valideDu: "2019-01-01" },
  { code: "AIR55", libelle: "Acompte d'impôt sur le revenu 5,5 %", taux: "5.5000", type: "ACOMPTE", compte: "4473", valideDu: "2019-01-01" },
];
