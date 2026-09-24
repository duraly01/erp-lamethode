CREATE TYPE "public"."gc_politique_negatif" AS ENUM('REFUSE', 'TOLERE');--> statement-breakpoint
CREATE TYPE "public"."gc_type_code_article" AS ENUM('EAN', 'FOURNISSEUR', 'INTERNE_ANCIEN');--> statement-breakpoint
CREATE TYPE "public"."gc_type_depot" AS ENUM('ENTREPOT', 'BOUTIQUE', 'RESTAURANT', 'TRANSIT');--> statement-breakpoint
CREATE TABLE "gc_article_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	"type" "gc_type_code_article" NOT NULL,
	"code" varchar(80) NOT NULL,
	"tiers_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gc_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"code" varchar(40) NOT NULL,
	"libelle" text NOT NULL,
	"famille_id" integer,
	"unite" varchar(10) DEFAULT 'U' NOT NULL,
	"variante" varchar(60),
	"suivi_lot" boolean DEFAULT false NOT NULL,
	"duree_vie_min_jours" integer,
	"compte_achat_id" integer,
	"compte_vente_id" integer,
	"compte_stock_id" integer,
	"compte_variation_id" integer,
	"taxe_id" integer,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gc_depots" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"code" varchar(20) NOT NULL,
	"libelle" text NOT NULL,
	"type" "gc_type_depot" NOT NULL,
	"responsable_user_id" integer,
	"section_id" integer,
	"politique_negatif" "gc_politique_negatif" DEFAULT 'REFUSE' NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gc_familles" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"code" varchar(20) NOT NULL,
	"libelle" text NOT NULL,
	"parent_id" integer,
	"compte_achat_id" integer,
	"compte_vente_id" integer,
	"compte_stock_id" integer,
	"compte_variation_id" integer,
	"taxe_id" integer,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gc_tarif_prix" (
	"id" serial PRIMARY KEY NOT NULL,
	"tarif_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	"valide_du" date NOT NULL,
	"valide_au" date,
	"prix_ht" numeric(14, 2) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gc_tarif_prix_periode_ordonnee" CHECK ("gc_tarif_prix"."valide_au" IS NULL OR "gc_tarif_prix"."valide_au" >= "gc_tarif_prix"."valide_du"),
	CONSTRAINT "gc_tarif_prix_positif" CHECK ("gc_tarif_prix"."prix_ht" >= 0)
);
--> statement-breakpoint
CREATE TABLE "gc_tarifs" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"code" varchar(20) NOT NULL,
	"libelle" text NOT NULL,
	"type_depot_defaut" "gc_type_depot",
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gc_article_codes" ADD CONSTRAINT "gc_article_codes_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_article_codes" ADD CONSTRAINT "gc_article_codes_article_id_gc_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."gc_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_article_codes" ADD CONSTRAINT "gc_article_codes_tiers_id_cpta_tiers_id_fk" FOREIGN KEY ("tiers_id") REFERENCES "public"."cpta_tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_articles" ADD CONSTRAINT "gc_articles_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_articles" ADD CONSTRAINT "gc_articles_famille_id_gc_familles_id_fk" FOREIGN KEY ("famille_id") REFERENCES "public"."gc_familles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_articles" ADD CONSTRAINT "gc_articles_compte_achat_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_achat_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_articles" ADD CONSTRAINT "gc_articles_compte_vente_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_vente_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_articles" ADD CONSTRAINT "gc_articles_compte_stock_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_stock_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_articles" ADD CONSTRAINT "gc_articles_compte_variation_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_variation_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_articles" ADD CONSTRAINT "gc_articles_taxe_id_cpta_taxes_id_fk" FOREIGN KEY ("taxe_id") REFERENCES "public"."cpta_taxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_depots" ADD CONSTRAINT "gc_depots_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_depots" ADD CONSTRAINT "gc_depots_responsable_user_id_users_id_fk" FOREIGN KEY ("responsable_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_depots" ADD CONSTRAINT "gc_depots_section_id_cpta_sections_analytiques_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."cpta_sections_analytiques"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_familles" ADD CONSTRAINT "gc_familles_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_familles" ADD CONSTRAINT "gc_familles_parent_id_gc_familles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."gc_familles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_familles" ADD CONSTRAINT "gc_familles_compte_achat_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_achat_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_familles" ADD CONSTRAINT "gc_familles_compte_vente_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_vente_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_familles" ADD CONSTRAINT "gc_familles_compte_stock_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_stock_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_familles" ADD CONSTRAINT "gc_familles_compte_variation_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_variation_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_familles" ADD CONSTRAINT "gc_familles_taxe_id_cpta_taxes_id_fk" FOREIGN KEY ("taxe_id") REFERENCES "public"."cpta_taxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_tarif_prix" ADD CONSTRAINT "gc_tarif_prix_tarif_id_gc_tarifs_id_fk" FOREIGN KEY ("tarif_id") REFERENCES "public"."gc_tarifs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_tarif_prix" ADD CONSTRAINT "gc_tarif_prix_article_id_gc_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."gc_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_tarif_prix" ADD CONSTRAINT "gc_tarif_prix_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gc_tarifs" ADD CONSTRAINT "gc_tarifs_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gc_article_codes_ctb_type_code_unique" ON "gc_article_codes" USING btree ("contribuable_id","type","code");--> statement-breakpoint
CREATE INDEX "gc_article_codes_article_idx" ON "gc_article_codes" USING btree ("article_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gc_articles_ctb_code_unique" ON "gc_articles" USING btree ("contribuable_id","code");--> statement-breakpoint
CREATE INDEX "gc_articles_ctb_famille_idx" ON "gc_articles" USING btree ("contribuable_id","famille_id");--> statement-breakpoint
CREATE INDEX "gc_articles_ctb_libelle_idx" ON "gc_articles" USING btree ("contribuable_id","libelle");--> statement-breakpoint
CREATE UNIQUE INDEX "gc_depots_ctb_code_unique" ON "gc_depots" USING btree ("contribuable_id","code");--> statement-breakpoint
CREATE INDEX "gc_depots_ctb_idx" ON "gc_depots" USING btree ("contribuable_id","actif");--> statement-breakpoint
CREATE UNIQUE INDEX "gc_familles_ctb_code_unique" ON "gc_familles" USING btree ("contribuable_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "gc_tarif_prix_tarif_article_du_unique" ON "gc_tarif_prix" USING btree ("tarif_id","article_id","valide_du");--> statement-breakpoint
CREATE INDEX "gc_tarif_prix_article_idx" ON "gc_tarif_prix" USING btree ("article_id","valide_du");--> statement-breakpoint
CREATE UNIQUE INDEX "gc_tarifs_ctb_code_unique" ON "gc_tarifs" USING btree ("contribuable_id","code");