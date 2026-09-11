import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { declarations } from "@/db/schema";
import { badRequest, notFound } from "@/lib/http";
import { ajouterJours } from "@/lib/dates";
import { formatMontant } from "@/lib/comptable/money";
import {
  calculerTva,
  creditTvaAnterieur,
  tvaAnterieureNonLiquidee,
  bornesPeriodeMensuelle,
  type DeclarationTva,
} from "@/lib/comptable/tva";
import { getBalance } from "./restitutions";
import { getExercice } from "./exercices";

/**
 * Déclaration de TVA tirée des livres.
 *
 * Le montant déclaré est celui que portent les comptes de TVA, et non un
 * recalcul à partir des bases : c'est ce qui garantit que la déclaration et la
 * comptabilité disent la même chose. Si l'une est fausse, l'autre l'est aussi,
 * et l'écart se corrige à la source.
 */

export type DeclarationTvaExercice = DeclarationTva & {
  exercice: Awaited<ReturnType<typeof getExercice>>;
  /** Déclaration correspondante dans le suivi des obligations, si elle existe. */
  declaration: {
    id: number;
    statut: string;
    dateEcheance: string;
    montant: string | null;
  } | null;
};

export async function getDeclarationTva(
  exerciceId: number,
  periode: string,
): Promise<DeclarationTvaExercice> {
  const exercice = await getExercice(exerciceId);
  const bornes = bornesPeriodeMensuelle(periode);

  // Une période hors exercice rendrait une déclaration vide, ce qui se lirait
  // comme « rien à déclarer » alors que les écritures sont ailleurs.
  if (
    bornes.dateDebut < exercice.dateDebut ||
    bornes.dateFin > exercice.dateFin
  ) {
    throw badRequest(
      `La période ${periode} n'est pas comprise dans l'exercice ` +
        `${exercice.libelle} (${exercice.dateDebut} au ${exercice.dateFin}).`,
    );
  }

  // Les mouvements de la période seule : un cumul redéclarerait le passé.
  const { lignes } = await getBalance(exerciceId, {
    dateDebut: bornes.dateDebut,
    dateFin: bornes.dateFin,
  });

  // Le crédit reporté se lit sur les mouvements antérieurs à la période.
  const anterieur = await getBalance(exerciceId, {
    dateFin: ajouterJours(bornes.dateDebut, -1),
  });

  const calcul = calculerTva(
    lignes,
    {
      credit: creditTvaAnterieur(anterieur.lignes),
      nonLiquidee: tvaAnterieureNonLiquidee(anterieur.lignes),
    },
    bornes,
  );

  return {
    ...calcul,
    exercice,
    declaration: await trouverDeclaration(exercice.contribuableId, periode),
  };
}

async function trouverDeclaration(contribuableId: number, periode: string) {
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
        eq(declarations.type, "TVA"),
        eq(declarations.periode, periode),
      ),
    );
  return row ?? null;
}

/**
 * Reporte le montant calculé sur la déclaration de TVA du suivi.
 *
 * La déclaration n'est pas créée si elle n'existe pas : les obligations d'un
 * contribuable découlent de son régime, et les fabriquer ici court-circuiterait
 * cette logique — un dossier à l'IGS se retrouverait avec une TVA à déposer.
 * L'appelant est renvoyé vers la génération des échéances.
 *
 * Le statut n'est pas touché : connaître le montant ne veut pas dire que la
 * déclaration est déposée.
 */
export async function reporterTvaSurDeclaration(
  exerciceId: number,
  periode: string,
) {
  const calcul = await getDeclarationTva(exerciceId, periode);

  if (!calcul.declaration) {
    throw notFound(
      `Aucune déclaration de TVA pour la période ${periode}. ` +
        "Générez d'abord les échéances de ce contribuable.",
    );
  }

  // Un crédit de TVA se déclare, mais rien n'est à payer : le montant suivi
  // est celui du décaissement attendu.
  const [maj] = await db
    .update(declarations)
    .set({ montant: formatMontant(calcul.tvaDue), updatedAt: new Date() })
    .where(eq(declarations.id, calcul.declaration.id))
    .returning();

  return { declaration: maj, calcul };
}
