import "server-only";
import { and, desc, eq, lte, gte, count } from "drizzle-orm";
import { db } from "@/db";
import {
  contribuables,
  cptaComptes,
  cptaEcritures,
  cptaExercices,
  cptaJournaux,
  cptaSequences,
  cptaTaxes,
} from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/http";
import {
  PLAN_SYSCOHADA,
  JOURNAUX_PAR_DEFAUT,
  TAXES_PAR_DEFAUT,
} from "@/lib/comptable/plan-syscohada";

/**
 * Ouverture d'exercice — le point d'entrée de toute la comptabilité d'un
 * contribuable.
 *
 * Le premier exercice ouvert dépose aussi le référentiel : plan comptable
 * SYSCOHADA, journaux et taxes. Les exercices suivants les réutilisent, car le
 * plan appartient au contribuable et non à l'année : un compte créé en 2026
 * doit rester le même compte en 2027, sans quoi aucune comparaison entre
 * exercices ne serait possible.
 */

export type OuvertureExercice = {
  contribuableId: number;
  libelle: string;
  /** Bornes incluses, au format ISO `AAAA-MM-JJ`. */
  dateDebut: string;
  dateFin: string;
  systeme?: "NORMAL" | "SMT";
};

const FORMAT_DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function ouvrirExercice(input: OuvertureExercice) {
  if (
    !FORMAT_DATE_ISO.test(input.dateDebut) ||
    !FORMAT_DATE_ISO.test(input.dateFin)
  ) {
    throw badRequest("Les dates doivent être au format AAAA-MM-JJ.");
  }
  if (input.dateFin <= input.dateDebut) {
    throw badRequest("La date de fin doit être postérieure à la date de début.");
  }

  const [ctb] = await db
    .select({ id: contribuables.id })
    .from(contribuables)
    .where(eq(contribuables.id, input.contribuableId));
  if (!ctb) throw notFound("Contribuable introuvable.");

  // Deux exercices d'un même contribuable ne peuvent pas se chevaucher : une
  // écriture appartiendrait alors à deux exercices à la fois.
  const [{ n: chevauchements }] = await db
    .select({ n: count() })
    .from(cptaExercices)
    .where(
      and(
        eq(cptaExercices.contribuableId, input.contribuableId),
        lte(cptaExercices.dateDebut, input.dateFin),
        gte(cptaExercices.dateFin, input.dateDebut),
      ),
    );
  if (chevauchements > 0) {
    throw conflict(
      "Un exercice existe déjà sur cette période pour ce contribuable.",
    );
  }

  return db.transaction(async (tx) => {
    const [precedent] = await tx
      .select({ id: cptaExercices.id })
      .from(cptaExercices)
      .where(eq(cptaExercices.contribuableId, input.contribuableId))
      .orderBy(desc(cptaExercices.dateFin))
      .limit(1);

    const [exercice] = await tx
      .insert(cptaExercices)
      .values({
        contribuableId: input.contribuableId,
        libelle: input.libelle,
        dateDebut: input.dateDebut,
        dateFin: input.dateFin,
        systeme: input.systeme ?? "NORMAL",
        exercicePrecedentId: precedent?.id ?? null,
      })
      .returning();

    // Le référentiel n'est déposé qu'une fois par contribuable.
    const [{ n: comptesExistants }] = await tx
      .select({ n: count() })
      .from(cptaComptes)
      .where(eq(cptaComptes.contribuableId, input.contribuableId));

    if (comptesExistants === 0) {
      await deposerReferentiel(tx, input.contribuableId, input.dateDebut);
    }

    await creerSequences(tx, exercice.id, input.contribuableId, input.dateDebut);

    return exercice;
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Copie le plan comptable SYSCOHADA, les journaux et les taxes de référence
 * dans le référentiel propre au contribuable, qui pourra ensuite l'adapter.
 */
async function deposerReferentiel(
  tx: Tx,
  contribuableId: number,
  dateDebutExercice: string,
) {
  const comptes = await tx
    .insert(cptaComptes)
    .values(
      PLAN_SYSCOHADA.map((c) => ({
        contribuableId,
        numero: c.numero,
        libelle: c.libelle,
        classe: c.classe,
        type: c.type,
        collectif: c.collectif ?? false,
        lettrable: c.lettrable ?? false,
        rapprochable: c.rapprochable ?? false,
      })),
    )
    .returning({ id: cptaComptes.id, numero: cptaComptes.numero });

  const parNumero = new Map(comptes.map((c) => [c.numero, c.id]));

  await tx.insert(cptaJournaux).values(
    JOURNAUX_PAR_DEFAUT.map((j) => ({
      contribuableId,
      code: j.code,
      libelle: j.libelle,
      type: j.type,
      compteContrepartieId: j.compteContrepartie
        ? (parNumero.get(j.compteContrepartie) ?? null)
        : null,
    })),
  );

  // Les taxes de référence portent leur propre date d'entrée en vigueur. Un
  // exercice antérieur à celle-ci n'aurait aucun taux applicable : on rétracte
  // alors la validité au début de l'exercice, faute de mieux, plutôt que de
  // livrer un référentiel inutilisable.
  await tx.insert(cptaTaxes).values(
    TAXES_PAR_DEFAUT.map((t) => ({
      contribuableId,
      code: t.code,
      libelle: t.libelle,
      taux: t.taux,
      type: t.type,
      compteId: parNumero.get(t.compte) ?? null,
      valideDu:
        t.valideDu <= dateDebutExercice ? t.valideDu : dateDebutExercice,
    })),
  );
}

/**
 * Crée un compteur de pièces par journal pour l'exercice.
 *
 * Le préfixe reprend le code du journal et l'année, ce qui donne des numéros
 * lisibles et triables : « VE2026-00007 ».
 */
async function creerSequences(
  tx: Tx,
  exerciceId: number,
  contribuableId: number,
  dateDebut: string,
) {
  const journaux = await tx
    .select({ id: cptaJournaux.id, code: cptaJournaux.code })
    .from(cptaJournaux)
    .where(eq(cptaJournaux.contribuableId, contribuableId));

  if (journaux.length === 0) return;

  const annee = dateDebut.slice(0, 4);
  await tx.insert(cptaSequences).values(
    journaux.map((j) => ({
      exerciceId,
      journalId: j.id,
      prefixe: `${j.code}${annee}-`,
    })),
  );
}

/**
 * Change le statut d'un exercice.
 *
 * La clôture est réversible tant que l'exercice n'est pas verrouillé : un
 * exercice se referme souvent plusieurs fois avant que la liasse ne soit
 * déposée. Le verrouillage, lui, est définitif du point de vue de
 * l'application — le rouvrir suppose une intervention en base, ce qui est
 * exactement la friction recherchée.
 */
export async function changerStatutExercice(
  exerciceId: number,
  statut: "OUVERT" | "CLOS" | "VERROUILLE",
  userId: number | null,
) {
  const [exercice] = await db
    .select()
    .from(cptaExercices)
    .where(eq(cptaExercices.id, exerciceId));
  if (!exercice) throw notFound("Exercice introuvable.");

  if (exercice.statut === "VERROUILLE" && statut !== "VERROUILLE") {
    throw conflict(
      "Cet exercice est verrouillé : sa réouverture ne peut pas se faire depuis l'application.",
    );
  }

  // Une fois ses soldes repris dans l'exercice suivant, rouvrir un exercice
  // permettrait d'y saisir ce que les à-nouveaux ne refléteraient plus.
  if (statut === "OUVERT" && exercice.statut === "CLOS") {
    const [{ n }] = await db
      .select({ n: count() })
      .from(cptaEcritures)
      .where(and(eq(cptaEcritures.origine, "A_NOUVEAUX"), eq(cptaEcritures.origineId, exerciceId)));
    if (n > 0) {
      throw conflict(
        "Cet exercice a été clôturé et ses à-nouveaux repris dans le suivant : il ne se rouvre plus.",
      );
    }
  }

  const [maj] = await db
    .update(cptaExercices)
    .set({
      statut,
      clotureLe: statut === "OUVERT" ? null : new Date(),
      cloturePar: statut === "OUVERT" ? null : userId,
      updatedAt: new Date(),
    })
    .where(eq(cptaExercices.id, exerciceId))
    .returning();

  return maj;
}

/** Exercices d'un contribuable, du plus récent au plus ancien. */
export async function listerExercices(contribuableId: number) {
  return db
    .select()
    .from(cptaExercices)
    .where(eq(cptaExercices.contribuableId, contribuableId))
    .orderBy(desc(cptaExercices.dateDebut));
}

export async function getExercice(exerciceId: number) {
  const [exercice] = await db
    .select()
    .from(cptaExercices)
    .where(eq(cptaExercices.id, exerciceId));
  if (!exercice) throw notFound("Exercice introuvable.");
  return exercice;
}
