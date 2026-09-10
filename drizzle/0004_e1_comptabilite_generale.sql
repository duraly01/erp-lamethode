CREATE TYPE "public"."cpta_origine" AS ENUM('MANUELLE', 'A_NOUVEAUX', 'FACTURE_VENTE', 'FACTURE_ACHAT', 'REGLEMENT', 'PAIE', 'AMORTISSEMENT', 'STOCK', 'CLOTURE');--> statement-breakpoint
CREATE TYPE "public"."cpta_statut_ecriture" AS ENUM('BROUILLON', 'VALIDEE', 'CONTREPASSEE');--> statement-breakpoint
CREATE TYPE "public"."cpta_statut_exercice" AS ENUM('OUVERT', 'CLOS', 'VERROUILLE');--> statement-breakpoint
CREATE TYPE "public"."cpta_systeme" AS ENUM('NORMAL', 'SMT');--> statement-breakpoint
CREATE TYPE "public"."cpta_type_compte" AS ENUM('ACTIF', 'PASSIF', 'CHARGE', 'PRODUIT');--> statement-breakpoint
CREATE TYPE "public"."cpta_type_journal" AS ENUM('ACHAT', 'VENTE', 'BANQUE', 'CAISSE', 'DIVERS', 'A_NOUVEAUX');--> statement-breakpoint
CREATE TYPE "public"."cpta_type_taxe" AS ENUM('TVA_COLLECTEE', 'TVA_DEDUCTIBLE', 'RETENUE', 'ACOMPTE');--> statement-breakpoint
CREATE TABLE "cpta_comptes" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"numero" varchar(20) NOT NULL,
	"libelle" text NOT NULL,
	"classe" integer NOT NULL,
	"type" "cpta_type_compte" NOT NULL,
	"collectif" boolean DEFAULT false NOT NULL,
	"lettrable" boolean DEFAULT false NOT NULL,
	"rapprochable" boolean DEFAULT false NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cpta_comptes_classe_check" CHECK ("cpta_comptes"."classe" >= 1 AND "cpta_comptes"."classe" <= 9)
);
--> statement-breakpoint
CREATE TABLE "cpta_ecritures" (
	"id" serial PRIMARY KEY NOT NULL,
	"exercice_id" integer NOT NULL,
	"journal_id" integer NOT NULL,
	"numero_piece" varchar(40),
	"date_ecriture" date NOT NULL,
	"libelle" text NOT NULL,
	"reference" text,
	"statut" "cpta_statut_ecriture" DEFAULT 'BROUILLON' NOT NULL,
	"origine" "cpta_origine" DEFAULT 'MANUELLE' NOT NULL,
	"origine_id" integer,
	"contrepasse_ecriture_id" integer,
	"document_id" integer,
	"created_by" integer,
	"valide_par" integer,
	"valide_le" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cpta_ecritures_validation_check" CHECK (("cpta_ecritures"."statut" = 'BROUILLON' AND "cpta_ecritures"."numero_piece" IS NULL AND "cpta_ecritures"."valide_le" IS NULL)
          OR ("cpta_ecritures"."statut" <> 'BROUILLON' AND "cpta_ecritures"."numero_piece" IS NOT NULL AND "cpta_ecritures"."valide_le" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cpta_exercices" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"libelle" text NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"systeme" "cpta_systeme" DEFAULT 'NORMAL' NOT NULL,
	"statut" "cpta_statut_exercice" DEFAULT 'OUVERT' NOT NULL,
	"exercice_precedent_id" integer,
	"cloture_le" timestamp,
	"cloture_par" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cpta_exercices_dates_check" CHECK ("cpta_exercices"."date_fin" > "cpta_exercices"."date_debut")
);
--> statement-breakpoint
CREATE TABLE "cpta_journaux" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"code" varchar(10) NOT NULL,
	"libelle" text NOT NULL,
	"type" "cpta_type_journal" NOT NULL,
	"compte_contrepartie_id" integer,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cpta_lettrages" (
	"id" serial PRIMARY KEY NOT NULL,
	"compte_id" integer NOT NULL,
	"tiers_id" integer,
	"code" varchar(10) NOT NULL,
	"date_lettrage" date NOT NULL,
	"montant" numeric(14, 2) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cpta_lignes_ecriture" (
	"id" serial PRIMARY KEY NOT NULL,
	"ecriture_id" integer NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	"compte_id" integer NOT NULL,
	"tiers_id" integer,
	"libelle" text,
	"debit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"lettrage" varchar(10),
	"date_echeance" date,
	CONSTRAINT "cpta_lignes_sens_check" CHECK ("cpta_lignes_ecriture"."debit" >= 0 AND "cpta_lignes_ecriture"."credit" >= 0 AND ("cpta_lignes_ecriture"."debit" = 0) <> ("cpta_lignes_ecriture"."credit" = 0))
);
--> statement-breakpoint
CREATE TABLE "cpta_rapprochement_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"rapprochement_id" integer NOT NULL,
	"ligne_ecriture_id" integer NOT NULL,
	"pointe_le" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cpta_rapprochements" (
	"id" serial PRIMARY KEY NOT NULL,
	"exercice_id" integer NOT NULL,
	"compte_id" integer NOT NULL,
	"date_rapprochement" date NOT NULL,
	"solde_releve" numeric(14, 2) NOT NULL,
	"solde_comptable" numeric(14, 2) NOT NULL,
	"ecart" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cloture" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cpta_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"exercice_id" integer NOT NULL,
	"journal_id" integer NOT NULL,
	"prefixe" varchar(20) DEFAULT '' NOT NULL,
	"dernier_numero" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cpta_taxes" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"code" varchar(20) NOT NULL,
	"libelle" text NOT NULL,
	"taux" numeric(7, 4) NOT NULL,
	"type" "cpta_type_taxe" NOT NULL,
	"compte_id" integer,
	"valide_du" date NOT NULL,
	"valide_au" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cpta_taxes_taux_check" CHECK ("cpta_taxes"."taux" >= 0),
	CONSTRAINT "cpta_taxes_periode_check" CHECK ("cpta_taxes"."valide_au" IS NULL OR "cpta_taxes"."valide_au" >= "cpta_taxes"."valide_du")
);
--> statement-breakpoint
CREATE TABLE "cpta_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"code" varchar(30) NOT NULL,
	"raison_sociale" text NOT NULL,
	"types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"niu" varchar(30),
	"compte_id" integer,
	"adresse" text,
	"telephone" text,
	"email" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cpta_comptes" ADD CONSTRAINT "cpta_comptes_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_ecritures" ADD CONSTRAINT "cpta_ecritures_exercice_id_cpta_exercices_id_fk" FOREIGN KEY ("exercice_id") REFERENCES "public"."cpta_exercices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_ecritures" ADD CONSTRAINT "cpta_ecritures_journal_id_cpta_journaux_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."cpta_journaux"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_ecritures" ADD CONSTRAINT "cpta_ecritures_contrepasse_ecriture_id_cpta_ecritures_id_fk" FOREIGN KEY ("contrepasse_ecriture_id") REFERENCES "public"."cpta_ecritures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_ecritures" ADD CONSTRAINT "cpta_ecritures_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_ecritures" ADD CONSTRAINT "cpta_ecritures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_ecritures" ADD CONSTRAINT "cpta_ecritures_valide_par_users_id_fk" FOREIGN KEY ("valide_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_exercices" ADD CONSTRAINT "cpta_exercices_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_exercices" ADD CONSTRAINT "cpta_exercices_exercice_precedent_id_cpta_exercices_id_fk" FOREIGN KEY ("exercice_precedent_id") REFERENCES "public"."cpta_exercices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_exercices" ADD CONSTRAINT "cpta_exercices_cloture_par_users_id_fk" FOREIGN KEY ("cloture_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_journaux" ADD CONSTRAINT "cpta_journaux_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_journaux" ADD CONSTRAINT "cpta_journaux_compte_contrepartie_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_contrepartie_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_lettrages" ADD CONSTRAINT "cpta_lettrages_compte_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_lettrages" ADD CONSTRAINT "cpta_lettrages_tiers_id_cpta_tiers_id_fk" FOREIGN KEY ("tiers_id") REFERENCES "public"."cpta_tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_lettrages" ADD CONSTRAINT "cpta_lettrages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_lignes_ecriture" ADD CONSTRAINT "cpta_lignes_ecriture_ecriture_id_cpta_ecritures_id_fk" FOREIGN KEY ("ecriture_id") REFERENCES "public"."cpta_ecritures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_lignes_ecriture" ADD CONSTRAINT "cpta_lignes_ecriture_compte_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_lignes_ecriture" ADD CONSTRAINT "cpta_lignes_ecriture_tiers_id_cpta_tiers_id_fk" FOREIGN KEY ("tiers_id") REFERENCES "public"."cpta_tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_rapprochement_lignes" ADD CONSTRAINT "cpta_rapprochement_lignes_rapprochement_id_cpta_rapprochements_id_fk" FOREIGN KEY ("rapprochement_id") REFERENCES "public"."cpta_rapprochements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_rapprochement_lignes" ADD CONSTRAINT "cpta_rapprochement_lignes_ligne_ecriture_id_cpta_lignes_ecriture_id_fk" FOREIGN KEY ("ligne_ecriture_id") REFERENCES "public"."cpta_lignes_ecriture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_rapprochements" ADD CONSTRAINT "cpta_rapprochements_exercice_id_cpta_exercices_id_fk" FOREIGN KEY ("exercice_id") REFERENCES "public"."cpta_exercices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_rapprochements" ADD CONSTRAINT "cpta_rapprochements_compte_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_rapprochements" ADD CONSTRAINT "cpta_rapprochements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_sequences" ADD CONSTRAINT "cpta_sequences_exercice_id_cpta_exercices_id_fk" FOREIGN KEY ("exercice_id") REFERENCES "public"."cpta_exercices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_sequences" ADD CONSTRAINT "cpta_sequences_journal_id_cpta_journaux_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."cpta_journaux"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_taxes" ADD CONSTRAINT "cpta_taxes_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_taxes" ADD CONSTRAINT "cpta_taxes_compte_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_tiers" ADD CONSTRAINT "cpta_tiers_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_tiers" ADD CONSTRAINT "cpta_tiers_compte_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cpta_comptes_ctb_numero_unique" ON "cpta_comptes" USING btree ("contribuable_id","numero");--> statement-breakpoint
CREATE INDEX "cpta_comptes_classe_idx" ON "cpta_comptes" USING btree ("contribuable_id","classe");--> statement-breakpoint
CREATE UNIQUE INDEX "cpta_ecritures_exercice_numero_unique" ON "cpta_ecritures" USING btree ("exercice_id","numero_piece");--> statement-breakpoint
CREATE INDEX "cpta_ecritures_exercice_date_idx" ON "cpta_ecritures" USING btree ("exercice_id","date_ecriture");--> statement-breakpoint
CREATE INDEX "cpta_ecritures_journal_idx" ON "cpta_ecritures" USING btree ("journal_id");--> statement-breakpoint
CREATE INDEX "cpta_ecritures_origine_idx" ON "cpta_ecritures" USING btree ("origine","origine_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cpta_exercices_ctb_libelle_unique" ON "cpta_exercices" USING btree ("contribuable_id","libelle");--> statement-breakpoint
CREATE INDEX "cpta_exercices_ctb_idx" ON "cpta_exercices" USING btree ("contribuable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cpta_journaux_ctb_code_unique" ON "cpta_journaux" USING btree ("contribuable_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "cpta_lettrages_compte_code_unique" ON "cpta_lettrages" USING btree ("compte_id","code");--> statement-breakpoint
CREATE INDEX "cpta_lignes_ecriture_idx" ON "cpta_lignes_ecriture" USING btree ("ecriture_id");--> statement-breakpoint
CREATE INDEX "cpta_lignes_compte_idx" ON "cpta_lignes_ecriture" USING btree ("compte_id");--> statement-breakpoint
CREATE INDEX "cpta_lignes_tiers_idx" ON "cpta_lignes_ecriture" USING btree ("tiers_id");--> statement-breakpoint
CREATE INDEX "cpta_lignes_lettrage_idx" ON "cpta_lignes_ecriture" USING btree ("compte_id","lettrage");--> statement-breakpoint
CREATE UNIQUE INDEX "cpta_rapprochement_lignes_unique" ON "cpta_rapprochement_lignes" USING btree ("rapprochement_id","ligne_ecriture_id");--> statement-breakpoint
CREATE INDEX "cpta_rapprochements_compte_idx" ON "cpta_rapprochements" USING btree ("compte_id","date_rapprochement");--> statement-breakpoint
CREATE UNIQUE INDEX "cpta_sequences_exercice_journal_unique" ON "cpta_sequences" USING btree ("exercice_id","journal_id");--> statement-breakpoint
CREATE INDEX "cpta_taxes_ctb_code_idx" ON "cpta_taxes" USING btree ("contribuable_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "cpta_tiers_ctb_code_unique" ON "cpta_tiers" USING btree ("contribuable_id","code");--> statement-breakpoint
CREATE INDEX "cpta_tiers_niu_idx" ON "cpta_tiers" USING btree ("niu");