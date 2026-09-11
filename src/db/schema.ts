import {
  pgEnum,
  pgTable,
  serial,
  text,
  varchar,
  date,
  timestamp,
  numeric,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types portés par les colonnes jsonb
// ---------------------------------------------------------------------------

/** Permission fine attachée à un rôle (RBAC). */
export type RolePermission = {
  ressource: string; // ex: "contribuables", "declarations", "*"
  actions: string[]; // ex: ["read", "create", "update", "delete"]
};

/** Diff avant/après enregistré dans le journal d'audit. */
export type AuditDiff = {
  avant?: Record<string, unknown> | null;
  apres?: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Énumérations vestiges
//
// Les types d'origine appartiennent au rôle `lamethode` alors que les tables
// appartiennent à `lamethode_erp` : l'application ne peut donc ni les modifier
// ni les supprimer (« must be owner of type … »). Les énumérations qui devaient
// évoluer ont été recréées sous un nom suffixé `_v2`, et les colonnes y ont été
// basculées — ce que la propriété des tables autorise.
//
// Ces types-ci ne sont plus référencés par aucune colonne, mais ils existent
// toujours en base. Les déclarer ici garde le schéma fidèle à la réalité et
// évite que drizzle-kit ne tente de les supprimer à chaque génération.
//
// À supprimer le jour où l'hébergeur exécutera :
//   ALTER TYPE public.<type> OWNER TO lamethode_erp;
// (voir docs/18-migration-production.md)
// ---------------------------------------------------------------------------

export const regimeFiscalLegacyEnum = pgEnum("regime_fiscal", [
  "REEL",
  "SIMPLIFIE",
  "IFU",
]);

export const declarationTypeLegacyEnum = pgEnum("declaration_type", [
  "DSF",
  "SOLDE_DSF",
  "IRPP",
  "BEF",
  "BAIL",
  "PRECOMPTE_LOYER",
  "TVA",
  "ACOMPTE_IS",
  "CNPS",
  "PATENTE",
  "AUTRE",
]);

export const periodiciteLegacyEnum = pgEnum("periodicite", [
  "MENSUELLE",
  "ANNUELLE",
]);

export const roleNomLegacyEnum = pgEnum("role_nom", [
  "ADMIN",
  "MANAGER",
  "COLLABORATEUR",
  "LECTURE",
]);

// ---------------------------------------------------------------------------
// Enums en service
// ---------------------------------------------------------------------------

// Régimes d'imposition camerounais : le Réel, et l'IGS (forfait par classes)
// qui a remplacé le régime simplifié et l'impôt libératoire.
export const regimeFiscalEnum = pgEnum("regime_fiscal_v2", ["REEL", "IGS"]);

export const declarationTypeEnum = pgEnum("declaration_type_v2", [
  "DSF",
  "SOLDE_DSF",
  "IRPP",
  "BEF",
  "BAIL",
  "PRECOMPTE_LOYER",
  "TVA",
  "ACOMPTE_IS",
  "CNPS",
  "PATENTE",
  "IGS",
  "IGS_ANNUELLE",
  "AUTRE",
]);

export const periodiciteEnum = pgEnum("periodicite_v2", [
  "MENSUELLE",
  "TRIMESTRIELLE",
  "ANNUELLE",
]);

export const statutDeclarationEnum = pgEnum("statut_declaration", [
  "A_FAIRE",
  "DEPOSEE",
  "PAYEE",
  "EN_RETARD",
  "EXONERE",
]);

export const statutAcfEnum = pgEnum("statut_acf", [
  "EN_COURS",
  "BLOQUE",
  "DELIVRE",
  "REJETE",
]);

/**
 * Rôles livrés d'origine. Le nom du rôle n'est plus une énumération Postgres :
 * l'administrateur peut créer ses propres niveaux depuis l'écran
 * Rôles & permissions, ce qu'un enum aurait interdit sans migration.
 */
export const ROLES_SYSTEME = [
  "ADMIN",
  "MANAGER",
  "COLLABORATEUR",
  "LECTURE",
] as const;

export const statutPenaliteEnum = pgEnum("statut_penalite", [
  "ESTIMEE",
  "CONFIRMEE",
  "ANNULEE",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "RAPPEL",
  "ALERTE",
  "INFO",
]);

export const notificationCanalEnum = pgEnum("notification_canal", [
  "DASHBOARD",
  "EMAIL",
  "SMS",
  "WHATSAPP",
  "PUSH",
]);

// ---------------------------------------------------------------------------
// Sécurité & utilisateurs
// ---------------------------------------------------------------------------

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 50 }).notNull().unique(),
  description: text("description"),
  permissions: jsonb("permissions")
    .$type<RolePermission[]>()
    .default([])
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    nom: text("nom").notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    telephone: text("telephone"),
    passwordHash: text("password_hash"),
    roleId: integer("role_id").references(() => roles.id, {
      onDelete: "set null",
    }),
    actif: boolean("actif").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

// ---------------------------------------------------------------------------
// Contribuables (existant + extensions)
// ---------------------------------------------------------------------------

export const contribuables = pgTable(
  "contribuables",
  {
    id: serial("id").primaryKey(),
    nom: text("nom").notNull(),
    niu: varchar("niu", { length: 30 }),
    centreImpots: text("centre_impots"),
    regimeFiscal: regimeFiscalEnum("regime_fiscal").default("REEL").notNull(),
    /** Classe du barème IGS (1 à 12) ; NULL pour un contribuable au Réel. */
    igsClasse: integer("igs_classe"),
    /** Adhérent d'un Centre de Gestion Agréé : abattement de 50 % sur l'IGS. */
    cgaAdherent: boolean("cga_adherent").default(false).notNull(),
    /** Chiffre d'affaires annuel déclaré, qui détermine la classe IGS. */
    chiffreAffairesAnnuel: numeric("chiffre_affaires_annuel", {
      precision: 14,
      scale: 2,
    }),
    /**
     * Honoraires mensuels convenus avec le client. Défini à l'enregistrement du
     * contribuable et révisable à tout moment ; sert de montant proposé sur la
     * facture, qui reste modifiable ligne à ligne.
     */
    honoraireMensuel: numeric("honoraire_mensuel", { precision: 14, scale: 2 }),
    /**
     * Remise commerciale consentie à ce client, en pourcentage des honoraires.
     * Propre à chaque contribuable : le cabinet n'applique aucune remise
     * générale, il n'existe donc pas de valeur par défaut.
     */
    remisePct: numeric("remise_pct", { precision: 5, scale: 2 }),
    /**
     * Délai de paiement convenu, en jours à compter de l'émission. Laissé vide,
     * le délai général des paramètres s'applique — c'est le seul moyen de
     * calculer une échéance quand rien n'a été convenu.
     */
    delaiPaiementJours: integer("delai_paiement_jours"),
    /** Adresse de facturation, lorsqu'elle diffère de celle de la fiche. */
    adresseFacturation: text("adresse_facturation"),
    /**
     * Facturation mensuelle automatique. Faux par défaut : un contribuable
     * n'est jamais facturé tout seul tant qu'on ne l'a pas décidé pour lui.
     */
    facturationAuto: boolean("facturation_auto").default(false).notNull(),
    secteurActivite: text("secteur_activite"),
    telephone: text("telephone"),
    email: text("email"),
    // Champ texte historique conservé pour compatibilité ascendante.
    responsableDossier: text("responsable_dossier"),
    // Nouvelle référence normalisée vers l'utilisateur responsable.
    responsableId: integer("responsable_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dateDebutMission: date("date_debut_mission"),
    actif: boolean("actif").default(true).notNull(),
    notes: text("notes"),
    deletedAt: timestamp("deleted_at"), // soft-delete
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("contribuables_niu_idx").on(t.niu),
    index("contribuables_responsable_idx").on(t.responsableId),
    // La classe IGS doit rester dans le barème géré par l'ERP (1 à 12).
    check(
      "contribuables_igs_classe_check",
      sql`${t.igsClasse} IS NULL OR (${t.igsClasse} >= 1 AND ${t.igsClasse} <= 12)`,
    ),
    // Une remise est un pourcentage : elle ne peut ni être négative, ni
    // dépasser la totalité des honoraires.
    check(
      "contribuables_remise_pct_check",
      sql`${t.remisePct} IS NULL OR (${t.remisePct} >= 0 AND ${t.remisePct} <= 100)`,
    ),
    check(
      "contribuables_delai_paiement_check",
      sql`${t.delaiPaiementJours} IS NULL OR ${t.delaiPaiementJours} > 0`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Déclarations (existant + extensions)
// ---------------------------------------------------------------------------

export const declarations = pgTable(
  "declarations",
  {
    id: serial("id").primaryKey(),
    contribuableId: integer("contribuable_id")
      .references(() => contribuables.id, { onDelete: "cascade" })
      .notNull(),
    type: declarationTypeEnum("type").notNull(),
    periodicite: periodiciteEnum("periodicite").notNull(),
    periode: text("periode").notNull(), // ex: "2026" ou "2026-01"
    dateEcheance: date("date_echeance").notNull(),
    statut: statutDeclarationEnum("statut").default("A_FAIRE").notNull(),
    dateDepot: date("date_depot"),
    datePaiement: date("date_paiement"),
    montant: numeric("montant", { precision: 14, scale: 2 }),
    assignedTo: integer("assigned_to").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // Empêche les doublons d'échéance pour un même contribuable/type/période.
    uniqueIndex("declarations_ctb_type_periode_unique").on(
      t.contribuableId,
      t.type,
      t.periode,
    ),
    index("declarations_contribuable_idx").on(t.contribuableId),
    index("declarations_echeance_idx").on(t.dateEcheance),
    index("declarations_statut_idx").on(t.statut),
    index("declarations_assigned_idx").on(t.assignedTo),
  ],
);

// ---------------------------------------------------------------------------
// ACF (existant + extension)
// ---------------------------------------------------------------------------

export const acfSuivis = pgTable(
  "acf_suivis",
  {
    id: serial("id").primaryKey(),
    contribuableId: integer("contribuable_id")
      .references(() => contribuables.id, { onDelete: "cascade" })
      .notNull(),
    objet: text("objet").notNull(),
    dateDemande: date("date_demande").notNull(),
    statut: statutAcfEnum("statut").default("EN_COURS").notNull(),
    motifBlocage: text("motif_blocage"),
    solution: text("solution"),
    dateResolution: date("date_resolution"),
    dateValidite: date("date_validite"), // pour l'alerte "ACF à renouveler"
    responsable: text("responsable"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("acf_contribuable_idx").on(t.contribuableId),
    index("acf_statut_idx").on(t.statut),
  ],
);

// ---------------------------------------------------------------------------
// CNPS (social)
// ---------------------------------------------------------------------------

export const cnpsCotisations = pgTable(
  "cnps_cotisations",
  {
    id: serial("id").primaryKey(),
    contribuableId: integer("contribuable_id")
      .references(() => contribuables.id, { onDelete: "cascade" })
      .notNull(),
    periode: text("periode").notNull(), // "2026-01"
    masseSalariale: numeric("masse_salariale", { precision: 14, scale: 2 }),
    taux: numeric("taux", { precision: 5, scale: 2 }),
    montantEmployeur: numeric("montant_employeur", { precision: 14, scale: 2 }),
    montantSalarie: numeric("montant_salarie", { precision: 14, scale: 2 }),
    dateEcheance: date("date_echeance").notNull(),
    statut: statutDeclarationEnum("statut").default("A_FAIRE").notNull(),
    declarationId: integer("declaration_id").references(() => declarations.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cnps_ctb_periode_unique").on(t.contribuableId, t.periode),
    index("cnps_echeance_idx").on(t.dateEcheance),
  ],
);

// ---------------------------------------------------------------------------
// Coffre documentaire
// ---------------------------------------------------------------------------

export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    contribuableId: integer("contribuable_id")
      .references(() => contribuables.id, { onDelete: "cascade" })
      .notNull(),
    nomFichier: text("nom_fichier").notNull(),
    typeMime: text("type_mime"),
    taille: integer("taille"), // octets
    cheminStockage: text("chemin_stockage").notNull(), // chiffré au repos
    categorie: text("categorie"),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    version: integer("version").default(1).notNull(),
    parentDocumentId: integer("parent_document_id").references(
      (): AnyPgColumn => documents.id,
      { onDelete: "set null" },
    ),
    declarationId: integer("declaration_id").references(() => declarations.id, {
      onDelete: "set null",
    }),
    acfId: integer("acf_id").references(() => acfSuivis.id, {
      onDelete: "set null",
    }),
    uploadedBy: integer("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at"), // soft-delete
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("documents_contribuable_idx").on(t.contribuableId),
    index("documents_categorie_idx").on(t.categorie),
  ],
);

// ---------------------------------------------------------------------------
// Pénalités
// ---------------------------------------------------------------------------

export const penalites = pgTable(
  "penalites",
  {
    id: serial("id").primaryKey(),
    declarationId: integer("declaration_id")
      .references(() => declarations.id, { onDelete: "cascade" })
      .notNull(),
    montant: numeric("montant", { precision: 14, scale: 2 }).notNull(),
    baseCalcul: text("base_calcul"), // ex: "fixe:50000" ou "pct:0.10"
    statut: statutPenaliteEnum("statut").default("ESTIMEE").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("penalites_declaration_idx").on(t.declarationId)],
);

// ---------------------------------------------------------------------------
// Notifications & alertes
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    // NULL = notification diffusée (broadcast) à tous les utilisateurs.
    userId: integer("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    type: notificationTypeEnum("type").notNull(),
    canal: notificationCanalEnum("canal").default("DASHBOARD").notNull(),
    ressourceType: text("ressource_type"), // ex: "declaration", "acf"
    ressourceId: integer("ressource_id"),
    message: text("message").notNull(),
    lu: boolean("lu").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Facturation
// ---------------------------------------------------------------------------

export const statutFactureEnum = pgEnum("statut_facture", [
  "BROUILLON",
  "ENVOYEE",
  "PARTIELLE",
  "PAYEE",
  "EN_RETARD",
  "ANNULEE",
]);

/**
 * Nature d'une ligne de facture. Le cabinet refacture au client des sommes de
 * nature très différente : ses propres honoraires (soumis à TVA), les impôts et
 * cotisations qu'il reverse pour son compte, et des frais avancés. La catégorie
 * pilote le régime de TVA par défaut et le regroupement à l'impression.
 */
export const categorieLigneEnum = pgEnum("categorie_ligne", [
  "HONORAIRES",
  "IMPOT_TRESOR",
  "CNPS",
  "FRAIS",
  "AUTRE",
]);

export const modeReglementEnum = pgEnum("mode_reglement", [
  "ESPECES",
  "VIREMENT",
  "MOBILE_MONEY",
  "CHEQUE",
  "AUTRE",
]);

export const factures = pgTable(
  "factures",
  {
    id: serial("id").primaryKey(),
    numero: varchar("numero", { length: 30 }).notNull(),
    contribuableId: integer("contribuable_id")
      .references(() => contribuables.id, { onDelete: "restrict" })
      .notNull(),
    /** Période facturée : "2026-01" (mensuelle) ou "2026" (ponctuelle). */
    periode: varchar("periode", { length: 7 }).notNull(),
    objet: text("objet"),
    dateEmission: date("date_emission").notNull(),
    dateEcheance: date("date_echeance").notNull(),
    statut: statutFactureEnum("statut").default("BROUILLON").notNull(),
    totalHt: numeric("total_ht", { precision: 14, scale: 2 })
      .default("0")
      .notNull(),
    totalTva: numeric("total_tva", { precision: 14, scale: 2 })
      .default("0")
      .notNull(),
    totalTtc: numeric("total_ttc", { precision: 14, scale: 2 })
      .default("0")
      .notNull(),
    /** Cumul des règlements encaissés, entretenu à chaque paiement. */
    montantRegle: numeric("montant_regle", { precision: 14, scale: 2 })
      .default("0")
      .notNull(),
    /** Horodatage du premier envoi au contribuable (email / WhatsApp). */
    envoyeeLe: timestamp("envoyee_le"),
    /** Canaux ayant effectivement acheminé la facture. */
    canauxEnvoi: jsonb("canaux_envoi").$type<string[]>().default([]).notNull(),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("factures_numero_unique").on(t.numero),
    // Une seule facture par contribuable et par période : rend la génération
    // mensuelle automatique idempotente.
    uniqueIndex("factures_ctb_periode_unique").on(t.contribuableId, t.periode),
    index("factures_statut_idx").on(t.statut),
    index("factures_echeance_idx").on(t.dateEcheance),
  ],
);

export const factureLignes = pgTable(
  "facture_lignes",
  {
    id: serial("id").primaryKey(),
    factureId: integer("facture_id")
      .references(() => factures.id, { onDelete: "cascade" })
      .notNull(),
    categorie: categorieLigneEnum("categorie").default("HONORAIRES").notNull(),
    libelle: text("libelle").notNull(),
    montantHt: numeric("montant_ht", { precision: 14, scale: 2 }).notNull(),
    /** Taux de TVA en pourcentage (19.25 pour les honoraires, 0 pour un débours). */
    tauxTva: numeric("taux_tva", { precision: 5, scale: 2 })
      .default("0")
      .notNull(),
    /** Déclaration refacturée, quand la ligne provient d'une échéance fiscale. */
    declarationId: integer("declaration_id").references(() => declarations.id, {
      onDelete: "set null",
    }),
    ordre: integer("ordre").default(0).notNull(),
  },
  (t) => [index("facture_lignes_facture_idx").on(t.factureId)],
);

export const reglements = pgTable(
  "reglements",
  {
    id: serial("id").primaryKey(),
    factureId: integer("facture_id")
      .references(() => factures.id, { onDelete: "cascade" })
      .notNull(),
    date: date("date").notNull(),
    montant: numeric("montant", { precision: 14, scale: 2 }).notNull(),
    mode: modeReglementEnum("mode").default("VIREMENT").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("reglements_facture_idx").on(t.factureId)],
);

// ---------------------------------------------------------------------------
// Journal d'audit
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(), // CREATE / UPDATE / DELETE / LOGIN
    entite: text("entite").notNull(), // table concernée
    entiteId: integer("entite_id"),
    diff: jsonb("diff").$type<AuditDiff>(),
    ip: text("ip"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("audit_entite_idx").on(t.entite, t.entiteId),
    index("audit_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Paramètres du cabinet (clé/valeur)
// ---------------------------------------------------------------------------

export const parametres = pgTable("parametres", {
  id: serial("id").primaryKey(),
  cle: varchar("cle", { length: 100 }).notNull().unique(),
  valeur: jsonb("valeur"),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// COMPTABILITÉ GÉNÉRALE (E1) — tenue des livres des contribuables
//
// Tout ce domaine est préfixé `cpta_`. Le préfixe n'est pas cosmétique : il
// sépare sans ambiguïté possible la comptabilité DU CONTRIBUABLE de la
// facturation DU CABINET (`factures`, `facture_lignes`, `reglements`), qui sont
// deux objets sans rapport — numérotation, TVA et comptes différents.
//
// Le contribuable joue ici le rôle de société : c'est lui qui porte le plan
// comptable, les journaux, les exercices et les écritures.
//
// Les énumérations ci-dessous sont créées de zéro, ce que la production
// autorise. Aucune énumération existante n'est modifiée : `ALTER TYPE` est
// impossible sur ce serveur (voir docs/18-migration-production.md).
// ---------------------------------------------------------------------------

export const cptaStatutExerciceEnum = pgEnum("cpta_statut_exercice", [
  "OUVERT",
  "CLOS",
  "VERROUILLE",
]);

/** Système comptable SYSCOHADA retenu pour l'exercice. */
export const cptaSystemeEnum = pgEnum("cpta_systeme", [
  "NORMAL",
  "SMT", // Système minimal de trésorerie, réservé aux très petites entités.
]);

export const cptaTypeCompteEnum = pgEnum("cpta_type_compte", [
  "ACTIF",
  "PASSIF",
  "CHARGE",
  "PRODUIT",
]);

export const cptaTypeJournalEnum = pgEnum("cpta_type_journal", [
  "ACHAT",
  "VENTE",
  "BANQUE",
  "CAISSE",
  "DIVERS",
  "A_NOUVEAUX",
]);

export const cptaStatutEcritureEnum = pgEnum("cpta_statut_ecriture", [
  "BROUILLON",
  "VALIDEE",
  "CONTREPASSEE",
]);

/**
 * Module qui a produit l'écriture. Permet de remonter d'une ligne de grand
 * livre jusqu'à la pièce d'origine, conjointement avec `origine_id`.
 */
export const cptaOrigineEnum = pgEnum("cpta_origine", [
  "MANUELLE",
  "A_NOUVEAUX",
  "FACTURE_VENTE",
  "FACTURE_ACHAT",
  "REGLEMENT",
  "PAIE",
  "AMORTISSEMENT",
  "STOCK",
  "CLOTURE",
]);

export const cptaTypeTaxeEnum = pgEnum("cpta_type_taxe", [
  "TVA_COLLECTEE",
  "TVA_DEDUCTIBLE",
  "RETENUE",
  "ACOMPTE",
]);

/**
 * Exercice comptable d'un contribuable. Un exercice `CLOS` n'accepte plus de
 * saisie ; `VERROUILLE` interdit en plus toute réouverture par l'application.
 */
export const cptaExercices = pgTable(
  "cpta_exercices",
  {
    id: serial("id").primaryKey(),
    contribuableId: integer("contribuable_id")
      .references(() => contribuables.id, { onDelete: "restrict" })
      .notNull(),
    libelle: text("libelle").notNull(),
    dateDebut: date("date_debut").notNull(),
    dateFin: date("date_fin").notNull(),
    systeme: cptaSystemeEnum("systeme").default("NORMAL").notNull(),
    statut: cptaStatutExerciceEnum("statut").default("OUVERT").notNull(),
    /** Exercice dont proviennent les à-nouveaux. */
    exercicePrecedentId: integer("exercice_precedent_id").references(
      (): AnyPgColumn => cptaExercices.id,
      { onDelete: "set null" },
    ),
    clotureLe: timestamp("cloture_le"),
    cloturePar: integer("cloture_par").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cpta_exercices_ctb_libelle_unique").on(
      t.contribuableId,
      t.libelle,
    ),
    index("cpta_exercices_ctb_idx").on(t.contribuableId),
    check(
      "cpta_exercices_dates_check",
      sql`${t.dateFin} > ${t.dateDebut}`,
    ),
  ],
);

/**
 * Plan comptable du contribuable. Une copie du plan SYSCOHADA révisé de
 * référence est déposée à la création, puis personnalisable.
 */
export const cptaComptes = pgTable(
  "cpta_comptes",
  {
    id: serial("id").primaryKey(),
    contribuableId: integer("contribuable_id")
      .references(() => contribuables.id, { onDelete: "restrict" })
      .notNull(),
    numero: varchar("numero", { length: 20 }).notNull(),
    libelle: text("libelle").notNull(),
    /** Classe SYSCOHADA, de 1 à 9. */
    classe: integer("classe").notNull(),
    type: cptaTypeCompteEnum("type").notNull(),
    /** Compte collectif de tiers (401, 411…) : impose la saisie d'un tiers. */
    collectif: boolean("collectif").default(false).notNull(),
    lettrable: boolean("lettrable").default(false).notNull(),
    /** Compte de banque, susceptible d'être rapproché d'un relevé. */
    rapprochable: boolean("rapprochable").default(false).notNull(),
    actif: boolean("actif").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cpta_comptes_ctb_numero_unique").on(t.contribuableId, t.numero),
    index("cpta_comptes_classe_idx").on(t.contribuableId, t.classe),
    check(
      "cpta_comptes_classe_check",
      sql`${t.classe} >= 1 AND ${t.classe} <= 9`,
    ),
  ],
);

/** Journaux de saisie (achats, ventes, banque, caisse, OD, à-nouveaux). */
export const cptaJournaux = pgTable(
  "cpta_journaux",
  {
    id: serial("id").primaryKey(),
    contribuableId: integer("contribuable_id")
      .references(() => contribuables.id, { onDelete: "restrict" })
      .notNull(),
    code: varchar("code", { length: 10 }).notNull(),
    libelle: text("libelle").notNull(),
    type: cptaTypeJournalEnum("type").notNull(),
    /** Compte de contrepartie automatique, pour la banque et la caisse. */
    compteContrepartieId: integer("compte_contrepartie_id").references(
      () => cptaComptes.id,
      { onDelete: "set null" },
    ),
    actif: boolean("actif").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cpta_journaux_ctb_code_unique").on(t.contribuableId, t.code),
  ],
);

/**
 * Compteur de numérotation des pièces, par journal et par exercice.
 *
 * Volontairement une table, et non une séquence PostgreSQL : une séquence
 * consomme son numéro même lorsque la transaction est annulée, ce qui créerait
 * des trous. Or la numérotation comptable doit être continue. Le compteur est
 * donc incrémenté sous verrou, dans la transaction de validation.
 */
export const cptaSequences = pgTable(
  "cpta_sequences",
  {
    id: serial("id").primaryKey(),
    exerciceId: integer("exercice_id")
      .references(() => cptaExercices.id, { onDelete: "cascade" })
      .notNull(),
    journalId: integer("journal_id")
      .references(() => cptaJournaux.id, { onDelete: "cascade" })
      .notNull(),
    /** Préfixe apposé au numéro, ex. "VE2026-". */
    prefixe: varchar("prefixe", { length: 20 }).default("").notNull(),
    dernierNumero: integer("dernier_numero").default(0).notNull(),
  },
  (t) => [
    uniqueIndex("cpta_sequences_exercice_journal_unique").on(
      t.exerciceId,
      t.journalId,
    ),
  ],
);

/**
 * Clients, fournisseurs et salariés **du contribuable** — à ne pas confondre
 * avec les contribuables eux-mêmes, qui sont les clients du cabinet.
 */
export const cptaTiers = pgTable(
  "cpta_tiers",
  {
    id: serial("id").primaryKey(),
    contribuableId: integer("contribuable_id")
      .references(() => contribuables.id, { onDelete: "restrict" })
      .notNull(),
    code: varchar("code", { length: 30 }).notNull(),
    raisonSociale: text("raison_sociale").notNull(),
    /** Natures cumulables : ["CLIENT"], ["FOURNISSEUR"], ou les deux. */
    types: jsonb("types").$type<string[]>().default([]).notNull(),
    niu: varchar("niu", { length: 30 }),
    /** Compte auxiliaire de rattachement (411…, 401…). */
    compteId: integer("compte_id").references(() => cptaComptes.id, {
      onDelete: "set null",
    }),
    adresse: text("adresse"),
    telephone: text("telephone"),
    email: text("email"),
    actif: boolean("actif").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cpta_tiers_ctb_code_unique").on(t.contribuableId, t.code),
    index("cpta_tiers_niu_idx").on(t.niu),
  ],
);

/**
 * Taux de TVA, retenues et acomptes, **datés**.
 *
 * Un recalcul portant sur une période antérieure doit retenir le taux en
 * vigueur à la date de l'opération, et non le plus récent : c'est la raison
 * d'être de `valide_du` / `valide_au`. Aucun taux ne doit être écrit en dur
 * dans le code.
 */
export const cptaTaxes = pgTable(
  "cpta_taxes",
  {
    id: serial("id").primaryKey(),
    contribuableId: integer("contribuable_id")
      .references(() => contribuables.id, { onDelete: "restrict" })
      .notNull(),
    code: varchar("code", { length: 20 }).notNull(),
    libelle: text("libelle").notNull(),
    /** Taux en pourcentage, ex. 19.2500 pour la TVA camerounaise. */
    taux: numeric("taux", { precision: 7, scale: 4 }).notNull(),
    type: cptaTypeTaxeEnum("type").notNull(),
    compteId: integer("compte_id").references(() => cptaComptes.id, {
      onDelete: "set null",
    }),
    valideDu: date("valide_du").notNull(),
    /** NULL = toujours en vigueur. */
    valideAu: date("valide_au"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("cpta_taxes_ctb_code_idx").on(t.contribuableId, t.code),
    check("cpta_taxes_taux_check", sql`${t.taux} >= 0`),
    check(
      "cpta_taxes_periode_check",
      sql`${t.valideAu} IS NULL OR ${t.valideAu} >= ${t.valideDu}`,
    ),
  ],
);

/**
 * En-tête de pièce comptable.
 *
 * Une écriture `VALIDEE` est immuable : elle ne se modifie ni ne se supprime,
 * elle se contre-passe. Le numéro de pièce n'est attribué qu'à la validation,
 * pour que l'abandon d'un brouillon ne consomme aucun numéro.
 */
export const cptaEcritures = pgTable(
  "cpta_ecritures",
  {
    id: serial("id").primaryKey(),
    exerciceId: integer("exercice_id")
      .references(() => cptaExercices.id, { onDelete: "restrict" })
      .notNull(),
    journalId: integer("journal_id")
      .references(() => cptaJournaux.id, { onDelete: "restrict" })
      .notNull(),
    /** Attribué à la validation ; NULL tant que l'écriture est au brouillon. */
    numeroPiece: varchar("numero_piece", { length: 40 }),
    dateEcriture: date("date_ecriture").notNull(),
    libelle: text("libelle").notNull(),
    /** Référence externe : n° de facture du tiers, de chèque, de bordereau… */
    reference: text("reference"),
    statut: cptaStatutEcritureEnum("statut").default("BROUILLON").notNull(),
    origine: cptaOrigineEnum("origine").default("MANUELLE").notNull(),
    /** Identifiant de la pièce d'origine, dans le module désigné par `origine`. */
    origineId: integer("origine_id"),
    /** Écriture contre-passée par celle-ci. */
    contrepasseEcritureId: integer("contrepasse_ecriture_id").references(
      (): AnyPgColumn => cptaEcritures.id,
      { onDelete: "set null" },
    ),
    /** Justificatif rattaché, dans la GED existante. */
    documentId: integer("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    validePar: integer("valide_par").references(() => users.id, {
      onDelete: "set null",
    }),
    valideLe: timestamp("valide_le"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cpta_ecritures_exercice_numero_unique").on(
      t.exerciceId,
      t.numeroPiece,
    ),
    index("cpta_ecritures_exercice_date_idx").on(t.exerciceId, t.dateEcriture),
    index("cpta_ecritures_journal_idx").on(t.journalId),
    index("cpta_ecritures_origine_idx").on(t.origine, t.origineId),
    // Une écriture validée porte toujours un numéro de pièce et une date de
    // validation ; un brouillon n'en a jamais.
    check(
      "cpta_ecritures_validation_check",
      sql`(${t.statut} = 'BROUILLON' AND ${t.numeroPiece} IS NULL AND ${t.valideLe} IS NULL)
          OR (${t.statut} <> 'BROUILLON' AND ${t.numeroPiece} IS NOT NULL AND ${t.valideLe} IS NOT NULL)`,
    ),
  ],
);

/**
 * Ligne d'écriture. L'équilibre `Σ débit = Σ crédit` est vérifié à la
 * validation ; la contrainte ci-dessous garantit au moins qu'une ligne porte un
 * sens et un seul.
 */
export const cptaLignesEcriture = pgTable(
  "cpta_lignes_ecriture",
  {
    id: serial("id").primaryKey(),
    ecritureId: integer("ecriture_id")
      .references(() => cptaEcritures.id, { onDelete: "cascade" })
      .notNull(),
    ordre: integer("ordre").default(0).notNull(),
    compteId: integer("compte_id")
      .references(() => cptaComptes.id, { onDelete: "restrict" })
      .notNull(),
    /** Obligatoire dès lors que le compte est collectif. */
    tiersId: integer("tiers_id").references(() => cptaTiers.id, {
      onDelete: "restrict",
    }),
    libelle: text("libelle"),
    debit: numeric("debit", { precision: 14, scale: 2 }).default("0").notNull(),
    credit: numeric("credit", { precision: 14, scale: 2 })
      .default("0")
      .notNull(),
    /** Code de lettrage (A, B, AA…) ; NULL tant que la ligne n'est pas lettrée. */
    lettrage: varchar("lettrage", { length: 10 }),
    /** Échéance de règlement, qui alimente la balance âgée. */
    dateEcheance: date("date_echeance"),
  },
  (t) => [
    index("cpta_lignes_ecriture_idx").on(t.ecritureId),
    index("cpta_lignes_compte_idx").on(t.compteId),
    index("cpta_lignes_tiers_idx").on(t.tiersId),
    index("cpta_lignes_lettrage_idx").on(t.compteId, t.lettrage),
    // Un mouvement est soit un débit, soit un crédit — jamais les deux, jamais
    // aucun des deux, jamais négatif.
    check(
      "cpta_lignes_sens_check",
      sql`${t.debit} >= 0 AND ${t.credit} >= 0 AND (${t.debit} = 0) <> (${t.credit} = 0)`,
    ),
  ],
);

/** En-tête de lettrage : regroupe les lignes soldées d'un compte de tiers. */
export const cptaLettrages = pgTable(
  "cpta_lettrages",
  {
    id: serial("id").primaryKey(),
    compteId: integer("compte_id")
      .references(() => cptaComptes.id, { onDelete: "cascade" })
      .notNull(),
    tiersId: integer("tiers_id").references(() => cptaTiers.id, {
      onDelete: "set null",
    }),
    code: varchar("code", { length: 10 }).notNull(),
    dateLettrage: date("date_lettrage").notNull(),
    montant: numeric("montant", { precision: 14, scale: 2 }).notNull(),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("cpta_lettrages_compte_code_unique").on(t.compteId, t.code)],
);

/** Rapprochement d'un compte de banque avec un relevé. */
export const cptaRapprochements = pgTable(
  "cpta_rapprochements",
  {
    id: serial("id").primaryKey(),
    exerciceId: integer("exercice_id")
      .references(() => cptaExercices.id, { onDelete: "cascade" })
      .notNull(),
    compteId: integer("compte_id")
      .references(() => cptaComptes.id, { onDelete: "restrict" })
      .notNull(),
    dateRapprochement: date("date_rapprochement").notNull(),
    soldeReleve: numeric("solde_releve", { precision: 14, scale: 2 }).notNull(),
    soldeComptable: numeric("solde_comptable", {
      precision: 14,
      scale: 2,
    }).notNull(),
    /** Différence subsistant après pointage ; nulle, le rapprochement est juste. */
    ecart: numeric("ecart", { precision: 14, scale: 2 }).default("0").notNull(),
    cloture: boolean("cloture").default(false).notNull(),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("cpta_rapprochements_compte_idx").on(t.compteId, t.dateRapprochement),
  ],
);

/** Ligne pointée d'un rapprochement bancaire. */
export const cptaRapprochementLignes = pgTable(
  "cpta_rapprochement_lignes",
  {
    id: serial("id").primaryKey(),
    rapprochementId: integer("rapprochement_id")
      .references(() => cptaRapprochements.id, { onDelete: "cascade" })
      .notNull(),
    ligneEcritureId: integer("ligne_ecriture_id")
      .references(() => cptaLignesEcriture.id, { onDelete: "cascade" })
      .notNull(),
    pointeLe: timestamp("pointe_le").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cpta_rapprochement_lignes_unique").on(
      t.rapprochementId,
      t.ligneEcritureId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Pièces du contribuable (E3) — factures de vente et d'achat
//
// Une facture n'est pas seulement son écriture : elle a des lignes, une
// échéance, un règlement à suivre, et elle se relit après coup. L'écriture,
// elle, se retrouve par `origine` + `origine_id` — le lien est dans les deux
// sens.
//
// Aucun statut n'est stocké ici : celui de la comptabilisation se lit sur
// l'écriture liée, celui du règlement sur le lettrage de la ligne du tiers.
// Un statut recopié finirait par diverger de ce qu'il résume.
// ---------------------------------------------------------------------------

export const cptaTypePieceEnum = pgEnum("cpta_type_piece", [
  "FACTURE_VENTE",
  "FACTURE_ACHAT",
]);

export const cptaPieces = pgTable(
  "cpta_pieces",
  {
    id: serial("id").primaryKey(),
    contribuableId: integer("contribuable_id")
      .references(() => contribuables.id, { onDelete: "restrict" })
      .notNull(),
    exerciceId: integer("exercice_id")
      .references(() => cptaExercices.id, { onDelete: "restrict" })
      .notNull(),
    type: cptaTypePieceEnum("type").notNull(),
    /** Numéro de la facture, tel qu'il figure sur le document. */
    reference: varchar("reference", { length: 120 }),
    tiersId: integer("tiers_id")
      .references(() => cptaTiers.id, { onDelete: "restrict" })
      .notNull(),
    datePiece: date("date_piece").notNull(),
    dateEcheance: date("date_echeance"),
    totalHt: numeric("total_ht", { precision: 14, scale: 2 }).notNull(),
    totalTva: numeric("total_tva", { precision: 14, scale: 2 }).notNull(),
    totalTtc: numeric("total_ttc", { precision: 14, scale: 2 }).notNull(),
    /** Écriture générée. Nulle si elle a été supprimée au brouillon : la pièce reste, à recomptabiliser. */
    ecritureId: integer("ecriture_id").references(() => cptaEcritures.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("cpta_pieces_contribuable_idx").on(t.contribuableId, t.datePiece),
    index("cpta_pieces_exercice_idx").on(t.exerciceId, t.type),
    index("cpta_pieces_tiers_idx").on(t.tiersId),
  ],
);

export const cptaPieceLignes = pgTable(
  "cpta_piece_lignes",
  {
    id: serial("id").primaryKey(),
    pieceId: integer("piece_id")
      .references(() => cptaPieces.id, { onDelete: "cascade" })
      .notNull(),
    ordre: integer("ordre").notNull(),
    compteId: integer("compte_id")
      .references(() => cptaComptes.id, { onDelete: "restrict" })
      .notNull(),
    libelle: text("libelle"),
    montantHt: numeric("montant_ht", { precision: 14, scale: 2 }).notNull(),
    taxeId: integer("taxe_id").references(() => cptaTaxes.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("cpta_piece_lignes_piece_idx").on(t.pieceId, t.ordre)],
);

// ---------------------------------------------------------------------------
// PAIE (E4) — bulletins des salariés des contribuables
//
// Préfixe `paie_`. Le salarié est celui du contribuable, jamais du cabinet.
// Un bulletin est un document : ce qu'il porte est figé à sa validation,
// avec la version du barème qui l'a calculé. Rien ne se recalcule dans le
// dos d'un bulletin validé.
// ---------------------------------------------------------------------------

export const paieRegimeCnpsEnum = pgEnum("paie_regime_cnps", ["GENERAL", "AGRICOLE", "ENSEIGNEMENT"]);
export const paieGroupeRisqueEnum = pgEnum("paie_groupe_risque", ["A", "B", "C"]);
export const paieModePaiementEnum = pgEnum("paie_mode_paiement", ["VIREMENT", "CHEQUE", "ESPECES"]);
export const paieStatutPeriodeEnum = pgEnum("paie_statut_periode", ["BROUILLON", "VALIDEE"]);
export const paieTypeLigneEnum = pgEnum("paie_type_ligne", ["GAIN", "RETENUE", "EMPLOYEUR"]);

export const paieSalaries = pgTable(
  "paie_salaries",
  {
    id: serial("id").primaryKey(),
    contribuableId: integer("contribuable_id")
      .references(() => contribuables.id, { onDelete: "restrict" })
      .notNull(),
    matricule: varchar("matricule", { length: 30 }).notNull(),
    nom: text("nom").notNull(),
    prenoms: text("prenoms"),
    niu: varchar("niu", { length: 30 }),
    numeroCnps: varchar("numero_cnps", { length: 30 }),
    dateNaissance: date("date_naissance"),
    dateEmbauche: date("date_embauche").notNull(),
    /** Renseignée à la sortie : plus de bulletin après ce mois. */
    dateSortie: date("date_sortie"),
    poste: text("poste"),
    categorie: text("categorie"),
    echelon: text("echelon"),
    salaireBase: numeric("salaire_base", { precision: 14, scale: 2 }).notNull(),
    regimeCnps: paieRegimeCnpsEnum("regime_cnps").default("GENERAL").notNull(),
    groupeRisque: paieGroupeRisqueEnum("groupe_risque").default("A").notNull(),
    modePaiement: paieModePaiementEnum("mode_paiement").default("VIREMENT").notNull(),
    banque: text("banque"),
    /** Avantages en nature servis, évalués forfaitairement au barème. */
    avantagesNature: jsonb("avantages_nature").$type<string[]>().default([]).notNull(),
    /** Compte individuel du salarié dans les livres (tiers sur 422), créé à la première paie comptabilisée. */
    tiersId: integer("tiers_id").references(() => cptaTiers.id, { onDelete: "set null" }),
    actif: boolean("actif").default(true).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("paie_salaries_ctb_matricule_unique").on(t.contribuableId, t.matricule),
    index("paie_salaries_ctb_idx").on(t.contribuableId, t.actif),
  ],
);

/** Primes et indemnités fixes d'un salarié, reprises chaque mois. */
export const paieRubriquesFixes = pgTable(
  "paie_rubriques_fixes",
  {
    id: serial("id").primaryKey(),
    salarieId: integer("salarie_id")
      .references(() => paieSalaries.id, { onDelete: "cascade" })
      .notNull(),
    libelle: text("libelle").notNull(),
    montant: numeric("montant", { precision: 14, scale: 2 }).notNull(),
    cotisable: boolean("cotisable").default(true).notNull(),
    imposable: boolean("imposable").default(true).notNull(),
    ordre: integer("ordre").default(0).notNull(),
  },
  (t) => [index("paie_rubriques_fixes_salarie_idx").on(t.salarieId, t.ordre)],
);

/** Un mois de paie d'un contribuable. */
export const paiePeriodes = pgTable(
  "paie_periodes",
  {
    id: serial("id").primaryKey(),
    contribuableId: integer("contribuable_id")
      .references(() => contribuables.id, { onDelete: "restrict" })
      .notNull(),
    /** « AAAA-MM ». */
    periode: varchar("periode", { length: 7 }).notNull(),
    statut: paieStatutPeriodeEnum("statut").default("BROUILLON").notNull(),
    /** Version du barème qui a calculé les bulletins. */
    baremeValideDu: date("bareme_valide_du").notNull(),
    /** Écriture de paie générée à la validation, si le contribuable tient ses livres ici. */
    ecritureId: integer("ecriture_id").references(() => cptaEcritures.id, { onDelete: "set null" }),
    valideeLe: timestamp("validee_le"),
    valideePar: integer("validee_par").references(() => users.id, { onDelete: "set null" }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("paie_periodes_ctb_periode_unique").on(t.contribuableId, t.periode)],
);

export const paieBulletins = pgTable(
  "paie_bulletins",
  {
    id: serial("id").primaryKey(),
    periodeId: integer("periode_id")
      .references(() => paiePeriodes.id, { onDelete: "cascade" })
      .notNull(),
    salarieId: integer("salarie_id")
      .references(() => paieSalaries.id, { onDelete: "restrict" })
      .notNull(),
    /** Éléments du mois saisis : absences, heures sup, primes, acomptes… */
    elements: jsonb("elements").$type<Record<string, unknown>>().default({}).notNull(),
    // Ce que le salarié était ce mois-là, figé avec le bulletin.
    matricule: varchar("matricule", { length: 30 }).notNull(),
    nomComplet: text("nom_complet").notNull(),
    poste: text("poste"),
    categorie: text("categorie"),
    numeroCnps: varchar("numero_cnps", { length: 30 }),
    salaireBase: numeric("salaire_base", { precision: 14, scale: 2 }).notNull(),
    regimeCnps: paieRegimeCnpsEnum("regime_cnps").notNull(),
    groupeRisque: paieGroupeRisqueEnum("groupe_risque").notNull(),
    modePaiement: paieModePaiementEnum("mode_paiement").notNull(),
    // Totaux, en francs.
    brut: numeric("brut", { precision: 14, scale: 2 }).notNull(),
    brutCotisable: numeric("brut_cotisable", { precision: 14, scale: 2 }).notNull(),
    brutImposable: numeric("brut_imposable", { precision: 14, scale: 2 }).notNull(),
    cnpsSalarie: numeric("cnps_salarie", { precision: 14, scale: 2 }).notNull(),
    irpp: numeric("irpp", { precision: 14, scale: 2 }).notNull(),
    cac: numeric("cac", { precision: 14, scale: 2 }).notNull(),
    cfcSalarie: numeric("cfc_salarie", { precision: 14, scale: 2 }).notNull(),
    tdl: numeric("tdl", { precision: 14, scale: 2 }).notNull(),
    rav: numeric("rav", { precision: 14, scale: 2 }).notNull(),
    avances: numeric("avances", { precision: 14, scale: 2 }).notNull(),
    autresRetenues: numeric("autres_retenues", { precision: 14, scale: 2 }).notNull(),
    totalRetenues: numeric("total_retenues", { precision: 14, scale: 2 }).notNull(),
    netAPayer: numeric("net_a_payer", { precision: 14, scale: 2 }).notNull(),
    cnpsEmployeur: numeric("cnps_employeur", { precision: 14, scale: 2 }).notNull(),
    cfcEmployeur: numeric("cfc_employeur", { precision: 14, scale: 2 }).notNull(),
    fne: numeric("fne", { precision: 14, scale: 2 }).notNull(),
    chargesEmployeur: numeric("charges_employeur", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("paie_bulletins_periode_salarie_unique").on(t.periodeId, t.salarieId)],
);

export const paieBulletinLignes = pgTable(
  "paie_bulletin_lignes",
  {
    id: serial("id").primaryKey(),
    bulletinId: integer("bulletin_id")
      .references(() => paieBulletins.id, { onDelete: "cascade" })
      .notNull(),
    ordre: integer("ordre").notNull(),
    type: paieTypeLigneEnum("type").notNull(),
    code: varchar("code", { length: 30 }).notNull(),
    libelle: text("libelle").notNull(),
    base: numeric("base", { precision: 14, scale: 2 }),
    taux: numeric("taux", { precision: 7, scale: 4 }),
    montant: numeric("montant", { precision: 14, scale: 2 }).notNull(),
    enNature: boolean("en_nature").default(false).notNull(),
  },
  (t) => [index("paie_bulletin_lignes_bulletin_idx").on(t.bulletinId, t.ordre)],
);

// ---------------------------------------------------------------------------
// Relations (Drizzle Query API)
// ---------------------------------------------------------------------------

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  contribuables: many(contribuables),
  declarations: many(declarations),
  notifications: many(notifications),
  auditLogs: many(auditLog),
}));

export const contribuablesRelations = relations(
  contribuables,
  ({ one, many }) => ({
    responsable: one(users, {
      fields: [contribuables.responsableId],
      references: [users.id],
    }),
    declarations: many(declarations),
    acfSuivis: many(acfSuivis),
    cnpsCotisations: many(cnpsCotisations),
    documents: many(documents),
    factures: many(factures),
  }),
);

export const facturesRelations = relations(factures, ({ one, many }) => ({
  contribuable: one(contribuables, {
    fields: [factures.contribuableId],
    references: [contribuables.id],
  }),
  createur: one(users, {
    fields: [factures.createdBy],
    references: [users.id],
  }),
  lignes: many(factureLignes),
  reglements: many(reglements),
}));

export const factureLignesRelations = relations(factureLignes, ({ one }) => ({
  facture: one(factures, {
    fields: [factureLignes.factureId],
    references: [factures.id],
  }),
  declaration: one(declarations, {
    fields: [factureLignes.declarationId],
    references: [declarations.id],
  }),
}));

export const reglementsRelations = relations(reglements, ({ one }) => ({
  facture: one(factures, {
    fields: [reglements.factureId],
    references: [factures.id],
  }),
}));

export const declarationsRelations = relations(
  declarations,
  ({ one, many }) => ({
    contribuable: one(contribuables, {
      fields: [declarations.contribuableId],
      references: [contribuables.id],
    }),
    assignee: one(users, {
      fields: [declarations.assignedTo],
      references: [users.id],
    }),
    penalites: many(penalites),
  }),
);

export const acfSuivisRelations = relations(acfSuivis, ({ one }) => ({
  contribuable: one(contribuables, {
    fields: [acfSuivis.contribuableId],
    references: [contribuables.id],
  }),
}));

export const cnpsCotisationsRelations = relations(
  cnpsCotisations,
  ({ one }) => ({
    contribuable: one(contribuables, {
      fields: [cnpsCotisations.contribuableId],
      references: [contribuables.id],
    }),
    declaration: one(declarations, {
      fields: [cnpsCotisations.declarationId],
      references: [declarations.id],
    }),
  }),
);

export const documentsRelations = relations(documents, ({ one }) => ({
  contribuable: one(contribuables, {
    fields: [documents.contribuableId],
    references: [contribuables.id],
  }),
  uploadeur: one(users, {
    fields: [documents.uploadedBy],
    references: [users.id],
  }),
}));

export const penalitesRelations = relations(penalites, ({ one }) => ({
  declaration: one(declarations, {
    fields: [penalites.declarationId],
    references: [declarations.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, { fields: [auditLog.userId], references: [users.id] }),
}));

// ---------------------------------------------------------------------------
// Relations — comptabilité générale (E1)
// ---------------------------------------------------------------------------

export const cptaExercicesRelations = relations(
  cptaExercices,
  ({ one, many }) => ({
    contribuable: one(contribuables, {
      fields: [cptaExercices.contribuableId],
      references: [contribuables.id],
    }),
    exercicePrecedent: one(cptaExercices, {
      fields: [cptaExercices.exercicePrecedentId],
      references: [cptaExercices.id],
      relationName: "exercicePrecedent",
    }),
    ecritures: many(cptaEcritures),
    sequences: many(cptaSequences),
  }),
);

export const cptaComptesRelations = relations(cptaComptes, ({ one, many }) => ({
  contribuable: one(contribuables, {
    fields: [cptaComptes.contribuableId],
    references: [contribuables.id],
  }),
  lignes: many(cptaLignesEcriture),
  tiers: many(cptaTiers),
}));

export const cptaJournauxRelations = relations(
  cptaJournaux,
  ({ one, many }) => ({
    contribuable: one(contribuables, {
      fields: [cptaJournaux.contribuableId],
      references: [contribuables.id],
    }),
    compteContrepartie: one(cptaComptes, {
      fields: [cptaJournaux.compteContrepartieId],
      references: [cptaComptes.id],
    }),
    ecritures: many(cptaEcritures),
  }),
);

export const cptaSequencesRelations = relations(cptaSequences, ({ one }) => ({
  exercice: one(cptaExercices, {
    fields: [cptaSequences.exerciceId],
    references: [cptaExercices.id],
  }),
  journal: one(cptaJournaux, {
    fields: [cptaSequences.journalId],
    references: [cptaJournaux.id],
  }),
}));

export const cptaTiersRelations = relations(cptaTiers, ({ one, many }) => ({
  contribuable: one(contribuables, {
    fields: [cptaTiers.contribuableId],
    references: [contribuables.id],
  }),
  compte: one(cptaComptes, {
    fields: [cptaTiers.compteId],
    references: [cptaComptes.id],
  }),
  lignes: many(cptaLignesEcriture),
}));

export const cptaTaxesRelations = relations(cptaTaxes, ({ one }) => ({
  contribuable: one(contribuables, {
    fields: [cptaTaxes.contribuableId],
    references: [contribuables.id],
  }),
  compte: one(cptaComptes, {
    fields: [cptaTaxes.compteId],
    references: [cptaComptes.id],
  }),
}));

export const cptaEcrituresRelations = relations(
  cptaEcritures,
  ({ one, many }) => ({
    exercice: one(cptaExercices, {
      fields: [cptaEcritures.exerciceId],
      references: [cptaExercices.id],
    }),
    journal: one(cptaJournaux, {
      fields: [cptaEcritures.journalId],
      references: [cptaJournaux.id],
    }),
    contrepasse: one(cptaEcritures, {
      fields: [cptaEcritures.contrepasseEcritureId],
      references: [cptaEcritures.id],
      relationName: "contrepasse",
    }),
    justificatif: one(documents, {
      fields: [cptaEcritures.documentId],
      references: [documents.id],
    }),
    createur: one(users, {
      fields: [cptaEcritures.createdBy],
      references: [users.id],
    }),
    lignes: many(cptaLignesEcriture),
  }),
);

export const cptaLignesEcritureRelations = relations(
  cptaLignesEcriture,
  ({ one }) => ({
    ecriture: one(cptaEcritures, {
      fields: [cptaLignesEcriture.ecritureId],
      references: [cptaEcritures.id],
    }),
    compte: one(cptaComptes, {
      fields: [cptaLignesEcriture.compteId],
      references: [cptaComptes.id],
    }),
    tiers: one(cptaTiers, {
      fields: [cptaLignesEcriture.tiersId],
      references: [cptaTiers.id],
    }),
  }),
);

export const cptaLettragesRelations = relations(cptaLettrages, ({ one }) => ({
  compte: one(cptaComptes, {
    fields: [cptaLettrages.compteId],
    references: [cptaComptes.id],
  }),
  tiers: one(cptaTiers, {
    fields: [cptaLettrages.tiersId],
    references: [cptaTiers.id],
  }),
}));

export const cptaRapprochementsRelations = relations(
  cptaRapprochements,
  ({ one, many }) => ({
    exercice: one(cptaExercices, {
      fields: [cptaRapprochements.exerciceId],
      references: [cptaExercices.id],
    }),
    compte: one(cptaComptes, {
      fields: [cptaRapprochements.compteId],
      references: [cptaComptes.id],
    }),
    lignes: many(cptaRapprochementLignes),
  }),
);

export const cptaRapprochementLignesRelations = relations(
  cptaRapprochementLignes,
  ({ one }) => ({
    rapprochement: one(cptaRapprochements, {
      fields: [cptaRapprochementLignes.rapprochementId],
      references: [cptaRapprochements.id],
    }),
    ligneEcriture: one(cptaLignesEcriture, {
      fields: [cptaRapprochementLignes.ligneEcritureId],
      references: [cptaLignesEcriture.id],
    }),
  }),
);

export const cptaPiecesRelations = relations(cptaPieces, ({ one, many }) => ({
  contribuable: one(contribuables, {
    fields: [cptaPieces.contribuableId],
    references: [contribuables.id],
  }),
  exercice: one(cptaExercices, {
    fields: [cptaPieces.exerciceId],
    references: [cptaExercices.id],
  }),
  tiers: one(cptaTiers, { fields: [cptaPieces.tiersId], references: [cptaTiers.id] }),
  ecriture: one(cptaEcritures, {
    fields: [cptaPieces.ecritureId],
    references: [cptaEcritures.id],
  }),
  lignes: many(cptaPieceLignes),
}));

export const cptaPieceLignesRelations = relations(cptaPieceLignes, ({ one }) => ({
  piece: one(cptaPieces, { fields: [cptaPieceLignes.pieceId], references: [cptaPieces.id] }),
  compte: one(cptaComptes, { fields: [cptaPieceLignes.compteId], references: [cptaComptes.id] }),
  taxe: one(cptaTaxes, { fields: [cptaPieceLignes.taxeId], references: [cptaTaxes.id] }),
}));

export const paieSalariesRelations = relations(paieSalaries, ({ one, many }) => ({
  contribuable: one(contribuables, { fields: [paieSalaries.contribuableId], references: [contribuables.id] }),
  tiers: one(cptaTiers, { fields: [paieSalaries.tiersId], references: [cptaTiers.id] }),
  rubriquesFixes: many(paieRubriquesFixes),
  bulletins: many(paieBulletins),
}));

export const paieRubriquesFixesRelations = relations(paieRubriquesFixes, ({ one }) => ({
  salarie: one(paieSalaries, { fields: [paieRubriquesFixes.salarieId], references: [paieSalaries.id] }),
}));

export const paiePeriodesRelations = relations(paiePeriodes, ({ one, many }) => ({
  contribuable: one(contribuables, { fields: [paiePeriodes.contribuableId], references: [contribuables.id] }),
  ecriture: one(cptaEcritures, { fields: [paiePeriodes.ecritureId], references: [cptaEcritures.id] }),
  bulletins: many(paieBulletins),
}));

export const paieBulletinsRelations = relations(paieBulletins, ({ one, many }) => ({
  periode: one(paiePeriodes, { fields: [paieBulletins.periodeId], references: [paiePeriodes.id] }),
  salarie: one(paieSalaries, { fields: [paieBulletins.salarieId], references: [paieSalaries.id] }),
  lignes: many(paieBulletinLignes),
}));

export const paieBulletinLignesRelations = relations(paieBulletinLignes, ({ one }) => ({
  bulletin: one(paieBulletins, { fields: [paieBulletinLignes.bulletinId], references: [paieBulletins.id] }),
}));
