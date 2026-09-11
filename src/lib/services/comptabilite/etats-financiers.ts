import "server-only";
import {
  calculerEtatsFinanciers,
  type Bilan,
  type CompteResultat,
  type CompteNonRattache,
  type LigneBilan,
  type LigneResultat,
} from "@/lib/comptable/etats-financiers";
import { RATTACHEMENTS_A_CONFIRMER } from "@/lib/comptable/postes-syscohada";
import { regrouperEnSmt, type EtatsSmt } from "@/lib/comptable/etats-smt";
import { getBalance, type FiltrePeriode } from "./restitutions";
import { getExercice } from "./exercices";

/**
 * Bilan et compte de résultat d'un exercice.
 *
 * Comme la balance dont ils se déduisent, ces états sont recalculés à chaque
 * appel : rien n'est figé en base, donc rien ne peut diverger des écritures.
 * L'état n'est pas un document qu'on produit une fois, c'est une vue.
 */

/** Un poste, accompagné du montant du même poste à l'exercice précédent. */
export type LigneBilanComparee = LigneBilan & { netPrecedent: number | null };
export type LigneResultatComparee = LigneResultat & {
  montantPrecedent: number | null;
};

export type EtatsFinanciersExercice = {
  exercice: Awaited<ReturnType<typeof getExercice>>;
  /** Exercice de comparaison, quand il existe. */
  exercicePrecedent: { id: number; libelle: string } | null;
  bilan: Omit<Bilan, "actif" | "passif"> & {
    actif: LigneBilanComparee[];
    passif: LigneBilanComparee[];
  };
  resultat: Omit<CompteResultat, "lignes"> & {
    lignes: LigneResultatComparee[];
  };
  comptesNonRattaches: CompteNonRattache[];
  /**
   * Présentation du système minimal de trésorerie, déduite des mêmes états.
   *
   * Toujours calculée, quel que soit le système de l'exercice : c'est l'écran
   * qui choisit laquelle montrer en premier. Un dossier qui bascule d'un
   * système à l'autre n'a ainsi rien à recalculer.
   */
  smt: EtatsSmt;
  smtPrecedent: EtatsSmt | null;
  /**
   * Rattachements en attente de validation par l'expert-comptable, repris tels
   * quels du moteur. Ils accompagnent l'état plutôt que sa documentation : un
   * lecteur de la liasse doit les voir sans avoir à les chercher.
   */
  rattachementsAConfirmer: typeof RATTACHEMENTS_A_CONFIRMER;
};

/**
 * États financiers de l'exercice, avec la colonne de comparaison N-1.
 *
 * Le comparatif est celui du modèle SYSCOHADA : chaque poste porte le montant
 * de l'exercice précédent. Il se calcule sur l'exercice entier, même si la
 * période demandée est plus courte — comparer un trimestre à une année serait
 * trompeur, alors on compare toujours des exercices.
 *
 * Sans exercice précédent rattaché, la colonne vaut `null` partout : un zéro
 * affirmerait qu'il n'y avait rien, alors qu'on ne sait simplement pas.
 */
export async function getEtatsFinanciers(
  exerciceId: number,
  periode: FiltrePeriode = {},
): Promise<EtatsFinanciersExercice> {
  const { exercice, lignes } = await getBalance(exerciceId, periode);
  const etats = calculerEtatsFinanciers(lignes);

  const precedent = exercice.exercicePrecedentId
    ? await getEtatsPrecedent(exercice.exercicePrecedentId)
    : null;

  return {
    exercice,
    exercicePrecedent: precedent
      ? { id: precedent.exercice.id, libelle: precedent.exercice.libelle }
      : null,
    bilan: {
      ...etats.bilan,
      actif: comparerBilan(etats.bilan.actif, precedent?.bilan.actif),
      passif: comparerBilan(etats.bilan.passif, precedent?.bilan.passif),
    },
    resultat: {
      ...etats.resultat,
      lignes: comparerResultat(
        etats.resultat.lignes,
        precedent?.resultat.lignes,
      ),
    },
    comptesNonRattaches: etats.comptesNonRattaches,
    smt: regrouperEnSmt(etats),
    smtPrecedent: precedent ? regrouperEnSmt(precedent) : null,
    rattachementsAConfirmer: RATTACHEMENTS_A_CONFIRMER,
  };
}

/**
 * États de l'exercice précédent, sur son exercice entier.
 *
 * Volontairement non récursif : on ne remonte qu'un cran. Une chaîne
 * d'exercices mal rattachés — un exercice se désignant lui-même comme
 * précédent, par exemple — ferait sinon boucler la requête.
 */
async function getEtatsPrecedent(exerciceId: number) {
  const { exercice, lignes } = await getBalance(exerciceId);
  return { exercice, ...calculerEtatsFinanciers(lignes) };
}

function comparerBilan(
  lignes: LigneBilan[],
  precedentes: LigneBilan[] | undefined,
): LigneBilanComparee[] {
  const parCode = new Map((precedentes ?? []).map((l) => [l.code, l]));
  return lignes.map((l) => ({
    ...l,
    netPrecedent: precedentes ? (parCode.get(l.code)?.net ?? 0) : null,
  }));
}

function comparerResultat(
  lignes: LigneResultat[],
  precedentes: LigneResultat[] | undefined,
): LigneResultatComparee[] {
  const parCode = new Map((precedentes ?? []).map((l) => [l.code, l]));
  return lignes.map((l) => ({
    ...l,
    montantPrecedent: precedentes
      ? (parCode.get(l.code)?.montant ?? 0)
      : null,
  }));
}
