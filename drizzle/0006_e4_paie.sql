CREATE TYPE "public"."paie_groupe_risque" AS ENUM('A', 'B', 'C');--> statement-breakpoint
CREATE TYPE "public"."paie_mode_paiement" AS ENUM('VIREMENT', 'CHEQUE', 'ESPECES');--> statement-breakpoint
CREATE TYPE "public"."paie_regime_cnps" AS ENUM('GENERAL', 'AGRICOLE', 'ENSEIGNEMENT');--> statement-breakpoint
CREATE TYPE "public"."paie_statut_periode" AS ENUM('BROUILLON', 'VALIDEE');--> statement-breakpoint
CREATE TYPE "public"."paie_type_ligne" AS ENUM('GAIN', 'RETENUE', 'EMPLOYEUR');--> statement-breakpoint
CREATE TABLE "paie_bulletin_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"bulletin_id" integer NOT NULL,
	"ordre" integer NOT NULL,
	"type" "paie_type_ligne" NOT NULL,
	"code" varchar(30) NOT NULL,
	"libelle" text NOT NULL,
	"base" numeric(14, 2),
	"taux" numeric(7, 4),
	"montant" numeric(14, 2) NOT NULL,
	"en_nature" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paie_bulletins" (
	"id" serial PRIMARY KEY NOT NULL,
	"periode_id" integer NOT NULL,
	"salarie_id" integer NOT NULL,
	"elements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"matricule" varchar(30) NOT NULL,
	"nom_complet" text NOT NULL,
	"poste" text,
	"categorie" text,
	"numero_cnps" varchar(30),
	"salaire_base" numeric(14, 2) NOT NULL,
	"regime_cnps" "paie_regime_cnps" NOT NULL,
	"groupe_risque" "paie_groupe_risque" NOT NULL,
	"mode_paiement" "paie_mode_paiement" NOT NULL,
	"brut" numeric(14, 2) NOT NULL,
	"brut_cotisable" numeric(14, 2) NOT NULL,
	"brut_imposable" numeric(14, 2) NOT NULL,
	"cnps_salarie" numeric(14, 2) NOT NULL,
	"irpp" numeric(14, 2) NOT NULL,
	"cac" numeric(14, 2) NOT NULL,
	"cfc_salarie" numeric(14, 2) NOT NULL,
	"tdl" numeric(14, 2) NOT NULL,
	"rav" numeric(14, 2) NOT NULL,
	"avances" numeric(14, 2) NOT NULL,
	"autres_retenues" numeric(14, 2) NOT NULL,
	"total_retenues" numeric(14, 2) NOT NULL,
	"net_a_payer" numeric(14, 2) NOT NULL,
	"cnps_employeur" numeric(14, 2) NOT NULL,
	"cfc_employeur" numeric(14, 2) NOT NULL,
	"fne" numeric(14, 2) NOT NULL,
	"charges_employeur" numeric(14, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paie_periodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"periode" varchar(7) NOT NULL,
	"statut" "paie_statut_periode" DEFAULT 'BROUILLON' NOT NULL,
	"bareme_valide_du" date NOT NULL,
	"ecriture_id" integer,
	"validee_le" timestamp,
	"validee_par" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paie_rubriques_fixes" (
	"id" serial PRIMARY KEY NOT NULL,
	"salarie_id" integer NOT NULL,
	"libelle" text NOT NULL,
	"montant" numeric(14, 2) NOT NULL,
	"cotisable" boolean DEFAULT true NOT NULL,
	"imposable" boolean DEFAULT true NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paie_salaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"matricule" varchar(30) NOT NULL,
	"nom" text NOT NULL,
	"prenoms" text,
	"niu" varchar(30),
	"numero_cnps" varchar(30),
	"date_naissance" date,
	"date_embauche" date NOT NULL,
	"date_sortie" date,
	"poste" text,
	"categorie" text,
	"echelon" text,
	"salaire_base" numeric(14, 2) NOT NULL,
	"regime_cnps" "paie_regime_cnps" DEFAULT 'GENERAL' NOT NULL,
	"groupe_risque" "paie_groupe_risque" DEFAULT 'A' NOT NULL,
	"mode_paiement" "paie_mode_paiement" DEFAULT 'VIREMENT' NOT NULL,
	"banque" text,
	"avantages_nature" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paie_bulletin_lignes" ADD CONSTRAINT "paie_bulletin_lignes_bulletin_id_paie_bulletins_id_fk" FOREIGN KEY ("bulletin_id") REFERENCES "public"."paie_bulletins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paie_bulletins" ADD CONSTRAINT "paie_bulletins_periode_id_paie_periodes_id_fk" FOREIGN KEY ("periode_id") REFERENCES "public"."paie_periodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paie_bulletins" ADD CONSTRAINT "paie_bulletins_salarie_id_paie_salaries_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."paie_salaries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paie_periodes" ADD CONSTRAINT "paie_periodes_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paie_periodes" ADD CONSTRAINT "paie_periodes_ecriture_id_cpta_ecritures_id_fk" FOREIGN KEY ("ecriture_id") REFERENCES "public"."cpta_ecritures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paie_periodes" ADD CONSTRAINT "paie_periodes_validee_par_users_id_fk" FOREIGN KEY ("validee_par") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paie_periodes" ADD CONSTRAINT "paie_periodes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paie_rubriques_fixes" ADD CONSTRAINT "paie_rubriques_fixes_salarie_id_paie_salaries_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."paie_salaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paie_salaries" ADD CONSTRAINT "paie_salaries_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paie_bulletin_lignes_bulletin_idx" ON "paie_bulletin_lignes" USING btree ("bulletin_id","ordre");--> statement-breakpoint
CREATE UNIQUE INDEX "paie_bulletins_periode_salarie_unique" ON "paie_bulletins" USING btree ("periode_id","salarie_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paie_periodes_ctb_periode_unique" ON "paie_periodes" USING btree ("contribuable_id","periode");--> statement-breakpoint
CREATE INDEX "paie_rubriques_fixes_salarie_idx" ON "paie_rubriques_fixes" USING btree ("salarie_id","ordre");--> statement-breakpoint
CREATE UNIQUE INDEX "paie_salaries_ctb_matricule_unique" ON "paie_salaries" USING btree ("contribuable_id","matricule");--> statement-breakpoint
CREATE INDEX "paie_salaries_ctb_idx" ON "paie_salaries" USING btree ("contribuable_id","actif");