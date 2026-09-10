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
