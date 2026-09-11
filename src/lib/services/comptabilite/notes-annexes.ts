import "server-only";
import {
  calculerNotesAnnexes,
  type NotesAnnexes,
} from "@/lib/comptable/notes-annexes";
import { getBalance } from "./restitutions";
import { getExercice } from "./exercices";

/**
 * Notes annexes de l'exercice.
 *
 * Même découpage que le tableau des flux : les à-nouveaux donnent l'ouverture,
 * le reste donne les mouvements. Une note de mouvements montre ainsi ce qui
 * est entré et sorti dans l'année, et non un cumul depuis l'origine.
 */
export type NotesAnnexesExercice = NotesAnnexes & {
  exercice: Awaited<ReturnType<typeof getExercice>>;
  sansANouveaux: boolean;
};

export async function getNotesAnnexes(
  exerciceId: number,
): Promise<NotesAnnexesExercice> {
  const exercice = await getExercice(exerciceId);

  const [ouverture, mouvements] = await Promise.all([
    getBalance(exerciceId, { typeJournal: "A_NOUVEAUX" }),
    getBalance(exerciceId, { horsTypeJournal: "A_NOUVEAUX" }),
  ]);

  return {
    exercice,
    sansANouveaux: ouverture.lignes.length === 0,
    ...calculerNotesAnnexes(ouverture.lignes, mouvements.lignes),
  };
}
