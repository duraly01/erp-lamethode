CREATE TYPE "public"."cpta_mode_amortissement" AS ENUM('LINEAIRE', 'DEGRESSIF');--> statement-breakpoint
CREATE TYPE "public"."cpta_statut_immobilisation" AS ENUM('EN_SERVICE', 'CEDEE', 'REBUT');--> statement-breakpoint
CREATE TABLE "cpta_dotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"immobilisation_id" integer NOT NULL,
	"exercice_id" integer NOT NULL,
	"montant" numeric(14, 2) NOT NULL,
	"ecriture_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cpta_immobilisations" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"code" varchar(30) NOT NULL,
	"libelle" text NOT NULL,
	"description" text,
	"compte_id" integer NOT NULL,
	"compte_amortissement_id" integer,
	"compte_dotation_id" integer,
	"date_acquisition" date NOT NULL,
	"date_mise_en_service" date NOT NULL,
	"valeur_origine" numeric(14, 2) NOT NULL,
	"valeur_residuelle" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"mode" "cpta_mode_amortissement" DEFAULT 'LINEAIRE' NOT NULL,
	"duree_mois" integer,
	"fournisseur_id" integer,
	"piece_id" integer,
	"reference_facture" varchar(120),
	"statut" "cpta_statut_immobilisation" DEFAULT 'EN_SERVICE' NOT NULL,
	"date_sortie" date,
	"prix_cession" numeric(14, 2),
	"ecriture_sortie_id" integer,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cpta_dotations" ADD CONSTRAINT "cpta_dotations_immobilisation_id_cpta_immobilisations_id_fk" FOREIGN KEY ("immobilisation_id") REFERENCES "public"."cpta_immobilisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_dotations" ADD CONSTRAINT "cpta_dotations_exercice_id_cpta_exercices_id_fk" FOREIGN KEY ("exercice_id") REFERENCES "public"."cpta_exercices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_dotations" ADD CONSTRAINT "cpta_dotations_ecriture_id_cpta_ecritures_id_fk" FOREIGN KEY ("ecriture_id") REFERENCES "public"."cpta_ecritures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_immobilisations" ADD CONSTRAINT "cpta_immobilisations_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_immobilisations" ADD CONSTRAINT "cpta_immobilisations_compte_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_immobilisations" ADD CONSTRAINT "cpta_immobilisations_compte_amortissement_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_amortissement_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_immobilisations" ADD CONSTRAINT "cpta_immobilisations_compte_dotation_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_dotation_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_immobilisations" ADD CONSTRAINT "cpta_immobilisations_fournisseur_id_cpta_tiers_id_fk" FOREIGN KEY ("fournisseur_id") REFERENCES "public"."cpta_tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_immobilisations" ADD CONSTRAINT "cpta_immobilisations_piece_id_cpta_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."cpta_pieces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_immobilisations" ADD CONSTRAINT "cpta_immobilisations_ecriture_sortie_id_cpta_ecritures_id_fk" FOREIGN KEY ("ecriture_sortie_id") REFERENCES "public"."cpta_ecritures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_immobilisations" ADD CONSTRAINT "cpta_immobilisations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cpta_dotations_immo_exercice_unique" ON "cpta_dotations" USING btree ("immobilisation_id","exercice_id");--> statement-breakpoint
CREATE INDEX "cpta_dotations_exercice_idx" ON "cpta_dotations" USING btree ("exercice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cpta_immobilisations_ctb_code_unique" ON "cpta_immobilisations" USING btree ("contribuable_id","code");--> statement-breakpoint
CREATE INDEX "cpta_immobilisations_ctb_idx" ON "cpta_immobilisations" USING btree ("contribuable_id","statut");