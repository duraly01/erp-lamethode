CREATE TYPE "public"."declaration_type" AS ENUM('DSF', 'SOLDE_DSF', 'IRPP', 'BEF', 'BAIL', 'PRECOMPTE_LOYER', 'TVA', 'ACOMPTE_IS', 'CNPS', 'PATENTE', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."notification_canal" AS ENUM('DASHBOARD', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('RAPPEL', 'ALERTE', 'INFO');--> statement-breakpoint
CREATE TYPE "public"."periodicite" AS ENUM('MENSUELLE', 'ANNUELLE');--> statement-breakpoint
CREATE TYPE "public"."regime_fiscal" AS ENUM('REEL', 'SIMPLIFIE', 'IFU');--> statement-breakpoint
CREATE TYPE "public"."role_nom" AS ENUM('ADMIN', 'MANAGER', 'COLLABORATEUR', 'LECTURE');--> statement-breakpoint
CREATE TYPE "public"."statut_acf" AS ENUM('EN_COURS', 'BLOQUE', 'DELIVRE', 'REJETE');--> statement-breakpoint
CREATE TYPE "public"."statut_declaration" AS ENUM('A_FAIRE', 'DEPOSEE', 'PAYEE', 'EN_RETARD', 'EXONERE');--> statement-breakpoint
CREATE TYPE "public"."statut_penalite" AS ENUM('ESTIMEE', 'CONFIRMEE', 'ANNULEE');--> statement-breakpoint
CREATE TABLE "acf_suivis" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"objet" text NOT NULL,
	"date_demande" date NOT NULL,
	"statut" "statut_acf" DEFAULT 'EN_COURS' NOT NULL,
	"motif_blocage" text,
	"solution" text,
	"date_resolution" date,
	"date_validite" date,
	"responsable" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"entite" text NOT NULL,
	"entite_id" integer,
	"diff" jsonb,
	"ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cnps_cotisations" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"periode" text NOT NULL,
	"masse_salariale" numeric(14, 2),
	"taux" numeric(5, 2),
	"montant_employeur" numeric(14, 2),
	"montant_salarie" numeric(14, 2),
	"date_echeance" date NOT NULL,
	"statut" "statut_declaration" DEFAULT 'A_FAIRE' NOT NULL,
	"declaration_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contribuables" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"niu" varchar(30),
	"centre_impots" text,
	"regime_fiscal" "regime_fiscal" DEFAULT 'REEL' NOT NULL,
	"secteur_activite" text,
	"telephone" text,
	"email" text,
	"responsable_dossier" text,
	"responsable_id" integer,
	"date_debut_mission" date,
	"actif" boolean DEFAULT true NOT NULL,
	"notes" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "declarations" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"type" "declaration_type" NOT NULL,
	"periodicite" "periodicite" NOT NULL,
	"periode" text NOT NULL,
	"date_echeance" date NOT NULL,
	"statut" "statut_declaration" DEFAULT 'A_FAIRE' NOT NULL,
	"date_depot" date,
	"date_paiement" date,
	"montant" numeric(14, 2),
	"assigned_to" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"nom_fichier" text NOT NULL,
	"type_mime" text,
	"taille" integer,
	"chemin_stockage" text NOT NULL,
	"categorie" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_document_id" integer,
	"declaration_id" integer,
	"acf_id" integer,
	"uploaded_by" integer,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"type" "notification_type" NOT NULL,
	"canal" "notification_canal" DEFAULT 'DASHBOARD' NOT NULL,
	"ressource_type" text,
	"ressource_id" integer,
	"message" text NOT NULL,
	"lu" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parametres" (
	"id" serial PRIMARY KEY NOT NULL,
	"cle" varchar(100) NOT NULL,
	"valeur" jsonb,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parametres_cle_unique" UNIQUE("cle")
);
--> statement-breakpoint
CREATE TABLE "penalites" (
	"id" serial PRIMARY KEY NOT NULL,
	"declaration_id" integer NOT NULL,
	"montant" numeric(14, 2) NOT NULL,
	"base_calcul" text,
	"statut" "statut_penalite" DEFAULT 'ESTIMEE' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" "role_nom" NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "roles_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text,
	"role_id" integer,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acf_suivis" ADD CONSTRAINT "acf_suivis_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnps_cotisations" ADD CONSTRAINT "cnps_cotisations_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cnps_cotisations" ADD CONSTRAINT "cnps_cotisations_declaration_id_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."declarations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribuables" ADD CONSTRAINT "contribuables_responsable_id_users_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_parent_document_id_documents_id_fk" FOREIGN KEY ("parent_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_declaration_id_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."declarations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_acf_id_acf_suivis_id_fk" FOREIGN KEY ("acf_id") REFERENCES "public"."acf_suivis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalites" ADD CONSTRAINT "penalites_declaration_id_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."declarations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acf_contribuable_idx" ON "acf_suivis" USING btree ("contribuable_id");--> statement-breakpoint
CREATE INDEX "acf_statut_idx" ON "acf_suivis" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "audit_entite_idx" ON "audit_log" USING btree ("entite","entite_id");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cnps_ctb_periode_unique" ON "cnps_cotisations" USING btree ("contribuable_id","periode");--> statement-breakpoint
CREATE INDEX "cnps_echeance_idx" ON "cnps_cotisations" USING btree ("date_echeance");--> statement-breakpoint
CREATE INDEX "contribuables_niu_idx" ON "contribuables" USING btree ("niu");--> statement-breakpoint
CREATE INDEX "contribuables_responsable_idx" ON "contribuables" USING btree ("responsable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "declarations_ctb_type_periode_unique" ON "declarations" USING btree ("contribuable_id","type","periode");--> statement-breakpoint
CREATE INDEX "declarations_contribuable_idx" ON "declarations" USING btree ("contribuable_id");--> statement-breakpoint
CREATE INDEX "declarations_echeance_idx" ON "declarations" USING btree ("date_echeance");--> statement-breakpoint
CREATE INDEX "declarations_statut_idx" ON "declarations" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "declarations_assigned_idx" ON "declarations" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "documents_contribuable_idx" ON "documents" USING btree ("contribuable_id");--> statement-breakpoint
CREATE INDEX "documents_categorie_idx" ON "documents" USING btree ("categorie");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "penalites_declaration_idx" ON "penalites" USING btree ("declaration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");