import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cptaComptes,
  cptaEcritures,
  cptaExercices,
  cptaJournaux,
  cptaLignesEcriture,
  cptaSequences,
} from "@/db/schema";
import { HttpError, badRequest, conflict, notFound } from "@/lib/http";
import { jourAuCameroun } from "@/lib/dates";
import { formatMontant, parseMontant } from "@/lib/comptable/money";
import {
  validerEcriture,
  construireContrepassation,
  formaterNumeroPiece,
  type CompteContexte,
  type EcritureSaisie,
  type LigneSaisie,
  type ErreurEcriture,
} from "@/lib/comptable/ecriture";

/**
 * Persistance des écritures comptables.
 *
 * Les règles de validité vivent dans `lib/comptable/ecriture.ts`, qui ne
 * connaît pas la base. Ce fichier ne fait que rassembler ce dont ces règles ont
 * besoin, appeler la validation, et écrire le résultat — dans une transaction,
 * de sorte qu'une écriture soit numérotée et enregistrée toutes deux ou pas du
 * tout.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EntreeEcriture = {
  exerciceId: number;
  journalId: number;
  dateEcriture: string;
  libelle: string;
  reference?: string | null;
  documentId?: number | null;
  lignes: Array<{
    compteId: number;
    tiersId?: number | null;
    libelle?: string | null;
    debit?: string | number | null;
    credit?: string | number | null;
    dateEcheance?: string | null;
  }>;
};

/** 422 portant le détail des erreurs, pour que l'interface les place ligne à ligne. */
function erreursDeValidation(erreurs: ErreurEcriture[]) {
  return new HttpError(
    422,
    "ecriture_invalide",
    "L'écriture ne peut pas être validée.",
    erreurs,
  );
}

// ---------------------------------------------------------------------------
// Contexte de validation
// ---------------------------------------------------------------------------

/**
 * Rassemble l'exercice et les comptes cités par les lignes.
 *
 * Seuls les comptes réellement utilisés sont chargés : un plan comptable
 * complet dépasse 180 lignes, et une écriture en cite trois ou quatre.
 */
async function chargerContexte(
  tx: Tx | typeof db,
  exerciceId: number,
  compteIds: number[],
) {
  const [exercice] = await tx
    .select()
    .from(cptaExercices)
    .where(eq(cptaExercices.id, exerciceId));
  if (!exercice) throw notFound("Exercice introuvable.");

  const ids = [...new Set(compteIds)];
  const comptes = ids.length
    ? await tx
        .select({
          id: cptaComptes.id,
          numero: cptaComptes.numero,
          collectif: cptaComptes.collectif,
          actif: cptaComptes.actif,
          contribuableId: cptaComptes.contribuableId,
        })
        .from(cptaComptes)
        .where(inArray(cptaComptes.id, ids))
    : [];

  // Un compte appartenant à un autre contribuable est traité comme inexistant :
  // le cloisonnement ne doit jamais dépendre du seul filtrage de l'appelant.
  const duContribuable = comptes.filter(
    (c) => c.contribuableId === exercice.contribuableId,
  );

  const map = new Map<number, CompteContexte>(
    duContribuable.map((c) => [
      c.id,
      { id: c.id, numero: c.numero, collectif: c.collectif, actif: c.actif },
    ]),
  );

  return { exercice, comptes: map };
}

/** Le journal appartient-il bien au contribuable de l'exercice ? */
async function assertJournalDuContribuable(
  tx: Tx | typeof db,
  journalId: number,
  contribuableId: number,
) {
  const [journal] = await tx
    .select({
      id: cptaJournaux.id,
      code: cptaJournaux.code,
      actif: cptaJournaux.actif,
      contribuableId: cptaJournaux.contribuableId,
    })
    .from(cptaJournaux)
    .where(eq(cptaJournaux.id, journalId));

  if (!journal || journal.contribuableId !== contribuableId) {
    throw notFound("Journal introuvable pour ce contribuable.");
  }
  if (!journal.actif) throw badRequest("Ce journal est désactivé.");
  return journal;
}

// ---------------------------------------------------------------------------
// Brouillons
// ---------------------------------------------------------------------------

/**
 * Enregistre une écriture au brouillon.
 *
 * La validation complète n'est pas exigée ici : un brouillon a précisément pour
 * objet d'être incomplet ou déséquilibré le temps de la saisie. Seul le cadre
 * est contrôlé — exercice ouvert, journal du bon contribuable — pour ne pas
 * laisser créer un brouillon qui ne pourra jamais être validé.
 */
export async function creerBrouillon(input: EntreeEcriture, userId: number | null) {
  const { exercice } = await chargerContexte(db, input.exerciceId, []);
  if (exercice.statut !== "OUVERT") {
    throw conflict("L'exercice n'est pas ouvert : aucune saisie n'y est possible.");
  }
  await assertJournalDuContribuable(db, input.journalId, exercice.contribuableId);

  return db.transaction(async (tx) => {
    const [ecriture] = await tx
      .insert(cptaEcritures)
      .values({
        exerciceId: input.exerciceId,
        journalId: input.journalId,
        dateEcriture: input.dateEcriture,
        libelle: input.libelle,
        reference: input.reference ?? null,
        documentId: input.documentId ?? null,
        statut: "BROUILLON",
        origine: "MANUELLE",
        createdBy: userId,
      })
      .returning();

    await remplacerLignes(tx, ecriture.id, input.lignes);
    return ecriture;
  });
}

/** Remplace intégralement les lignes d'une écriture au brouillon. */
async function remplacerLignes(
  tx: Tx,
  ecritureId: number,
  lignes: EntreeEcriture["lignes"],
) {
  await tx
    .delete(cptaLignesEcriture)
    .where(eq(cptaLignesEcriture.ecritureId, ecritureId));

  if (lignes.length === 0) return;

  await tx.insert(cptaLignesEcriture).values(
    lignes.map((l, i) => ({
      ecritureId,
      ordre: i,
      compteId: l.compteId,
      tiersId: l.tiersId ?? null,
      libelle: l.libelle ?? null,
      debit: formatMontant(parseMontant(l.debit)),
      credit: formatMontant(parseMontant(l.credit)),
      dateEcheance: l.dateEcheance ?? null,
    })),
  );
}

export async function modifierBrouillon(
  ecritureId: number,
  input: Omit<EntreeEcriture, "exerciceId">,
) {
  const ecriture = await getEcriture(ecritureId);
  assertModifiable(ecriture.statut);

  const { exercice } = await chargerContexte(db, ecriture.exerciceId, []);
  if (exercice.statut !== "OUVERT") {
    throw conflict("L'exercice n'est pas ouvert : aucune modification n'y est possible.");
  }
  await assertJournalDuContribuable(db, input.journalId, exercice.contribuableId);

  return db.transaction(async (tx) => {
    const [maj] = await tx
      .update(cptaEcritures)
      .set({
        journalId: input.journalId,
        dateEcriture: input.dateEcriture,
        libelle: input.libelle,
        reference: input.reference ?? null,
        documentId: input.documentId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(cptaEcritures.id, ecritureId))
      .returning();

    await remplacerLignes(tx, ecritureId, input.lignes);
    return maj;
  });
}

export async function supprimerBrouillon(ecritureId: number) {
  const ecriture = await getEcriture(ecritureId);
  assertModifiable(ecriture.statut);
  // Les lignes suivent par ON DELETE CASCADE.
  await db.delete(cptaEcritures).where(eq(cptaEcritures.id, ecritureId));
}

/**
 * Une écriture validée est immuable. Ce n'est pas une précaution d'usage : sans
 * cette règle, le grand livre cesserait d'être une trace et deviendrait un
 * simple état courant, réécrivable après coup.
 */
function assertModifiable(statut: string) {
  if (statut !== "BROUILLON") {
    throw conflict(
      "Cette écriture est validée : elle ne peut plus être modifiée ni supprimée. Contre-passez-la.",
    );
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Fait passer une écriture du brouillon au validé, et lui attribue son numéro.
 *
 * Tout se joue dans une seule transaction : contrôles, incrément du compteur,
 * écriture du numéro. Si quoi que ce soit échoue, le compteur revient en
 * arrière avec le reste — ce qu'une séquence PostgreSQL ne ferait pas, et c'est
 * précisément pour cela que la numérotation repose sur une table.
 */
export async function validerEcritureEnBase(
  ecritureId: number,
  userId: number | null,
) {
  return db.transaction(async (tx) => {
    const [ecriture] = await tx
      .select()
      .from(cptaEcritures)
      .where(eq(cptaEcritures.id, ecritureId));
    if (!ecriture) throw notFound("Écriture introuvable.");
    if (ecriture.statut !== "BROUILLON") {
      throw conflict("Cette écriture est déjà validée.");
    }

    const lignes = await tx
      .select()
      .from(cptaLignesEcriture)
      .where(eq(cptaLignesEcriture.ecritureId, ecritureId))
      .orderBy(asc(cptaLignesEcriture.ordre));

    const ctx = await chargerContexte(
      tx,
      ecriture.exerciceId,
      lignes.map((l) => l.compteId),
    );

    const saisie: EcritureSaisie = {
      dateEcriture: ecriture.dateEcriture,
      libelle: ecriture.libelle,
      lignes: lignes.map<LigneSaisie>((l) => ({
        compteId: l.compteId,
        tiersId: l.tiersId,
        libelle: l.libelle,
        debit: l.debit,
        credit: l.credit,
      })),
    };

    const erreurs = validerEcriture(saisie, ctx);
    if (erreurs.length > 0) throw erreursDeValidation(erreurs);

    const numeroPiece = await prochainNumeroPiece(
      tx,
      ecriture.exerciceId,
      ecriture.journalId,
      ctx.exercice.dateDebut,
    );

    const [maj] = await tx
      .update(cptaEcritures)
      .set({
        statut: "VALIDEE",
        numeroPiece,
        validePar: userId,
        valideLe: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(cptaEcritures.id, ecritureId))
      .returning();

    return maj;
  });
}

/**
 * Consomme un numéro sur le compteur du journal, pour cet exercice.
 *
 * L'incrément et la lecture se font dans une seule instruction : c'est ce qui
 * rend l'opération sûre lorsque deux collaborateurs valident au même instant.
 * `ON CONFLICT` couvre le cas d'un compteur absent — un journal créé après
 * l'ouverture de l'exercice — sans qu'il faille le prévoir ailleurs.
 */
async function prochainNumeroPiece(
  tx: Tx,
  exerciceId: number,
  journalId: number,
  dateDebutExercice: string,
): Promise<string> {
  const [journal] = await tx
    .select({ code: cptaJournaux.code })
    .from(cptaJournaux)
    .where(eq(cptaJournaux.id, journalId));

  const prefixeParDefaut = `${journal?.code ?? "OD"}${dateDebutExercice.slice(0, 4)}-`;

  const [seq] = await tx
    .insert(cptaSequences)
    .values({
      exerciceId,
      journalId,
      prefixe: prefixeParDefaut,
      dernierNumero: 1,
    })
    .onConflictDoUpdate({
      target: [cptaSequences.exerciceId, cptaSequences.journalId],
      set: { dernierNumero: sql`${cptaSequences.dernierNumero} + 1` },
    })
    .returning({
      prefixe: cptaSequences.prefixe,
      dernierNumero: cptaSequences.dernierNumero,
    });

  return formaterNumeroPiece(seq.prefixe, seq.dernierNumero);
}

// ---------------------------------------------------------------------------
// Contre-passation
// ---------------------------------------------------------------------------

/**
 * Annule une écriture validée en enregistrant son inverse.
 *
 * Les deux écritures restent visibles au grand livre : l'origine, l'annulation,
 * et le lien entre elles. C'est la seule correction possible, et c'est ce qui
 * fait de la comptabilité une trace vérifiable plutôt qu'un état modifiable.
 *
 * La contre-passation est datée du jour de la correction, non de l'écriture
 * d'origine — sauf demande explicite, car reculer la date reviendrait à
 * modifier un exercice déjà arrêté.
 */
export async function contrepasserEcriture(
  ecritureId: number,
  userId: number | null,
  dateContrepassation?: string,
) {
  return db.transaction(async (tx) => {
    const [origine] = await tx
      .select()
      .from(cptaEcritures)
      .where(eq(cptaEcritures.id, ecritureId));
    if (!origine) throw notFound("Écriture introuvable.");
    if (origine.statut !== "VALIDEE") {
      throw conflict(
        origine.statut === "BROUILLON"
          ? "Un brouillon se supprime, il ne se contre-passe pas."
          : "Cette écriture a déjà été contre-passée.",
      );
    }

    const lignes = await tx
      .select()
      .from(cptaLignesEcriture)
      .where(eq(cptaLignesEcriture.ecritureId, ecritureId))
      .orderBy(asc(cptaLignesEcriture.ordre));

    const ctx = await chargerContexte(
      tx,
      origine.exerciceId,
      lignes.map((l) => l.compteId),
    );
    if (ctx.exercice.statut !== "OUVERT") {
      throw conflict(
        "L'exercice n'est pas ouvert : la contre-passation doit être portée sur un exercice ouvert.",
      );
    }

    const date = dateContrepassation ?? jourAuCameroun();
    const inversees = construireContrepassation(
      lignes.map<LigneSaisie>((l) => ({
        compteId: l.compteId,
        tiersId: l.tiersId,
        libelle: l.libelle,
        debit: l.debit,
        credit: l.credit,
      })),
    );

    const erreurs = validerEcriture(
      {
        dateEcriture: date,
        libelle: `Contre-passation de ${origine.numeroPiece ?? origine.id}`,
        lignes: inversees.map<LigneSaisie>((l) => ({
          compteId: l.compteId,
          tiersId: l.tiersId,
          libelle: l.libelle,
          debit: formatMontant(l.debit),
          credit: formatMontant(l.credit),
        })),
      },
      ctx,
    );
    if (erreurs.length > 0) throw erreursDeValidation(erreurs);

    const numeroPiece = await prochainNumeroPiece(
      tx,
      origine.exerciceId,
      origine.journalId,
      ctx.exercice.dateDebut,
    );

    const [contre] = await tx
      .insert(cptaEcritures)
      .values({
        exerciceId: origine.exerciceId,
        journalId: origine.journalId,
        numeroPiece,
        dateEcriture: date,
        libelle: `Contre-passation de ${origine.numeroPiece ?? origine.id}`,
        reference: origine.reference,
        statut: "VALIDEE",
        origine: origine.origine,
        origineId: origine.origineId,
        contrepasseEcritureId: origine.id,
        createdBy: userId,
        validePar: userId,
        valideLe: new Date(),
      })
      .returning();

    await tx.insert(cptaLignesEcriture).values(
      inversees.map((l, i) => ({
        ecritureId: contre.id,
        ordre: i,
        compteId: l.compteId,
        tiersId: l.tiersId,
        libelle: l.libelle,
        debit: formatMontant(l.debit),
        credit: formatMontant(l.credit),
      })),
    );

    await tx
      .update(cptaEcritures)
      .set({ statut: "CONTREPASSEE", updatedAt: new Date() })
      .where(eq(cptaEcritures.id, origine.id));

    return contre;
  });
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function getEcriture(ecritureId: number) {
  const [ecriture] = await db
    .select()
    .from(cptaEcritures)
    .where(eq(cptaEcritures.id, ecritureId));
  if (!ecriture) throw notFound("Écriture introuvable.");
  return ecriture;
}

export async function getEcritureComplete(ecritureId: number) {
  const ecriture = await getEcriture(ecritureId);
  const lignes = await db
    .select()
    .from(cptaLignesEcriture)
    .where(eq(cptaLignesEcriture.ecritureId, ecritureId))
    .orderBy(asc(cptaLignesEcriture.ordre));
  return { ...ecriture, lignes };
}

/** Écritures d'un journal pour un exercice, brouillons compris. */
export async function listerEcritures(exerciceId: number, journalId?: number) {
  return db
    .select()
    .from(cptaEcritures)
    .where(
      journalId
        ? and(
            eq(cptaEcritures.exerciceId, exerciceId),
            eq(cptaEcritures.journalId, journalId),
          )
        : eq(cptaEcritures.exerciceId, exerciceId),
    )
    .orderBy(asc(cptaEcritures.dateEcriture), asc(cptaEcritures.id));
}
