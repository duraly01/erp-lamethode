import "server-only";
import { and, desc, eq, inArray, like, lte, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  cptaAxesAnalytiques,
  cptaBudgetLignes,
  cptaBudgets,
  cptaComptes,
  cptaEcritures,
  cptaLignesEcriture,
  cptaSectionsAnalytiques,
  cptaVentilationsAnalytiques,
} from "@/db/schema";
import { badRequest, notFound } from "@/lib/http";
import { moisEntames } from "@/lib/comptable/budget";
import { parseMontant } from "@/lib/comptable/money";
import { calculerPilotage, type BudgetPilotage, type MouvementDate } from "@/lib/comptable/pilotage";
import { jourAuCameroun } from "@/lib/dates";
import { getExercice } from "./exercices";

/**
 * Tableau de bord de gestion mensuel (A1, docs/23).
 *
 * Le réalisé se lit dans les lignes d'écriture des classes 6, 7 et 8. Filtré
 * sur une section analytique, seule la part ventilée sur cette section
 * compte — le reste n'est pas « ailleurs », il est non ventilé, et un
 * résultat par site ne peut pas le lui attribuer.
 */

type FiltrePilotage = {
  jusquAu?: string;
  sectionId?: number;
  budgetId?: number;
};

async function sectionDuContribuable(sectionId: number, contribuableId: number) {
  const [s] = await db
    .select({ id: cptaSectionsAnalytiques.id, axeId: cptaSectionsAnalytiques.axeId, code: cptaSectionsAnalytiques.code, libelle: cptaSectionsAnalytiques.libelle })
    .from(cptaSectionsAnalytiques)
    .innerJoin(cptaAxesAnalytiques, eq(cptaSectionsAnalytiques.axeId, cptaAxesAnalytiques.id))
    .where(and(eq(cptaSectionsAnalytiques.id, sectionId), eq(cptaAxesAnalytiques.contribuableId, contribuableId)));
  if (!s) throw notFound("Section analytique introuvable pour ce contribuable.");
  return s;
}

async function mouvementsDeGestion(exerciceId: number, jusquAu: string, sectionId: number | null): Promise<MouvementDate[]> {
  const lignes = await db
    .select({
      ligneId: cptaLignesEcriture.id,
      compteId: cptaLignesEcriture.compteId,
      compteNumero: cptaComptes.numero,
      compteLibelle: cptaComptes.libelle,
      debit: cptaLignesEcriture.debit,
      credit: cptaLignesEcriture.credit,
      dateEcriture: cptaEcritures.dateEcriture,
    })
    .from(cptaLignesEcriture)
    .innerJoin(cptaEcritures, eq(cptaLignesEcriture.ecritureId, cptaEcritures.id))
    .innerJoin(cptaComptes, eq(cptaLignesEcriture.compteId, cptaComptes.id))
    .where(
      and(
        eq(cptaEcritures.exerciceId, exerciceId),
        ne(cptaEcritures.statut, "BROUILLON"),
        lte(cptaEcritures.dateEcriture, jusquAu),
        or(like(cptaComptes.numero, "6%"), like(cptaComptes.numero, "7%"), like(cptaComptes.numero, "8%")),
      ),
    );

  if (sectionId === null || lignes.length === 0) return lignes;

  const ventilations = await db
    .select({ ligneId: cptaVentilationsAnalytiques.ligneId, montant: cptaVentilationsAnalytiques.montant })
    .from(cptaVentilationsAnalytiques)
    .where(and(eq(cptaVentilationsAnalytiques.sectionId, sectionId), inArray(cptaVentilationsAnalytiques.ligneId, lignes.map((l) => l.ligneId))));
  const partParLigne = new Map(ventilations.map((v) => [v.ligneId, v.montant]));

  // La part ventilée remplace le montant de la ligne, dans son sens.
  return lignes.flatMap((l) => {
    const part = partParLigne.get(l.ligneId);
    if (part === undefined) return [];
    const auDebit = parseMontant(l.debit) > 0;
    return [{ ...l, debit: auDebit ? part : 0, credit: auDebit ? 0 : part }];
  });
}

/**
 * Le budget à confronter : celui demandé, sinon le dernier validé de
 * l'exercice. Filtré sur une section, un budget ne sert que s'il est bâti
 * sur l'axe de cette section ; ses lignes sont alors celles de la section.
 */
async function budgetDeReference(exerciceId: number, budgetId: number | undefined, section: { id: number; axeId: number } | null, nbMois: number) {
  const [b] = budgetId
    ? await db.select().from(cptaBudgets).where(and(eq(cptaBudgets.id, budgetId), eq(cptaBudgets.exerciceId, exerciceId)))
    : await db.select().from(cptaBudgets).where(and(eq(cptaBudgets.exerciceId, exerciceId), eq(cptaBudgets.statut, "VALIDE"))).orderBy(desc(cptaBudgets.id)).limit(1);
  if (budgetId && !b) throw notFound("Budget introuvable pour cet exercice.");
  if (!b) return { budget: null, lignes: null as BudgetPilotage | null };
  if (section && b.axeId !== section.axeId) return { budget: null, lignes: null as BudgetPilotage | null };

  const conditions = [eq(cptaBudgetLignes.budgetId, b.id)];
  if (section) conditions.push(eq(cptaBudgetLignes.sectionId, section.id));
  const lignes = await db
    .select({ compteNumero: cptaComptes.numero, montantAnnuel: cptaBudgetLignes.montantAnnuel, mensualisation: cptaBudgetLignes.mensualisation })
    .from(cptaBudgetLignes)
    .innerJoin(cptaComptes, eq(cptaBudgetLignes.compteId, cptaComptes.id))
    .where(and(...conditions));

  return {
    budget: { id: b.id, libelle: b.libelle, statut: b.statut, axeId: b.axeId },
    lignes: { nbMois, lignes: lignes.map((l) => ({ compteNumero: l.compteNumero, montantAnnuel: parseMontant(l.montantAnnuel), mensualisation: l.mensualisation })) },
  };
}

export async function getPilotage(exerciceId: number, filtre: FiltrePilotage = {}) {
  const exercice = await getExercice(exerciceId);
  const aujourdhui = jourAuCameroun();
  const jusquAu = filtre.jusquAu ?? (aujourdhui < exercice.dateFin ? (aujourdhui > exercice.dateDebut ? aujourdhui : exercice.dateDebut) : exercice.dateFin);
  if (jusquAu < exercice.dateDebut || jusquAu > exercice.dateFin) throw badRequest("La date doit être dans l'exercice.");

  const section = filtre.sectionId ? await sectionDuContribuable(filtre.sectionId, exercice.contribuableId) : null;
  const nbMois = moisEntames(exercice.dateDebut, exercice.dateFin);
  const [mouvements, { budget, lignes: budgetLignes }] = await Promise.all([
    mouvementsDeGestion(exerciceId, jusquAu, section?.id ?? null),
    budgetDeReference(exerciceId, filtre.budgetId, section, nbMois),
  ]);

  const pilotage = calculerPilotage(exercice, mouvements, jusquAu, budgetLignes);

  return {
    exercice: { id: exercice.id, libelle: exercice.libelle, dateDebut: exercice.dateDebut, dateFin: exercice.dateFin },
    jusquAu,
    section: section ? { id: section.id, axeId: section.axeId, code: section.code, libelle: section.libelle } : null,
    budget,
    ...pilotage,
  };
}
