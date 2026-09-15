CREATE TABLE "cpta_axes_analytiques" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"code" varchar(20) NOT NULL,
	"libelle" text NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cpta_sections_analytiques" (
	"id" serial PRIMARY KEY NOT NULL,
	"axe_id" integer NOT NULL,
	"code" varchar(20) NOT NULL,
	"libelle" text NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cpta_ventilations_analytiques" (
	"id" serial PRIMARY KEY NOT NULL,
	"ligne_id" integer NOT NULL,
	"section_id" integer NOT NULL,
	"montant" numeric(14, 2) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cpta_axes_analytiques" ADD CONSTRAINT "cpta_axes_analytiques_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_sections_analytiques" ADD CONSTRAINT "cpta_sections_analytiques_axe_id_cpta_axes_analytiques_id_fk" FOREIGN KEY ("axe_id") REFERENCES "public"."cpta_axes_analytiques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_ventilations_analytiques" ADD CONSTRAINT "cpta_ventilations_analytiques_ligne_id_cpta_lignes_ecriture_id_fk" FOREIGN KEY ("ligne_id") REFERENCES "public"."cpta_lignes_ecriture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_ventilations_analytiques" ADD CONSTRAINT "cpta_ventilations_analytiques_section_id_cpta_sections_analytiques_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."cpta_sections_analytiques"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_ventilations_analytiques" ADD CONSTRAINT "cpta_ventilations_analytiques_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cpta_axes_ctb_code_unique" ON "cpta_axes_analytiques" USING btree ("contribuable_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "cpta_sections_axe_code_unique" ON "cpta_sections_analytiques" USING btree ("axe_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "cpta_ventilations_ligne_section_unique" ON "cpta_ventilations_analytiques" USING btree ("ligne_id","section_id");--> statement-breakpoint
CREATE INDEX "cpta_ventilations_section_idx" ON "cpta_ventilations_analytiques" USING btree ("section_id");