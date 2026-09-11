import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { declarations } from "@/db/schema";
import { notFound, conflict } from "@/lib/http";
import { sommeMontants, formatMontant } from "@/lib/comptable/money";
import {
  liquiderImpot,
  COMPTES_ACOMPTES_IMPOT,
  SANS_RETRAITEMENT,
  type BaremeImpot,
  type LiquidationImpot,
  type Retraitements,
} from "@/lib/comptable/dsf";
import type { LigneBalance } from "@/lib/comptable/balance";
import { lireParametre } from "@/lib/services/parametres";
import { getBalance } from "./restitutions";
import { getEtatsFinanciers } from "./etats-financiers";

/**
 * DSF : la liasse annuelle et la liquidation de l'impôt sur le résultat.
 *
 * Les états financiers sont ceux de `etats-financiers.ts` — la DSF ne les
 * recalcule pas, elle les reprend. Ce service y ajoute le passage du résultat
 * comptable à l'impôt dû, seul morceau que la comptabilité ne donne pas
 * directement.
 */

/**
 * Clé du barème dans les paramètres du cabinet.
 *
 * Aucune valeur par défaut n'est fournie : inventer un taux d'impôt serait pire
 * que de ne pas en avoir, car le chiffre aurait l'air d'être une réponse. Tant
 * que la clé est absente, la liquidation le dit.
 */
export const CLE_BAREME_IMPOT = "impot_resultat_bareme";

export type Dsf = {
  exercice: Awaited<ReturnType<typeof getEtatsFinanciers>>["exercice"];
  /** Année déclarée, celle de la clôture de l'exercice. */
  annee: string;
  etats: Awaited<ReturnType<typeof getEtatsFinanciers>>;
  liquidation: LiquidationImpot;
  /** Déclaration DSF du suivi des obligations, si elle existe. */
  declaration: {
    id: number;
    statut: string;
    dateEcheance: string;
    montant: string | null;
  } | null;
};

/** Acomptes d'impôt déjà versés, lus sur leurs comptes. */
function acomptesVerses(lignes: LigneBalance[]): number {
  const total = sommeMontants(
    lignes
      .filter((l) =>
        COMPTES_ACOMPTES_IMPOT.some((p) => l.compteNumero.startsWith(p)),
      )
      .map((l) => l.soldeDebiteur - l.soldeCrediteur),
  );

  // Un solde créditeur sur ces comptes est une dette d'impôt, pas un acompte :
  // l'imputer en négatif gonflerait le solde à payer d'un montant déjà constaté
  // par ailleurs.
  return total > 0 ? total : 0;
}

export async function getDsf(
  exerciceId: number,
  retraitements: Retraitements = SANS_RETRAITEMENT,
): Promise<Dsf> {
  const etats = await getEtatsFinanciers(exerciceId);
  const { lignes } = await getBalance(exerciceId);

  const poste = (code: string) =>
    etats.resultat.lignes.find((l) => l.code === code)?.montant ?? 0;

  const bareme = (await lireParametre<BaremeImpot>(CLE_BAREME_IMPOT)) ?? null;

  const liquidation = liquiderImpot(
    {
      chiffreAffaires: poste("XB"),
      resultatComptable: etats.resultat.resultatNet,
      acomptesVerses: acomptesVerses(lignes),
    },
    retraitements,
    bareme,
  );

  // L'exercice se déclare sur l'année de sa clôture.
  const annee = etats.exercice.dateFin.slice(0, 4);

  return {
    exercice: etats.exercice,
    annee,
    etats,
    liquidation,
    declaration: await trouverDeclaration(etats.exercice.contribuableId, annee),
  };
}

async function trouverDeclaration(contribuableId: number, annee: string) {
  const [row] = await db
    .select({
      id: declarations.id,
      statut: declarations.statut,
      dateEcheance: declarations.dateEcheance,
      montant: declarations.montant,
    })
    .from(declarations)
    .where(
      and(
        eq(declarations.contribuableId, contribuableId),
        eq(declarations.type, "DSF"),
        eq(declarations.periode, annee),
      ),
    );
  return row ?? null;
}

/**
 * Reporte le solde d'impôt sur la déclaration DSF du suivi.
 *
 * Comme pour la TVA, la déclaration n'est pas créée si elle n'existe pas, et le
 * statut n'est pas touché. Le report est en revanche refusé tant que le barème
 * n'est pas paramétré : écrire zéro se lirait « rien à payer », alors que le
 * montant est simplement inconnu.
 */
export async function reporterDsfSurDeclaration(
  exerciceId: number,
  retraitements: Retraitements = SANS_RETRAITEMENT,
) {
  const dsf = await getDsf(exerciceId, retraitements);

  if (dsf.liquidation.baremeManquant) {
    throw conflict(
      "Le barème de l'impôt sur le résultat n'est pas paramétré : " +
        `renseignez la clé « ${CLE_BAREME_IMPOT} » dans les paramètres ` +
        "avant de reporter un montant.",
    );
  }

  if (!dsf.declaration) {
    throw notFound(
      `Aucune déclaration DSF pour l'exercice ${dsf.annee}. ` +
        "Générez d'abord les échéances de ce contribuable.",
    );
  }

  const [maj] = await db
    .update(declarations)
    .set({
      montant: formatMontant(dsf.liquidation.soldeAPayer ?? 0),
      updatedAt: new Date(),
    })
    .where(eq(declarations.id, dsf.declaration.id))
    .returning();

  return { declaration: maj, dsf };
}
