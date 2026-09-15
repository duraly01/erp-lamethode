-- PostgreSQL 9.6 refuse « ALTER TYPE … ADD VALUE » dans une transaction, et
-- chaque migration s'exécute dans une transaction. Le type est donc recréé
-- avec la valeur CESSION, la colonne basculée, l'ancien type retiré et le
-- nouveau renommé : au bout, « cpta_origine » porte toutes les valeurs.
CREATE TYPE "public"."cpta_origine_v2" AS ENUM('MANUELLE', 'A_NOUVEAUX', 'FACTURE_VENTE', 'FACTURE_ACHAT', 'REGLEMENT', 'PAIE', 'AMORTISSEMENT', 'CESSION', 'STOCK', 'CLOTURE');--> statement-breakpoint
ALTER TABLE "cpta_ecritures" ALTER COLUMN "origine" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "cpta_ecritures" ALTER COLUMN "origine" TYPE "public"."cpta_origine_v2" USING "origine"::text::"public"."cpta_origine_v2";--> statement-breakpoint
ALTER TABLE "cpta_ecritures" ALTER COLUMN "origine" SET DEFAULT 'MANUELLE';--> statement-breakpoint
DROP TYPE "public"."cpta_origine";--> statement-breakpoint
ALTER TYPE "public"."cpta_origine_v2" RENAME TO "cpta_origine";
