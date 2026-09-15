CREATE TYPE "public"."cpta_statut_budget" AS ENUM('BROUILLON', 'VALIDE');--> statement-breakpoint
CREATE TABLE "cpta_budget_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_id" integer NOT NULL,
	"compte_id" integer NOT NULL,
	"section_id" integer,
	"montant_annuel" numeric(14, 2) NOT NULL,
	"mensualisation" jsonb,
	"commentaire" text
);
--> statement-breakpoint
CREATE TABLE "cpta_budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"exercice_id" integer NOT NULL,
	"libelle" text NOT NULL,
	"axe_id" integer,
	"statut" "cpta_statut_budget" DEFAULT 'BROUILLON' NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cpta_budget_lignes" ADD CONSTRAINT "cpta_budget_lignes_budget_id_cpta_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."cpta_budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_budget_lignes" ADD CONSTRAINT "cpta_budget_lignes_compte_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_budget_lignes" ADD CONSTRAINT "cpta_budget_lignes_section_id_cpta_sections_analytiques_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."cpta_sections_analytiques"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_budgets" ADD CONSTRAINT "cpta_budgets_exercice_id_cpta_exercices_id_fk" FOREIGN KEY ("exercice_id") REFERENCES "public"."cpta_exercices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_budgets" ADD CONSTRAINT "cpta_budgets_axe_id_cpta_axes_analytiques_id_fk" FOREIGN KEY ("axe_id") REFERENCES "public"."cpta_axes_analytiques"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_budgets" ADD CONSTRAINT "cpta_budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cpta_budget_lignes_budget_idx" ON "cpta_budget_lignes" USING btree ("budget_id","compte_id");--> statement-breakpoint
CREATE INDEX "cpta_budgets_exercice_idx" ON "cpta_budgets" USING btree ("exercice_id");