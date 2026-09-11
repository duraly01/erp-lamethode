import "server-only";
import { and, asc, desc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cptaComptes,
  cptaEcritures,
  cptaLignesEcriture,
  cptaRapprochementLignes,
  cptaRapprochements,
  cptaTiers,
} from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/http";
import { formatMontant, parseMontant } from "@/lib/comptable/money";
import {
  calculerRapprochement,
  proposerPointage,
  type LigneBancaire,
} from "@/lib/comptable/rapprochement";
import { getExercice } from "./exercices";

/**
 * Rapprochement bancaire : persistance du pointage.
 *
 * Un rapprochement est l'état d'un compte de banque à une date, face à un
 * relevé. Les lignes pointées le restent : un chèque retrouvé sur le relevé de
 * mars n'a pas à être repointé en avril. Le pointage est donc porté par la
 * ligne d'écriture, via le rapprochement qui l'a constaté, et non par le
 * rapprochement du mois.
 *
 * Limite connue : les lignes d'un exercice antérieur ne sont pas visibles ici.
 * Un chèque émis en décembre et payé en janvier figure dans les à-nouveaux
 * sous forme de solde, non de ligne — il faudra le traiter par l'écart.
 */

export type EntreeRapprochement = {
  exerciceId: number;
  compteId: number;
  dateRapprochement: string;
  soldeReleve: string | number;
};

async function chargerCompteBancaire(compteId: number, contribuableId: number) {
  const [compte] = await db
    .select()
    .from(cptaComptes)
    .where(and(eq(cptaComptes.id, compteId), eq(cptaComptes.contribuableId, contribuableId)));
  if (!compte) throw notFound("Compte introuvable pour ce contribuable.");
  if (!compte.rapprochable) {
    throw badRequest(
      `Le compte ${compte.numero} n'est pas marqué comme rapprochable : seul un compte de trésorerie suivi par relevé se rapproche.`,
    );
  }
  return compte;
}

/** Solde comptable du compte à une date, sur les écritures validées de l'exercice. */
async function soldeComptableAu(exerciceId: number, compteId: number, date: string) {
  const [r] = await db
    .select({
      debit: sql<string>`coalesce(sum(${cptaLignesEcriture.debit}), 0)`,
      credit: sql<string>`coalesce(sum(${cptaLignesEcriture.credit}), 0)`,
    })
    .from(cptaLignesEcriture)
    .innerJoin(cptaEcritures, eq(cptaLignesEcriture.ecritureId, cptaEcritures.id))
    .where(
      and(
        eq(cptaEcritures.exerciceId, exerciceId),
        eq(cptaLignesEcriture.compteId, compteId),
        ne(cptaEcritures.statut, "BROUILLON"),
        lte(cptaEcritures.dateEcriture, date),
      ),
    );
  return parseMontant(r.debit) - parseMontant(r.credit);
}

/**
 * Les lignes du compte jusqu'à la date, avec leur pointage.
 *
 * Une ligne est pointée si un rapprochement **de ce compte** l'a retenue —
 * celui-ci ou un précédent. C'est pourquoi la jointure passe par les
 * rapprochements du compte, et non par le seul rapprochement demandé.
 */
async function lignesDuCompte(
  exerciceId: number,
  compteId: number,
  date: string,
): Promise<LigneBancaire[]> {
  const rows = await db
    .select({
      ligneId: cptaLignesEcriture.id,
      ecritureId: cptaEcritures.id,
      dateEcriture: cptaEcritures.dateEcriture,
      numeroPiece: cptaEcritures.numeroPiece,
      libelle: sql<string | null>`coalesce(${cptaLignesEcriture.libelle}, ${cptaEcritures.libelle})`,
      tiersLibelle: cptaTiers.raisonSociale,
      debit: cptaLignesEcriture.debit,
      credit: cptaLignesEcriture.credit,
      pointeeDans: sql<number | null>`(
        select rl.rapprochement_id
        from cpta_rapprochement_lignes rl
        join cpta_rapprochements r on r.id = rl.rapprochement_id
        where rl.ligne_ecriture_id = ${cptaLignesEcriture.id}
          and r.compte_id = ${compteId}
        limit 1
      )`,
    })
    .from(cptaLignesEcriture)
    .innerJoin(cptaEcritures, eq(cptaLignesEcriture.ecritureId, cptaEcritures.id))
    .leftJoin(cptaTiers, eq(cptaLignesEcriture.tiersId, cptaTiers.id))
    .where(
      and(
        eq(cptaEcritures.exerciceId, exerciceId),
        eq(cptaLignesEcriture.compteId, compteId),
        ne(cptaEcritures.statut, "BROUILLON"),
        lte(cptaEcritures.dateEcriture, date),
      ),
    )
    .orderBy(asc(cptaEcritures.dateEcriture), asc(cptaLignesEcriture.id));

  return rows.map((r) => ({
    ligneId: r.ligneId,
    ecritureId: r.ecritureId,
    dateEcriture: r.dateEcriture,
    numeroPiece: r.numeroPiece,
    libelle: r.libelle,
    tiersLibelle: r.tiersLibelle,
    debit: parseMontant(r.debit),
    credit: parseMontant(r.credit),
    pointee: r.pointeeDans !== null,
  }));
}

// ---------------------------------------------------------------------------

export async function listerRapprochements(exerciceId: number, compteId: number) {
  return db
    .select()
    .from(cptaRapprochements)
    .where(and(eq(cptaRapprochements.exerciceId, exerciceId), eq(cptaRapprochements.compteId, compteId)))
    .orderBy(desc(cptaRapprochements.dateRapprochement), desc(cptaRapprochements.id));
}

/**
 * Ouvre un rapprochement.
 *
 * Un seul rapprochement ouvert par compte : deux pointages en parallèle sur le
 * même compte se contrediraient. Le précédent doit être clôturé — ou supprimé
 * s'il a été ouvert par erreur.
 */
export async function creerRapprochement(input: EntreeRapprochement, userId: number | null) {
  const exercice = await getExercice(input.exerciceId);
  if (exercice.statut !== "OUVERT") {
    throw conflict("L'exercice n'est pas ouvert : aucun rapprochement ne peut y être créé.");
  }
  await chargerCompteBancaire(input.compteId, exercice.contribuableId);

  if (input.dateRapprochement < exercice.dateDebut || input.dateRapprochement > exercice.dateFin) {
    throw badRequest("La date du rapprochement doit être comprise dans l'exercice.");
  }

  const [ouvert] = await db
    .select({ id: cptaRapprochements.id, date: cptaRapprochements.dateRapprochement })
    .from(cptaRapprochements)
    .where(and(eq(cptaRapprochements.compteId, input.compteId), eq(cptaRapprochements.cloture, false)))
    .limit(1);
  if (ouvert) {
    throw conflict(
      `Un rapprochement de ce compte est déjà en cours (au ${ouvert.date}). Clôturez-le avant d'en ouvrir un autre.`,
    );
  }

  const soldeComptable = await soldeComptableAu(input.exerciceId, input.compteId, input.dateRapprochement);
  const soldeReleve = parseMontant(input.soldeReleve);
  const lignes = await lignesDuCompte(input.exerciceId, input.compteId, input.dateRapprochement);
  const etat = calculerRapprochement(soldeComptable, soldeReleve, lignes);

  const [r] = await db
    .insert(cptaRapprochements)
    .values({
      exerciceId: input.exerciceId,
      compteId: input.compteId,
      dateRapprochement: input.dateRapprochement,
      soldeReleve: formatMontant(soldeReleve),
      soldeComptable: formatMontant(soldeComptable),
      ecart: formatMontant(etat.ecart),
      createdBy: userId,
    })
    .returning();
  return r;
}

export async function getRapprochement(id: number) {
  const [r] = await db.select().from(cptaRapprochements).where(eq(cptaRapprochements.id, id));
  if (!r) throw notFound("Rapprochement introuvable.");

  const [compte] = await db.select().from(cptaComptes).where(eq(cptaComptes.id, r.compteId));

  // Le solde comptable est relu à chaque fois : une écriture passée depuis
  // l'ouverture du rapprochement — les frais bancaires qu'on vient de saisir
  // pour expliquer l'écart — doit s'y refléter sans rien rouvrir.
  const soldeComptable = await soldeComptableAu(r.exerciceId, r.compteId, r.dateRapprochement);
  const lignes = await lignesDuCompte(r.exerciceId, r.compteId, r.dateRapprochement);
  const etat = calculerRapprochement(soldeComptable, parseMontant(r.soldeReleve), lignes);

  return {
    rapprochement: r,
    compte: { id: compte.id, numero: compte.numero, libelle: compte.libelle },
    etat,
    proposition: r.cloture ? null : proposerPointage(etat),
  };
}

/** Réécrit l'écart persistant d'après l'état courant. */
async function actualiserEcart(id: number) {
  const { etat } = await getRapprochement(id);
  await db
    .update(cptaRapprochements)
    .set({ soldeComptable: formatMontant(etat.soldeComptable), ecart: formatMontant(etat.ecart) })
    .where(eq(cptaRapprochements.id, id));
  return etat;
}

async function exigerOuvert(id: number) {
  const [r] = await db.select().from(cptaRapprochements).where(eq(cptaRapprochements.id, id));
  if (!r) throw notFound("Rapprochement introuvable.");
  if (r.cloture) throw conflict("Ce rapprochement est clôturé : son pointage ne se modifie plus.");
  return r;
}

/**
 * Pointe ou dépointe des lignes.
 *
 * Une ligne ne se pointe que si elle appartient au compte et n'est pas
 * postérieure à la date du rapprochement — sinon on pointerait sur un relevé
 * une opération qu'il ne peut pas contenir. Une ligne déjà pointée dans un
 * autre rapprochement est refusée : la banque ne l'a vue qu'une fois.
 */
export async function pointer(id: number, ligneIds: number[], pointer: boolean) {
  const r = await exigerOuvert(id);
  if (ligneIds.length === 0) return actualiserEcart(id);

  if (!pointer) {
    await db
      .delete(cptaRapprochementLignes)
      .where(
        and(
          eq(cptaRapprochementLignes.rapprochementId, id),
          inArray(cptaRapprochementLignes.ligneEcritureId, ligneIds),
        ),
      );
    return actualiserEcart(id);
  }

  const eligibles = await db
    .select({ id: cptaLignesEcriture.id })
    .from(cptaLignesEcriture)
    .innerJoin(cptaEcritures, eq(cptaLignesEcriture.ecritureId, cptaEcritures.id))
    .where(
      and(
        inArray(cptaLignesEcriture.id, ligneIds),
        eq(cptaLignesEcriture.compteId, r.compteId),
        eq(cptaEcritures.exerciceId, r.exerciceId),
        ne(cptaEcritures.statut, "BROUILLON"),
        lte(cptaEcritures.dateEcriture, r.dateRapprochement),
      ),
    );
  if (eligibles.length !== ligneIds.length) {
    throw badRequest(
      "Certaines lignes n'appartiennent pas à ce compte, sont postérieures au relevé, ou sont encore au brouillon.",
    );
  }

  const dejaAilleurs = await db
    .select({ ligneId: cptaRapprochementLignes.ligneEcritureId })
    .from(cptaRapprochementLignes)
    .innerJoin(cptaRapprochements, eq(cptaRapprochementLignes.rapprochementId, cptaRapprochements.id))
    .where(
      and(
        inArray(cptaRapprochementLignes.ligneEcritureId, ligneIds),
        eq(cptaRapprochements.compteId, r.compteId),
        ne(cptaRapprochements.id, id),
      ),
    );
  if (dejaAilleurs.length > 0) {
    throw conflict("Une ligne au moins est déjà pointée dans un autre rapprochement de ce compte.");
  }

  await db
    .insert(cptaRapprochementLignes)
    .values(ligneIds.map((ligneEcritureId) => ({ rapprochementId: id, ligneEcritureId })))
    .onConflictDoNothing();

  return actualiserEcart(id);
}

export async function modifierSoldeReleve(id: number, soldeReleve: string | number) {
  await exigerOuvert(id);
  await db
    .update(cptaRapprochements)
    .set({ soldeReleve: formatMontant(parseMontant(soldeReleve)) })
    .where(eq(cptaRapprochements.id, id));
  return actualiserEcart(id);
}

/**
 * Clôture le rapprochement : le pointage devient définitif.
 *
 * Refusé tant qu'un écart subsiste. Un rapprochement qu'on clôture avec un
 * écart n'en est pas un — c'est un écart qu'on a décidé d'oublier.
 */
export async function cloturerRapprochement(id: number) {
  await exigerOuvert(id);
  const etat = await actualiserEcart(id);
  if (!etat.juste) {
    throw conflict(
      `Un écart de ${formatMontant(etat.ecart)} subsiste : expliquez-le par une écriture ou un pointage avant de clôturer.`,
    );
  }
  const [r] = await db
    .update(cptaRapprochements)
    .set({ cloture: true })
    .where(eq(cptaRapprochements.id, id))
    .returning();
  return r;
}

/** Supprime un rapprochement ouvert, et libère les lignes qu'il avait pointées. */
export async function supprimerRapprochement(id: number) {
  await exigerOuvert(id);
  await db.delete(cptaRapprochements).where(eq(cptaRapprochements.id, id));
}
