import "server-only";
import { and, asc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cptaComptes,
  cptaEcritures,
  cptaJournaux,
  cptaLignesEcriture,
  cptaTiers,
} from "@/db/schema";
import {
  calculerBalance,
  totauxBalance,
  calculerGrandLivre,
  type Mouvement,
  type MouvementDetaille,
} from "@/lib/comptable/balance";
import { getExercice } from "./exercices";

/**
 * Balance et grand livre.
 *
 * Rien n'est cumulé en base : ces états se recalculent à chaque appel depuis
 * les lignes d'écriture. Un total stocké finit toujours par diverger de son
 * détail ; un total recalculé ne le peut pas.
 */

/**
 * Une écriture contre-passée reste dans les livres.
 *
 * Sa contre-passation est une écriture distincte, de sens inverse : les deux
 * s'annulent d'elles-mêmes au grand livre. Exclure l'origine et garder son
 * inverse déséquilibrerait la balance. Seuls les brouillons sont écartés — ils
 * ne sont pas encore des mouvements.
 */
const MOUVEMENTS_COMPTABILISES = ne(cptaEcritures.statut, "BROUILLON");

export type FiltrePeriode = {
  /** Bornes incluses, au format ISO. À défaut, tout l'exercice. */
  dateDebut?: string;
  dateFin?: string;
};

function conditionsPeriode(exerciceId: number, periode: FiltrePeriode) {
  const conditions = [
    eq(cptaEcritures.exerciceId, exerciceId),
    MOUVEMENTS_COMPTABILISES,
  ];
  if (periode.dateDebut) {
    conditions.push(gte(cptaEcritures.dateEcriture, periode.dateDebut));
  }
  if (periode.dateFin) {
    conditions.push(lte(cptaEcritures.dateEcriture, periode.dateFin));
  }
  return conditions;
}

/** Balance générale de l'exercice, avec son contrôle d'équilibre. */
export async function getBalance(
  exerciceId: number,
  periode: FiltrePeriode = {},
) {
  const exercice = await getExercice(exerciceId);

  const mouvements = await db
    .select({
      compteId: cptaLignesEcriture.compteId,
      compteNumero: cptaComptes.numero,
      compteLibelle: cptaComptes.libelle,
      debit: cptaLignesEcriture.debit,
      credit: cptaLignesEcriture.credit,
    })
    .from(cptaLignesEcriture)
    .innerJoin(cptaEcritures, eq(cptaLignesEcriture.ecritureId, cptaEcritures.id))
    .innerJoin(cptaComptes, eq(cptaLignesEcriture.compteId, cptaComptes.id))
    .where(and(...conditionsPeriode(exerciceId, periode)));

  const lignes = calculerBalance(mouvements satisfies Mouvement[]);

  return { exercice, lignes, totaux: totauxBalance(lignes) };
}

/**
 * Grand livre de l'exercice, éventuellement restreint à un compte.
 *
 * Le solde d'ouverture est repris de la période antérieure lorsqu'une date de
 * début est donnée : sans lui, le solde progressif partirait de zéro en milieu
 * d'exercice et n'aurait aucun sens.
 */
export async function getGrandLivre(
  exerciceId: number,
  options: FiltrePeriode & { compteId?: number } = {},
) {
  const exercice = await getExercice(exerciceId);

  const conditions = conditionsPeriode(exerciceId, options);
  if (options.compteId) {
    conditions.push(eq(cptaLignesEcriture.compteId, options.compteId));
  }

  const mouvements = await db
    .select({
      ligneId: cptaLignesEcriture.id,
      ecritureId: cptaEcritures.id,
      compteId: cptaLignesEcriture.compteId,
      compteNumero: cptaComptes.numero,
      compteLibelle: cptaComptes.libelle,
      dateEcriture: cptaEcritures.dateEcriture,
      numeroPiece: cptaEcritures.numeroPiece,
      journalCode: cptaJournaux.code,
      // Le libellé de ligne est facultatif : la plupart des saisies n'en
      // portent qu'un seul, au niveau de l'écriture. Sans ce repli, le grand
      // livre afficherait une colonne « Libellé » vide, alors que c'est
      // justement ce qui permet de reconnaître une opération.
      libelle: sql<string>`coalesce(${cptaLignesEcriture.libelle}, ${cptaEcritures.libelle})`,
      tiersLibelle: cptaTiers.raisonSociale,
      lettrage: cptaLignesEcriture.lettrage,
      debit: cptaLignesEcriture.debit,
      credit: cptaLignesEcriture.credit,
    })
    .from(cptaLignesEcriture)
    .innerJoin(cptaEcritures, eq(cptaLignesEcriture.ecritureId, cptaEcritures.id))
    .innerJoin(cptaComptes, eq(cptaLignesEcriture.compteId, cptaComptes.id))
    .innerJoin(cptaJournaux, eq(cptaEcritures.journalId, cptaJournaux.id))
    .leftJoin(cptaTiers, eq(cptaLignesEcriture.tiersId, cptaTiers.id))
    .where(and(...conditions))
    .orderBy(asc(cptaEcritures.dateEcriture), asc(cptaLignesEcriture.id));

  const soldesInitiaux = options.dateDebut
    ? await getSoldesAvant(exerciceId, options.dateDebut, options.compteId)
    : new Map<number, number>();

  return {
    exercice,
    comptes: calculerGrandLivre(
      mouvements satisfies MouvementDetaille[],
      soldesInitiaux,
    ),
  };
}

/** Solde de chaque compte à la veille d'une date, au sein de l'exercice. */
async function getSoldesAvant(
  exerciceId: number,
  date: string,
  compteId?: number,
): Promise<Map<number, number>> {
  const conditions = [
    eq(cptaEcritures.exerciceId, exerciceId),
    MOUVEMENTS_COMPTABILISES,
    lte(cptaEcritures.dateEcriture, veille(date)),
  ];
  if (compteId) conditions.push(eq(cptaLignesEcriture.compteId, compteId));

  const mouvements = await db
    .select({
      compteId: cptaLignesEcriture.compteId,
      compteNumero: cptaComptes.numero,
      compteLibelle: cptaComptes.libelle,
      debit: cptaLignesEcriture.debit,
      credit: cptaLignesEcriture.credit,
    })
    .from(cptaLignesEcriture)
    .innerJoin(cptaEcritures, eq(cptaLignesEcriture.ecritureId, cptaEcritures.id))
    .innerJoin(cptaComptes, eq(cptaLignesEcriture.compteId, cptaComptes.id))
    .where(and(...conditions));

  return new Map(
    calculerBalance(mouvements satisfies Mouvement[]).map((l) => [
      l.compteId,
      l.soldeDebiteur - l.soldeCrediteur,
    ]),
  );
}

function veille(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Plan comptable du contribuable, pour les listes de sélection et l'écran dédié. */
export async function listerComptes(contribuableId: number) {
  return db
    .select()
    .from(cptaComptes)
    .where(eq(cptaComptes.contribuableId, contribuableId))
    .orderBy(asc(cptaComptes.numero));
}

/** Journaux du contribuable. */
export async function listerJournaux(contribuableId: number) {
  return db
    .select()
    .from(cptaJournaux)
    .where(eq(cptaJournaux.contribuableId, contribuableId))
    .orderBy(asc(cptaJournaux.code));
}
