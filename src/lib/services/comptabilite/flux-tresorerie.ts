import "server-only";
import {
  calculerFluxTresorerie,
  type FluxTresorerie,
} from "@/lib/comptable/flux-tresorerie";
import { getBalance } from "./restitutions";
import { getExercice } from "./exercices";

/**
 * Tableau des flux de trésorerie d'un exercice.
 *
 * L'ouverture est le bilan repris par les à-nouveaux ; les flux sont tout ce
 * qui a été passé ailleurs. Un premier exercice sans à-nouveaux part d'une
 * trésorerie nulle, et l'apport en capital y figure comme le flux de
 * financement qu'il est.
 *
 * Aucun recours à l'exercice précédent : les à-nouveaux *sont* la reprise, et
 * lire le bilan N-1 à la place exposerait à un désaccord entre les deux si la
 * reprise avait été ajustée.
 */
export type FluxTresorerieExercice = FluxTresorerie & {
  exercice: Awaited<ReturnType<typeof getExercice>>;
  /** Vrai quand aucune écriture d'à-nouveaux n'existe : l'ouverture est à zéro. */
  sansANouveaux: boolean;
};

export async function getFluxTresorerie(
  exerciceId: number,
): Promise<FluxTresorerieExercice> {
  const exercice = await getExercice(exerciceId);

  const [ouverture, mouvements] = await Promise.all([
    getBalance(exerciceId, { typeJournal: "A_NOUVEAUX" }),
    getBalance(exerciceId, { horsTypeJournal: "A_NOUVEAUX" }),
  ]);

  return {
    exercice,
    sansANouveaux: ouverture.lignes.length === 0,
    ...calculerFluxTresorerie(ouverture.lignes, mouvements.lignes),
  };
}
