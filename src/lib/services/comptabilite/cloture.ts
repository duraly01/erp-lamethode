import "server-only";
import { and, eq, count, sql, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  cptaComptes,
  cptaEcritures,
  cptaExercices,
  cptaJournaux,
  cptaLignesEcriture,
  cptaRapprochements,
} from "@/db/schema";
import { badRequest, conflict } from "@/lib/http";
import { parseMontant } from "@/lib/comptable/money";
import {
  genererANouveaux,
  ClotureImpossibleError,
  type LigneAReprendre,
} from "@/lib/comptable/cloture";
import { getExercice } from "./exercices";
import { creerBrouillon, validerEcritureEnBase } from "./ecritures";

/**
 * Clôture d'exercice.
 *
 * Deux gestes en un : reprendre dans l'exercice suivant ce que le bilan porte
 * à la clôture — les à-nouveaux —, puis figer l'exercice clos. Le second ne
 * va pas sans le premier : un exercice clos sans reprise laisserait le
 * suivant partir de rien.
 *
 * Aucune écriture de clôture n'est passée dans l'exercice clos. Les comptes
 * de gestion y restent tels quels, et c'est voulu : le compte de résultat et
 * le tableau des flux doivent se relire identiques avant et après clôture.
 * Le résultat entre au bilan par les à-nouveaux du suivant, au 131 ou au 139.
 */

export type ControlesCloture = {
  exercice: { id: number; libelle: string; statut: string };
  suivant: { id: number; libelle: string; statut: string; aNouveauxDeja: boolean } | null;
  brouillons: number;
  rapprochementsOuverts: number;
  balanceEquilibree: boolean;
  /** Vide si tout est en ordre ; sinon, ce qui empêche la clôture. */
  obstacles: string[];
};

/** Ce qui doit être vrai pour clôturer, exposé tel quel à l'écran. */
export async function controlerCloture(exerciceId: number): Promise<ControlesCloture> {
  const exercice = await getExercice(exerciceId);
  const obstacles: string[] = [];

  if (exercice.statut !== "OUVERT") {
    obstacles.push(`L'exercice est déjà ${exercice.statut === "CLOS" ? "clos" : "verrouillé"}.`);
  }

  const [suivant] = await db
    .select()
    .from(cptaExercices)
    .where(eq(cptaExercices.exercicePrecedentId, exerciceId))
    .limit(1);

  let aNouveauxDeja = false;
  if (!suivant) {
    obstacles.push("Aucun exercice suivant n'est ouvert : ouvrez-le d'abord, il recevra les à-nouveaux.");
  } else {
    if (suivant.statut !== "OUVERT") obstacles.push("L'exercice suivant n'est pas ouvert.");
    const [{ n }] = await db
      .select({ n: count() })
      .from(cptaEcritures)
      .where(and(eq(cptaEcritures.exerciceId, suivant.id), eq(cptaEcritures.origine, "A_NOUVEAUX")));
    aNouveauxDeja = n > 0;
    if (aNouveauxDeja) obstacles.push("L'exercice suivant porte déjà des à-nouveaux.");
  }

  const [{ n: brouillons }] = await db
    .select({ n: count() })
    .from(cptaEcritures)
    .where(and(eq(cptaEcritures.exerciceId, exerciceId), eq(cptaEcritures.statut, "BROUILLON")));
  if (brouillons > 0) {
    obstacles.push(
      `${brouillons} brouillon${brouillons > 1 ? "s" : ""} en attente : validez-le${brouillons > 1 ? "s" : ""} ou supprimez-le${brouillons > 1 ? "s" : ""}.`,
    );
  }

  const [{ n: rapprochementsOuverts }] = await db
    .select({ n: count() })
    .from(cptaRapprochements)
    .where(and(eq(cptaRapprochements.exerciceId, exerciceId), eq(cptaRapprochements.cloture, false)));
  if (rapprochementsOuverts > 0) {
    obstacles.push("Un rapprochement bancaire est encore en cours : clôturez-le ou supprimez-le.");
  }

  const [totaux] = await db
    .select({
      debit: sql<string>`coalesce(sum(${cptaLignesEcriture.debit}), 0)`,
      credit: sql<string>`coalesce(sum(${cptaLignesEcriture.credit}), 0)`,
    })
    .from(cptaLignesEcriture)
    .innerJoin(cptaEcritures, eq(cptaLignesEcriture.ecritureId, cptaEcritures.id))
    .where(and(eq(cptaEcritures.exerciceId, exerciceId), ne(cptaEcritures.statut, "BROUILLON")));
  const balanceEquilibree = parseMontant(totaux.debit) === parseMontant(totaux.credit);
  if (!balanceEquilibree) obstacles.push("La balance n'est pas équilibrée : la base contient une écriture incomplète.");

  return {
    exercice: { id: exercice.id, libelle: exercice.libelle, statut: exercice.statut },
    suivant: suivant
      ? { id: suivant.id, libelle: suivant.libelle, statut: suivant.statut, aNouveauxDeja }
      : null,
    brouillons,
    rapprochementsOuverts,
    balanceEquilibree,
    obstacles,
  };
}

/** Les lignes validées de l'exercice, avec ce que leur reprise doit savoir. */
export async function lignesAReprendre(exerciceId: number): Promise<LigneAReprendre[]> {
  const rows = await db
    .select({
      ligneId: cptaLignesEcriture.id,
      compteId: cptaLignesEcriture.compteId,
      compteNumero: cptaComptes.numero,
      lettrable: cptaComptes.lettrable,
      rapprochable: cptaComptes.rapprochable,
      tiersId: cptaLignesEcriture.tiersId,
      libelle: sql<string | null>`coalesce(${cptaLignesEcriture.libelle}, ${cptaEcritures.libelle})`,
      dateEcheance: cptaLignesEcriture.dateEcheance,
      debit: cptaLignesEcriture.debit,
      credit: cptaLignesEcriture.credit,
      lettrage: cptaLignesEcriture.lettrage,
      pointee: sql<boolean>`exists (
        select 1 from cpta_rapprochement_lignes rl
        where rl.ligne_ecriture_id = ${cptaLignesEcriture.id}
      )`,
    })
    .from(cptaLignesEcriture)
    .innerJoin(cptaEcritures, eq(cptaLignesEcriture.ecritureId, cptaEcritures.id))
    .innerJoin(cptaComptes, eq(cptaLignesEcriture.compteId, cptaComptes.id))
    .where(and(eq(cptaEcritures.exerciceId, exerciceId), ne(cptaEcritures.statut, "BROUILLON")));

  return rows.map((r) => ({
    ...r,
    debit: parseMontant(r.debit),
    credit: parseMontant(r.credit),
  }));
}

/**
 * Clôture l'exercice : à-nouveaux dans le suivant, puis statut CLOS.
 *
 * Les deux étapes ne tiennent pas dans une seule transaction — la création et
 * la validation d'écriture ont la leur. Si la seconde échouait après la
 * première, le contrôle « le suivant porte déjà des à-nouveaux » empêcherait
 * de rejouer la reprise, et l'exercice se passerait en CLOS depuis l'écran
 * des exercices. L'écriture d'à-nouveaux désigne l'exercice clos par
 * `origine_id` : c'est ce lien qui interdit ensuite de le rouvrir.
 */
export async function cloturerExercice(exerciceId: number, userId: number | null) {
  const controles = await controlerCloture(exerciceId);
  if (controles.obstacles.length > 0) {
    throw conflict(controles.obstacles.join(" "));
  }
  const suivant = controles.suivant!;
  const exercice = await getExercice(exerciceId);

  const comptes = await db
    .select({ id: cptaComptes.id, numero: cptaComptes.numero })
    .from(cptaComptes)
    .where(and(eq(cptaComptes.contribuableId, exercice.contribuableId)));
  const parNumero = new Map(comptes.map((c) => [c.numero, c.id]));
  const beneficeId = parNumero.get("131");
  const perteId = parNumero.get("139");
  if (!beneficeId || !perteId) {
    throw badRequest("Le plan comptable n'a pas de compte 131 et 139 pour recevoir le résultat.");
  }

  const [journalAN] = await db
    .select()
    .from(cptaJournaux)
    .where(and(eq(cptaJournaux.contribuableId, exercice.contribuableId), eq(cptaJournaux.type, "A_NOUVEAUX")))
    .limit(1);
  if (!journalAN) throw badRequest("Aucun journal d'à-nouveaux pour ce contribuable.");

  let aNouveaux;
  try {
    aNouveaux = genererANouveaux(await lignesAReprendre(exerciceId), { beneficeId, perteId });
  } catch (e) {
    if (e instanceof ClotureImpossibleError) throw conflict(e.message);
    throw e;
  }

  let ecriture = null;
  if (aNouveaux.lignes.length > 0) {
    const brouillon = await creerBrouillon(
      {
        exerciceId: suivant.id,
        journalId: journalAN.id,
        dateEcriture: (await getExercice(suivant.id)).dateDebut,
        libelle: `À-nouveaux — reprise de ${exercice.libelle}`,
        reference: exercice.libelle,
        origine: "A_NOUVEAUX",
        origineId: exercice.id,
        lignes: aNouveaux.lignes,
      },
      userId,
    );
    ecriture = await validerEcritureEnBase(brouillon.id, userId);
  }

  const [clos] = await db
    .update(cptaExercices)
    .set({ statut: "CLOS", clotureLe: new Date(), cloturePar: userId, updatedAt: new Date() })
    .where(eq(cptaExercices.id, exerciceId))
    .returning();

  return {
    exercice: clos,
    suivant: { id: suivant.id, libelle: suivant.libelle },
    aNouveaux: {
      ecritureId: ecriture?.id ?? null,
      numeroPiece: ecriture?.numeroPiece ?? null,
      lignes: aNouveaux.lignes.length,
      lignesDetaillees: aNouveaux.lignesDetaillees,
      resultatNet: aNouveaux.resultatNet,
      totalDebit: aNouveaux.totalDebit,
    },
  };
}

/** Vrai si un exercice suivant porte des à-nouveaux repris de celui-ci. */
export async function aEteRepris(exerciceId: number) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(cptaEcritures)
    .where(and(eq(cptaEcritures.origine, "A_NOUVEAUX"), eq(cptaEcritures.origineId, exerciceId)));
  return n > 0;
}

