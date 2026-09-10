CREATE TYPE "public"."categorie_ligne" AS ENUM('HONORAIRES', 'IMPOT_TRESOR', 'CNPS', 'FRAIS', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."declaration_type_v2" AS ENUM('DSF', 'SOLDE_DSF', 'IRPP', 'BEF', 'BAIL', 'PRECOMPTE_LOYER', 'TVA', 'ACOMPTE_IS', 'CNPS', 'PATENTE', 'IGS', 'IGS_ANNUELLE', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."mode_reglement" AS ENUM('ESPECES', 'VIREMENT', 'MOBILE_MONEY', 'CHEQUE', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."periodicite_v2" AS ENUM('MENSUELLE', 'TRIMESTRIELLE', 'ANNUELLE');--> statement-breakpoint
CREATE TYPE "public"."regime_fiscal_v2" AS ENUM('REEL', 'IGS');--> statement-breakpoint
CREATE TYPE "public"."statut_facture" AS ENUM('BROUILLON', 'ENVOYEE', 'PARTIELLE', 'PAYEE', 'EN_RETARD', 'ANNULEE');--> statement-breakpoint
CREATE TABLE "facture_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"facture_id" integer NOT NULL,
	"categorie" "categorie_ligne" DEFAULT 'HONORAIRES' NOT NULL,
	"libelle" text NOT NULL,
	"montant_ht" numeric(14, 2) NOT NULL,
	"taux_tva" numeric(5, 2) DEFAULT '0' NOT NULL,
	"declaration_id" integer,
	"ordre" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factures" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" varchar(30) NOT NULL,
	"contribuable_id" integer NOT NULL,
	"periode" varchar(7) NOT NULL,
	"objet" text,
	"date_emission" date NOT NULL,
	"date_echeance" date NOT NULL,
	"statut" "statut_facture" DEFAULT 'BROUILLON' NOT NULL,
	"total_ht" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_tva" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_ttc" numeric(14, 2) DEFAULT '0' NOT NULL,
	"montant_regle" numeric(14, 2) DEFAULT '0' NOT NULL,
	"envoyee_le" timestamp,
	"canaux_envoi" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reglements" (
	"id" serial PRIMARY KEY NOT NULL,
	"facture_id" integer NOT NULL,
	"date" date NOT NULL,
	"montant" numeric(14, 2) NOT NULL,
	"mode" "mode_reglement" DEFAULT 'VIREMENT' NOT NULL,
	"reference" text,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
--> Régime fiscal : passage intermédiaire par `text` pour pouvoir convertir les
--> données AVANT de contraindre au nouveau type. Un cast direct échouerait sur
--> toute ligne portant 'SIMPLIFIE' ou 'IFU', valeurs absentes du nouveau
--> référentiel — et l'UPDATE, lui, serait impossible tant que la colonne porte
--> encore l'ancienne énumération, qui ignore 'IGS'.
ALTER TABLE "contribuables" ALTER COLUMN "regime_fiscal" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "contribuables" ALTER COLUMN "regime_fiscal" SET DATA TYPE text USING "regime_fiscal"::text;--> statement-breakpoint
UPDATE "contribuables" SET "regime_fiscal" = 'IGS' WHERE "regime_fiscal" IN ('SIMPLIFIE', 'IFU');--> statement-breakpoint
UPDATE "contribuables" SET "regime_fiscal" = 'REEL' WHERE "regime_fiscal" NOT IN ('REEL', 'IGS');--> statement-breakpoint
ALTER TABLE "contribuables" ALTER COLUMN "regime_fiscal" SET DATA TYPE "public"."regime_fiscal_v2" USING "regime_fiscal"::"public"."regime_fiscal_v2";--> statement-breakpoint
ALTER TABLE "contribuables" ALTER COLUMN "regime_fiscal" SET DEFAULT 'REEL';--> statement-breakpoint
ALTER TABLE "declarations" ALTER COLUMN "type" SET DATA TYPE "public"."declaration_type_v2" USING "type"::text::"public"."declaration_type_v2";--> statement-breakpoint
ALTER TABLE "declarations" ALTER COLUMN "periodicite" SET DATA TYPE "public"."periodicite_v2" USING "periodicite"::text::"public"."periodicite_v2";--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "nom" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "contribuables" ADD COLUMN "igs_classe" integer;--> statement-breakpoint
ALTER TABLE "contribuables" ADD COLUMN "cga_adherent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contribuables" ADD COLUMN "chiffre_affaires_annuel" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "contribuables" ADD COLUMN "honoraire_mensuel" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "facture_lignes" ADD CONSTRAINT "facture_lignes_facture_id_factures_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."factures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facture_lignes" ADD CONSTRAINT "facture_lignes_declaration_id_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."declarations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factures" ADD CONSTRAINT "factures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglements" ADD CONSTRAINT "reglements_facture_id_factures_id_fk" FOREIGN KEY ("facture_id") REFERENCES "public"."factures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglements" ADD CONSTRAINT "reglements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "facture_lignes_facture_idx" ON "facture_lignes" USING btree ("facture_id");--> statement-breakpoint
CREATE UNIQUE INDEX "factures_numero_unique" ON "factures" USING btree ("numero");--> statement-breakpoint
CREATE UNIQUE INDEX "factures_ctb_periode_unique" ON "factures" USING btree ("contribuable_id","periode");--> statement-breakpoint
CREATE INDEX "factures_statut_idx" ON "factures" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "factures_echeance_idx" ON "factures" USING btree ("date_echeance");--> statement-breakpoint
CREATE INDEX "reglements_facture_idx" ON "reglements" USING btree ("facture_id");--> statement-breakpoint
ALTER TABLE "contribuables" ADD CONSTRAINT "contribuables_igs_classe_check" CHECK ("contribuables"."igs_classe" IS NULL OR ("contribuables"."igs_classe" >= 1 AND "contribuables"."igs_classe" <= 12));--> statement-breakpoint

--> Paramètres du cabinet introduits par cette migration. `ON CONFLICT DO
--> NOTHING` les rend rejouables sans écraser un réglage déjà personnalisé.

--> Barème IGS de l'article C40 du CGI : 12 classes, de l'exonération au
--> forfait de 2 000 000 FCFA. Éditable dans Paramètres → Barème IGS.
INSERT INTO "parametres" ("cle", "valeur", "description") VALUES (
  'igs_bareme',
  '[{"classe":1,"caMin":0,"caMax":500000,"montant":0},
    {"classe":2,"caMin":500001,"caMax":1000000,"montant":20000},
    {"classe":3,"caMin":1000001,"caMax":2000000,"montant":40000},
    {"classe":4,"caMin":2000001,"caMax":3000000,"montant":75000},
    {"classe":5,"caMin":3000001,"caMax":5000000,"montant":125000},
    {"classe":6,"caMin":5000001,"caMax":7500000,"montant":200000},
    {"classe":7,"caMin":7500001,"caMax":10000000,"montant":300000},
    {"classe":8,"caMin":10000001,"caMax":15000000,"montant":500000},
    {"classe":9,"caMin":15000001,"caMax":20000000,"montant":700000},
    {"classe":10,"caMin":20000001,"caMax":30000000,"montant":1000000},
    {"classe":11,"caMin":30000001,"caMax":40000000,"montant":1500000},
    {"classe":12,"caMin":40000001,"caMax":50000000,"montant":2000000}]'::jsonb,
  'Barème IGS (CGI art. C40) : classe, tranche de CA annuel, montant forfaitaire (FCFA)'
) ON CONFLICT ("cle") DO NOTHING;--> statement-breakpoint

--> Identité légale imprimée en pied de facture. Le papier entête fourni porte
--> un NIU et un RCCM erronés : ce sont ces valeurs-ci qui font foi.
INSERT INTO "parametres" ("cle", "valeur", "description") VALUES (
  'cabinet_identite',
  '{"raisonSociale":"Cabinet LaMethode — Cabinet & Services",
    "niu":"M082217553824H",
    "rccm":"RC/YAO/2022/B/1538",
    "adresse":"L''Intendance, BP 13837 Yaoundé",
    "telephone":"+237 6 20 83 67 86",
    "email":"temejeanjacques@lamethode.cm",
    "siteWeb":"www.lamethode.cm",
    "ville":"Yaoundé"}'::jsonb,
  'Coordonnées légales imprimées en pied de facture'
) ON CONFLICT ("cle") DO NOTHING;--> statement-breakpoint

INSERT INTO "parametres" ("cle", "valeur", "description") VALUES (
  'facturation_numerotation', '{"prefixe":"FA"}'::jsonb,
  'Préfixe des numéros de facture (FA-2026-0001)'
) ON CONFLICT ("cle") DO NOTHING;--> statement-breakpoint

INSERT INTO "parametres" ("cle", "valeur", "description") VALUES (
  'facturation_delai_paiement', '{"jours":15}'::jsonb,
  'Délai de paiement accordé, en jours'
) ON CONFLICT ("cle") DO NOTHING;