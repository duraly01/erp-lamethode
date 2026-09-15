import "server-only";
import { and, asc, desc, eq, inArray, lte, ne, or, like } from "drizzle-orm";
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
import { badRequest, conflict, notFound } from "@/lib/http";
import { formatMontant, parseMontant, appliquerTaux } from "@/lib/comptable/money";
import { BudgetError, controleBudgetaire, moisEntames, mensualiser, type LigneBudget, type Realise } from "@/lib/comptable/budget";
import { jourAuCameroun } from "@/lib/dates";
import { getExercice } from "./exercices";

/**
 * Budgets et contrôle budgétaire.
 *
 * Un budget se construit ligne par ligne — un compte de charge ou de
 * produit, une section de l'axe s'il en a un, un montant annuel — puis se
 * valide ; validé, il ne bouge plus, et c'est lui que le contrôle confronte
 * au réalisé. Pour réviser, on en crée un autre.
 */

export type LigneBudgetSaisie = {
  compteId: number;
  sectionId?: number | null;
  montantAnnuel: string | number;
  mensualisation?: number[] | null;
  commentaire?: string | null;
};

function nbMoisDe(exercice: { dateDebut: string; dateFin: string }) {
  return moisEntames(exercice.dateDebut, exercice.dateFin);
}

async function budgetOuErreur(budgetId: number) {
  const [b] = await db.select().from(cptaBudgets).where(eq(cptaBudgets.id, budgetId));
  if (!b) throw notFound("Budget introuvable.");
  return b;
}

async function budgetModifiable(budgetId: number) {
  const b = await budgetOuErreur(budgetId);
  if (b.statut !== "BROUILLON") throw conflict("Ce budget est validé : il ne se modifie plus. Créez-en une révision.");
  return b;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function listerBudgets(exerciceId: number) {
  return db
    .select({
      id: cptaBudgets.id,
      exerciceId: cptaBudgets.exerciceId,
      libelle: cptaBudgets.libelle,
      axeId: cptaBudgets.axeId,
      axeCode: cptaAxesAnalytiques.code,
      statut: cptaBudgets.statut,
      notes: cptaBudgets.notes,
      createdAt: cptaBudgets.createdAt,
    })
    .from(cptaBudgets)
    .leftJoin(cptaAxesAnalytiques, eq(cptaBudgets.axeId, cptaAxesAnalytiques.id))
    .where(eq(cptaBudgets.exerciceId, exerciceId))
    .orderBy(desc(cptaBudgets.id));
}

export async function getBudget(budgetId: number) {
  const b = await budgetOuErreur(budgetId);
  const exercice = await getExercice(b.exerciceId);
  const lignes = await db
    .select({
      id: cptaBudgetLignes.id,
      compteId: cptaBudgetLignes.compteId,
      compteNumero: cptaComptes.numero,
      compteLibelle: cptaComptes.libelle,
      sectionId: cptaBudgetLignes.sectionId,
      sectionCode: cptaSectionsAnalytiques.code,
      montantAnnuel: cptaBudgetLignes.montantAnnuel,
      mensualisation: cptaBudgetLignes.mensualisation,
      commentaire: cptaBudgetLignes.commentaire,
    })
    .from(cptaBudgetLignes)
    .innerJoin(cptaComptes, eq(cptaBudgetLignes.compteId, cptaComptes.id))
    .leftJoin(cptaSectionsAnalytiques, eq(cptaBudgetLignes.sectionId, cptaSectionsAnalytiques.id))
    .where(eq(cptaBudgetLignes.budgetId, budgetId))
    .orderBy(asc(cptaComptes.numero), asc(cptaSectionsAnalytiques.code));
  const charges = lignes.filter((l) => l.compteNumero.startsWith("6")).reduce((t, l) => t + parseMontant(l.montantAnnuel), 0);
  const produits = lignes.filter((l) => l.compteNumero.startsWith("7")).reduce((t, l) => t + parseMontant(l.montantAnnuel), 0);
  return {
    ...b,
    exercice: { id: exercice.id, libelle: exercice.libelle, dateDebut: exercice.dateDebut, dateFin: exercice.dateFin, nbMois: nbMoisDe(exercice) },
    lignes,
    totaux: { charges: formatMontant(charges), produits: formatMontant(produits), resultat: formatMontant(produits - charges) },
  };
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

export async function creerBudget(input: { exerciceId: number; libelle: string; axeId?: number | null; notes?: string | null }, userId: number | null) {
  const exercice = await getExercice(input.exerciceId);
  if (input.axeId) {
    const [axe] = await db
      .select({ id: cptaAxesAnalytiques.id })
      .from(cptaAxesAnalytiques)
      .where(and(eq(cptaAxesAnalytiques.id, input.axeId), eq(cptaAxesAnalytiques.contribuableId, exercice.contribuableId)));
    if (!axe) throw notFound("Axe analytique introuvable pour ce contribuable.");
  }
  const [b] = await db
    .insert(cptaBudgets)
    .values({ exerciceId: input.exerciceId, libelle: input.libelle.trim(), axeId: input.axeId ?? null, notes: input.notes ?? null, createdBy: userId })
    .returning();
  return getBudget(b.id);
}

export async function modifierBudget(budgetId: number, input: { libelle?: string; notes?: string | null }) {
  await budgetModifiable(budgetId);
  await db
    .update(cptaBudgets)
    .set({ ...(input.libelle !== undefined ? { libelle: input.libelle.trim() } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}), updatedAt: new Date() })
    .where(eq(cptaBudgets.id, budgetId));
  return getBudget(budgetId);
}

export async function validerBudget(budgetId: number) {
  const b = await budgetModifiable(budgetId);
  const [premiere] = await db.select({ id: cptaBudgetLignes.id }).from(cptaBudgetLignes).where(eq(cptaBudgetLignes.budgetId, b.id)).limit(1);
  if (!premiere) throw badRequest("Un budget vide ne se valide pas.");
  await db.update(cptaBudgets).set({ statut: "VALIDE", updatedAt: new Date() }).where(eq(cptaBudgets.id, budgetId));
  return getBudget(budgetId);
}

export async function supprimerBudget(budgetId: number) {
  await budgetModifiable(budgetId);
  await db.delete(cptaBudgets).where(eq(cptaBudgets.id, budgetId));
}

/**
 * Remplace toutes les lignes du budget. Chaque ligne désigne un compte de
 * charge ou de produit du contribuable et, si le budget a un axe, l'une de
 * ses sections ; un même couple ne figure qu'une fois.
 */
export async function remplacerLignes(budgetId: number, lignes: LigneBudgetSaisie[]) {
  const b = await budgetModifiable(budgetId);
  const exercice = await getExercice(b.exerciceId);
  const nbMois = nbMoisDe(exercice);

  const comptes = lignes.length
    ? await db
        .select({ id: cptaComptes.id, numero: cptaComptes.numero, contribuableId: cptaComptes.contribuableId })
        .from(cptaComptes)
        .where(inArray(cptaComptes.id, [...new Set(lignes.map((l) => l.compteId))]))
    : [];
  const comptesParId = new Map(comptes.filter((c) => c.contribuableId === exercice.contribuableId).map((c) => [c.id, c]));
  const sections = b.axeId ? await db.select({ id: cptaSectionsAnalytiques.id }).from(cptaSectionsAnalytiques).where(eq(cptaSectionsAnalytiques.axeId, b.axeId)) : [];
  const sectionIds = new Set(sections.map((s) => s.id));

  const vues = new Set<string>();
  const valeurs = lignes.map((l) => {
    const compte = comptesParId.get(l.compteId);
    if (!compte) throw notFound("Un compte au moins est introuvable pour ce contribuable.");
    if (!/^[678]/.test(compte.numero)) throw badRequest(`Le compte ${compte.numero} n'est ni une charge ni un produit : un budget ne porte que sur les classes 6, 7 et 8.`);
    const sectionId = l.sectionId ?? null;
    if (sectionId !== null && !sectionIds.has(sectionId)) throw badRequest(`Le compte ${compte.numero} désigne une section qui n'est pas de l'axe du budget.`);
    const k = `${l.compteId}|${sectionId ?? ""}`;
    if (vues.has(k)) throw badRequest(`Le compte ${compte.numero} figure deux fois pour la même section.`);
    vues.add(k);
    const montant = parseMontant(l.montantAnnuel);
    try {
      mensualiser(montant, nbMois, l.mensualisation ?? null);
    } catch (e) {
      if (e instanceof BudgetError) throw badRequest(`${compte.numero} : ${e.message}`);
      throw e;
    }
    return { budgetId, compteId: l.compteId, sectionId, montantAnnuel: formatMontant(montant), mensualisation: l.mensualisation ?? null, commentaire: l.commentaire ?? null };
  });

  await db.transaction(async (tx) => {
    await tx.delete(cptaBudgetLignes).where(eq(cptaBudgetLignes.budgetId, budgetId));
    if (valeurs.length > 0) await tx.insert(cptaBudgetLignes).values(valeurs);
    await tx.update(cptaBudgets).set({ updatedAt: new Date() }).where(eq(cptaBudgets.id, budgetId));
  });
  return getBudget(budgetId);
}

// ---------------------------------------------------------------------------
// Réalisé
// ---------------------------------------------------------------------------

/**
 * Le réalisé des comptes de gestion jusqu'à une date, net dans son sens —
 * une charge au débit, un produit au crédit —, découpé par section de l'axe
 * du budget quand il en a un, le reste non ventilé à part.
 */
async function realiseJusquAu(exerciceId: number, axeId: number | null, jusquAu: string): Promise<Realise[]> {
  const lignes = await db
    .select({
      ligneId: cptaLignesEcriture.id,
      compteNumero: cptaComptes.numero,
      compteLibelle: cptaComptes.libelle,
      debit: cptaLignesEcriture.debit,
      credit: cptaLignesEcriture.credit,
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
  const ventilations =
    axeId && lignes.length > 0
      ? await db
          .select({ ligneId: cptaVentilationsAnalytiques.ligneId, sectionId: cptaVentilationsAnalytiques.sectionId, montant: cptaVentilationsAnalytiques.montant })
          .from(cptaVentilationsAnalytiques)
          .innerJoin(cptaSectionsAnalytiques, eq(cptaVentilationsAnalytiques.sectionId, cptaSectionsAnalytiques.id))
          .where(and(eq(cptaSectionsAnalytiques.axeId, axeId), inArray(cptaVentilationsAnalytiques.ligneId, lignes.map((l) => l.ligneId))))
      : [];

  const realises: Realise[] = [];
  for (const l of lignes) {
    const debit = parseMontant(l.debit);
    const credit = parseMontant(l.credit);
    const charge = l.compteNumero.startsWith("6") || (l.compteNumero.startsWith("8") && Number(l.compteNumero[1]) % 2 === 1);
    // Le sens de la ligne, et son signe dans la nature du compte.
    const brut = debit > 0 ? debit : credit;
    const signe = (debit > 0 ? 1 : -1) * (charge ? 1 : -1);
    let ventile = 0;
    for (const v of ventilations.filter((v) => v.ligneId === l.ligneId)) {
      const m = parseMontant(v.montant);
      ventile += m;
      realises.push({ compteNumero: l.compteNumero, compteLibelle: l.compteLibelle, sectionId: v.sectionId, montant: signe * m });
    }
    if (brut - ventile !== 0) realises.push({ compteNumero: l.compteNumero, compteLibelle: l.compteLibelle, sectionId: null, montant: signe * (brut - ventile) });
  }
  return realises;
}

export async function controleBudget(budgetId: number, jusquAu?: string) {
  const b = await budgetOuErreur(budgetId);
  const exercice = await getExercice(b.exerciceId);
  const date = jusquAu ?? (jourAuCameroun() < exercice.dateFin ? jourAuCameroun() : exercice.dateFin);
  if (date < exercice.dateDebut || date > exercice.dateFin) throw badRequest("La date de contrôle doit être dans l'exercice.");
  const detail = await getBudget(budgetId);
  const lignes: LigneBudget[] = detail.lignes.map((l) => ({
    id: l.id,
    compteNumero: l.compteNumero,
    compteLibelle: l.compteLibelle,
    sectionId: l.sectionId,
    montantAnnuel: parseMontant(l.montantAnnuel),
    mensualisation: l.mensualisation,
  }));
  const realises = await realiseJusquAu(b.exerciceId, b.axeId, date);
  const c = controleBudgetaire(lignes, realises, nbMoisDe(exercice), moisEntames(exercice.dateDebut, date));
  const sections = b.axeId ? await db.select({ id: cptaSectionsAnalytiques.id, code: cptaSectionsAnalytiques.code, libelle: cptaSectionsAnalytiques.libelle }).from(cptaSectionsAnalytiques).where(eq(cptaSectionsAnalytiques.axeId, b.axeId)) : [];
  const m = formatMontant;
  const totaux = (t: typeof c.charges) => ({ budgetAnnuel: m(t.budgetAnnuel), budgetADate: m(t.budgetADate), realise: m(t.realise), ecart: m(t.ecart) });
  return {
    budget: { id: b.id, libelle: b.libelle, statut: b.statut, axeId: b.axeId },
    exercice: { id: exercice.id, libelle: exercice.libelle },
    jusquAu: date,
    moisEcoules: c.moisEcoules,
    nbMois: c.nbMois,
    sections,
    lignes: c.lignes.map((l) => ({ ...l, budgetAnnuel: m(l.budgetAnnuel), budgetADate: m(l.budgetADate), realise: m(l.realise), ecart: m(l.ecart) })),
    charges: totaux(c.charges),
    produits: totaux(c.produits),
    resultat: totaux(c.resultat),
  };
}

// ---------------------------------------------------------------------------
// Initialisation depuis le réalisé
// ---------------------------------------------------------------------------

/**
 * Remplit un budget en brouillon avec le réalisé d'un exercice — celui
 * d'avant, d'ordinaire — multiplié par un coefficient : « comme l'an
 * dernier plus 5 % ». Les lignes existantes sont remplacées.
 */
export async function initialiserDepuisRealise(budgetId: number, exerciceSourceId: number, coefficientPct: string | number) {
  const b = await budgetModifiable(budgetId);
  const cible = await getExercice(b.exerciceId);
  const source = await getExercice(exerciceSourceId);
  if (source.contribuableId !== cible.contribuableId) throw badRequest("L'exercice source n'est pas celui du même contribuable.");
  const realises = await realiseJusquAu(source.id, b.axeId, source.dateFin);
  const parCle = new Map<string, { compteNumero: string; sectionId: number | null; montant: number }>();
  for (const r of realises) {
    const k = `${r.compteNumero}|${r.sectionId ?? ""}`;
    const e = parCle.get(k);
    if (e) e.montant += r.montant;
    else parCle.set(k, { compteNumero: r.compteNumero, sectionId: r.sectionId, montant: r.montant });
  }
  const comptes = await db
    .select({ id: cptaComptes.id, numero: cptaComptes.numero })
    .from(cptaComptes)
    .where(and(eq(cptaComptes.contribuableId, cible.contribuableId), eq(cptaComptes.actif, true)));
  const idParNumero = new Map(comptes.map((c) => [c.numero, c.id]));
  const lignes: LigneBudgetSaisie[] = [];
  for (const v of parCle.values()) {
    if (v.montant <= 0) continue;
    const compteId = idParNumero.get(v.compteNumero);
    if (!compteId) continue;
    lignes.push({ compteId, sectionId: v.sectionId, montantAnnuel: formatMontant(appliquerTaux(v.montant, coefficientPct)) });
  }
  if (lignes.length === 0) throw badRequest(`L'exercice ${source.libelle} n'a aucun réalisé à reprendre.`);
  return remplacerLignes(budgetId, lignes);
}

