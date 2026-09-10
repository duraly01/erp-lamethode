ALTER TABLE "contribuables" ADD COLUMN "remise_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "contribuables" ADD COLUMN "delai_paiement_jours" integer;--> statement-breakpoint
ALTER TABLE "contribuables" ADD COLUMN "adresse_facturation" text;--> statement-breakpoint
ALTER TABLE "contribuables" ADD COLUMN "facturation_auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contribuables" ADD CONSTRAINT "contribuables_remise_pct_check" CHECK ("contribuables"."remise_pct" IS NULL OR ("contribuables"."remise_pct" >= 0 AND "contribuables"."remise_pct" <= 100));--> statement-breakpoint
ALTER TABLE "contribuables" ADD CONSTRAINT "contribuables_delai_paiement_check" CHECK ("contribuables"."delai_paiement_jours" IS NULL OR "contribuables"."delai_paiement_jours" > 0);