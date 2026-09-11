CREATE TYPE "public"."cpta_type_piece" AS ENUM('FACTURE_VENTE', 'FACTURE_ACHAT');--> statement-breakpoint
CREATE TABLE "cpta_piece_lignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"piece_id" integer NOT NULL,
	"ordre" integer NOT NULL,
	"compte_id" integer NOT NULL,
	"libelle" text,
	"montant_ht" numeric(14, 2) NOT NULL,
	"taxe_id" integer
);
--> statement-breakpoint
CREATE TABLE "cpta_pieces" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribuable_id" integer NOT NULL,
	"exercice_id" integer NOT NULL,
	"type" "cpta_type_piece" NOT NULL,
	"reference" varchar(120),
	"tiers_id" integer NOT NULL,
	"date_piece" date NOT NULL,
	"date_echeance" date,
	"total_ht" numeric(14, 2) NOT NULL,
	"total_tva" numeric(14, 2) NOT NULL,
	"total_ttc" numeric(14, 2) NOT NULL,
	"ecriture_id" integer,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cpta_piece_lignes" ADD CONSTRAINT "cpta_piece_lignes_piece_id_cpta_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."cpta_pieces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_piece_lignes" ADD CONSTRAINT "cpta_piece_lignes_compte_id_cpta_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "public"."cpta_comptes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_piece_lignes" ADD CONSTRAINT "cpta_piece_lignes_taxe_id_cpta_taxes_id_fk" FOREIGN KEY ("taxe_id") REFERENCES "public"."cpta_taxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_pieces" ADD CONSTRAINT "cpta_pieces_contribuable_id_contribuables_id_fk" FOREIGN KEY ("contribuable_id") REFERENCES "public"."contribuables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_pieces" ADD CONSTRAINT "cpta_pieces_exercice_id_cpta_exercices_id_fk" FOREIGN KEY ("exercice_id") REFERENCES "public"."cpta_exercices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_pieces" ADD CONSTRAINT "cpta_pieces_tiers_id_cpta_tiers_id_fk" FOREIGN KEY ("tiers_id") REFERENCES "public"."cpta_tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_pieces" ADD CONSTRAINT "cpta_pieces_ecriture_id_cpta_ecritures_id_fk" FOREIGN KEY ("ecriture_id") REFERENCES "public"."cpta_ecritures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpta_pieces" ADD CONSTRAINT "cpta_pieces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cpta_piece_lignes_piece_idx" ON "cpta_piece_lignes" USING btree ("piece_id","ordre");--> statement-breakpoint
CREATE INDEX "cpta_pieces_contribuable_idx" ON "cpta_pieces" USING btree ("contribuable_id","date_piece");--> statement-breakpoint
CREATE INDEX "cpta_pieces_exercice_idx" ON "cpta_pieces" USING btree ("exercice_id","type");--> statement-breakpoint
CREATE INDEX "cpta_pieces_tiers_idx" ON "cpta_pieces" USING btree ("tiers_id");