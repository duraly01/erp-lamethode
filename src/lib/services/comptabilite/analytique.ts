import "server-only";
import { and, asc, desc, eq, inArray, ne, or, like, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cptaAxesAnalytiques,
  cptaComptes,
  cptaEcritures,
  cptaExercices,
  cptaJournaux,
  cptaLignesEcriture,
  cptaSectionsAnalytiques,
  cptaVentilationsAnalytiques,
} from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/http";
import { formatMontant, parseMontant } from "@/lib/comptable/money";
import { restitutionParSection, validerVentilation, VentilationError, type LigneAnalytique } from "@/lib/comptable/analytique";
import { getExercice } from "./exercices";

/**
 * Comptabilité analytique : axes, sections, ventilation des lignes de
 * charges et de produits, et restitution par section.
 *
 * Seules les lignes validées se ventilent — un brouillon se réécrit à
 * chaque modification, et emporterait sa ventilation — et seulement dans un
 * exercice ouvert. La lecture, elle, reste possible sur un exercice clos.
 */

// ---------------------------------------------------------------------------
// Axes et sections
// ---------------------------------------------------------------------------

export async function listerAxes(contribuableId: number) {
  const axes = await db
    .select()
    .from(cptaAxesAnalytiques)
    .where(eq(cptaAxesAnalytiques.contribuableId, contribuableId))
    .orderBy(asc(cptaAxesAnalytiques.code));
  if (axes.length === 0) return [];
  const sections = await db
    .select()
    .from(cptaSectionsAnalytiques)
    .where(inArray(cptaSectionsAnalytiques.axeId, axes.map((a) => a.id)))
    .orderBy(asc(cptaSectionsAnalytiques.code));
  return axes.map((a) => ({ ...a, sections: sections.filter((s) => s.axeId === a.id) }));
}

async function axeDuContribuable(axeId: number, contribuableId: number) {
  const [axe] = await db
    .select()
    .from(cptaAxesAnalytiques)
    .where(and(eq(cptaAxesAnalytiques.id, axeId), eq(cptaAxesAnalytiques.contribuableId, contribuableId)));
  if (!axe) throw notFound("Axe analytique introuvable pour ce contribuable.");
  return axe;
}

export async function creerAxe(contribuableId: number, input: { code: string; libelle: string }) {
  const code = input.code.trim().toUpperCase();
  const [existant] = await db
    .select({ id: cptaAxesAnalytiques.id })
    .from(cptaAxesAnalytiques)
    .where(and(eq(cptaAxesAnalytiques.contribuableId, contribuableId), eq(cptaAxesAnalytiques.code, code)));
  if (existant) throw conflict(`L'axe ${code} existe déjà.`);
  const [axe] = await db.insert(cptaAxesAnalytiques).values({ contribuableId, code, libelle: input.libelle.trim() }).returning();
  return { ...axe, sections: [] };
}

export async function modifierAxe(axeId: number, input: { libelle?: string; actif?: boolean }) {
  const [axe] = await db
    .update(cptaAxesAnalytiques)
    .set({ ...(input.libelle !== undefined ? { libelle: input.libelle.trim() } : {}), ...(input.actif !== undefined ? { actif: input.actif } : {}) })
    .where(eq(cptaAxesAnalytiques.id, axeId))
    .returning();
  if (!axe) throw notFound("Axe analytique introuvable.");
  return axe;
}

/** Un axe se supprime tant qu'aucune de ses sections ne porte de ventilation. */
export async function supprimerAxe(axeId: number) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cptaVentilationsAnalytiques)
    .innerJoin(cptaSectionsAnalytiques, eq(cptaVentilationsAnalytiques.sectionId, cptaSectionsAnalytiques.id))
    .where(eq(cptaSectionsAnalytiques.axeId, axeId));
  if (n > 0) throw conflict("Des lignes sont ventilées sur cet axe : désactivez-le plutôt.");
  const supprimes = await db.delete(cptaAxesAnalytiques).where(eq(cptaAxesAnalytiques.id, axeId)).returning({ id: cptaAxesAnalytiques.id });
  if (supprimes.length === 0) throw notFound("Axe analytique introuvable.");
}

export async function creerSection(axeId: number, input: { code: string; libelle: string }) {
  const [axe] = await db.select().from(cptaAxesAnalytiques).where(eq(cptaAxesAnalytiques.id, axeId));
  if (!axe) throw notFound("Axe analytique introuvable.");
  const code = input.code.trim().toUpperCase();
  const [existante] = await db
    .select({ id: cptaSectionsAnalytiques.id })
    .from(cptaSectionsAnalytiques)
    .where(and(eq(cptaSectionsAnalytiques.axeId, axeId), eq(cptaSectionsAnalytiques.code, code)));
  if (existante) throw conflict(`La section ${code} existe déjà sur cet axe.`);
  const [section] = await db.insert(cptaSectionsAnalytiques).values({ axeId, code, libelle: input.libelle.trim() }).returning();
  return section;
}

export async function modifierSection(sectionId: number, input: { libelle?: string; actif?: boolean }) {
  const [section] = await db
    .update(cptaSectionsAnalytiques)
    .set({ ...(input.libelle !== undefined ? { libelle: input.libelle.trim() } : {}), ...(input.actif !== undefined ? { actif: input.actif } : {}) })
    .where(eq(cptaSectionsAnalytiques.id, sectionId))
    .returning();
  if (!section) throw notFound("Section analytique introuvable.");
  return section;
}

export async function supprimerSection(sectionId: number) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cptaVentilationsAnalytiques)
    .where(eq(cptaVentilationsAnalytiques.sectionId, sectionId));
  if (n > 0) throw conflict("Des lignes sont ventilées sur cette section : désactivez-la plutôt.");
  const supprimees = await db.delete(cptaSectionsAnalytiques).where(eq(cptaSectionsAnalytiques.id, sectionId)).returning({ id: cptaSectionsAnalytiques.id });
  if (supprimees.length === 0) throw notFound("Section analytique introuvable.");
}

// ---------------------------------------------------------------------------
// Lignes à ventiler
// ---------------------------------------------------------------------------

/** Le montant d'une ligne et son sens : une ligne ne porte que l'une des deux colonnes. */
function montantEtSens(l: { debit: string; credit: string }) {
  const debit = parseMontant(l.debit);
  const credit = parseMontant(l.credit);
  return debit > 0 ? { montant: debit, sens: "DEBIT" as const } : { montant: credit, sens: "CREDIT" as const };
}

export type FiltreLignes = {
  exerciceId: number;
  axeId: number;
  /** « A_VENTILER » : reste non ventilé ; « TOUTES » : tout. */
  etat?: "A_VENTILER" | "TOUTES";
  /** Début du numéro de compte. */
  compte?: string;
};

/**
 * Les lignes de charges et de produits validées de l'exercice, avec leur
 * ventilation sur l'axe demandé et ce qui reste à ventiler.
 */
export async function listerLignesAnalytiques(filtre: FiltreLignes) {
  const exercice = await getExercice(filtre.exerciceId);
  const axe = await axeDuContribuable(filtre.axeId, exercice.contribuableId);
  const sections = await db.select().from(cptaSectionsAnalytiques).where(eq(cptaSectionsAnalytiques.axeId, axe.id));
  const sectionIds = sections.map((s) => s.id);

  const conditions = [
    eq(cptaEcritures.exerciceId, filtre.exerciceId),
    ne(cptaEcritures.statut, "BROUILLON"),
    filtre.compte ? like(cptaComptes.numero, `${filtre.compte}%`) : or(like(cptaComptes.numero, "6%"), like(cptaComptes.numero, "7%")),
  ];
  const lignes = await db
    .select({
      ligneId: cptaLignesEcriture.id,
      ecritureId: cptaEcritures.id,
      numeroPiece: cptaEcritures.numeroPiece,
      dateEcriture: cptaEcritures.dateEcriture,
      journalCode: cptaJournaux.code,
      libelle: sql<string>`coalesce(${cptaLignesEcriture.libelle}, ${cptaEcritures.libelle})`,
      compteId: cptaComptes.id,
      compteNumero: cptaComptes.numero,
      compteLibelle: cptaComptes.libelle,
      debit: cptaLignesEcriture.debit,
      credit: cptaLignesEcriture.credit,
    })
    .from(cptaLignesEcriture)
    .innerJoin(cptaEcritures, eq(cptaLignesEcriture.ecritureId, cptaEcritures.id))
    .innerJoin(cptaJournaux, eq(cptaEcritures.journalId, cptaJournaux.id))
    .innerJoin(cptaComptes, eq(cptaLignesEcriture.compteId, cptaComptes.id))
    .where(and(...conditions))
    .orderBy(desc(cptaEcritures.dateEcriture), desc(cptaEcritures.id), asc(cptaLignesEcriture.ordre));

  const ventilations =
    lignes.length > 0 && sectionIds.length > 0
      ? await db
          .select()
          .from(cptaVentilationsAnalytiques)
          .where(and(inArray(cptaVentilationsAnalytiques.ligneId, lignes.map((l) => l.ligneId)), inArray(cptaVentilationsAnalytiques.sectionId, sectionIds)))
      : [];

  const resultat = lignes.map((l) => {
    const { montant, sens } = montantEtSens(l);
    const siennes = ventilations.filter((v) => v.ligneId === l.ligneId).map((v) => ({ sectionId: v.sectionId, montant: parseMontant(v.montant) }));
    const ventile = siennes.reduce((t, v) => t + v.montant, 0);
    return {
      ...l,
      montant: formatMontant(montant),
      sens,
      ventilations: siennes.map((v) => ({ sectionId: v.sectionId, montant: formatMontant(v.montant) })),
      reste: formatMontant(montant - ventile),
    };
  });
  return {
    axe: { id: axe.id, code: axe.code, libelle: axe.libelle },
    sections: sections.map((s) => ({ id: s.id, code: s.code, libelle: s.libelle, actif: s.actif })),
    lignes: filtre.etat === "TOUTES" ? resultat : resultat.filter((l) => parseMontant(l.reste) > 0),
  };
}

// ---------------------------------------------------------------------------
// Ventilation
// ---------------------------------------------------------------------------

/**
 * Pose la ventilation d'une ligne sur un axe — en remplaçant celle qui
 * existait sur cet axe, les autres axes n'étant pas touchés. Une liste
 * vide retire la ventilation.
 */
export async function ventilerLigne(ligneId: number, axeId: number, ventilations: { sectionId: number; montant: string | number }[], userId: number | null) {
  const [l] = await db
    .select({
      ligneId: cptaLignesEcriture.id,
      debit: cptaLignesEcriture.debit,
      credit: cptaLignesEcriture.credit,
      statut: cptaEcritures.statut,
      exerciceStatut: cptaExercices.statut,
      contribuableId: cptaExercices.contribuableId,
    })
    .from(cptaLignesEcriture)
    .innerJoin(cptaEcritures, eq(cptaLignesEcriture.ecritureId, cptaEcritures.id))
    .innerJoin(cptaExercices, eq(cptaEcritures.exerciceId, cptaExercices.id))
    .where(eq(cptaLignesEcriture.id, ligneId));
  if (!l) throw notFound("Ligne introuvable.");
  if (l.statut === "BROUILLON") throw conflict("Un brouillon ne se ventile pas : validez l'écriture d'abord.");
  if (l.exerciceStatut !== "OUVERT") throw conflict("L'exercice n'est plus ouvert : sa ventilation ne se modifie plus.");

  const axe = await axeDuContribuable(axeId, l.contribuableId);
  const sections = await db.select().from(cptaSectionsAnalytiques).where(eq(cptaSectionsAnalytiques.axeId, axe.id));
  const parId = new Map(sections.map((s) => [s.id, s]));
  for (const v of ventilations) {
    const s = parId.get(v.sectionId);
    if (!s) throw badRequest("Une section au moins n'appartient pas à cet axe.");
    if (!s.actif) throw badRequest(`La section ${s.code} est désactivée.`);
  }

  const { montant } = montantEtSens(l);
  const saisies = ventilations.map((v) => ({ sectionId: v.sectionId, montant: parseMontant(v.montant) }));
  let reste: number;
  try {
    reste = validerVentilation(montant, saisies).reste;
  } catch (e) {
    if (e instanceof VentilationError) throw badRequest(e.message);
    throw e;
  }

  await db.transaction(async (tx) => {
    if (sections.length > 0) {
      await tx.delete(cptaVentilationsAnalytiques).where(
        and(
          eq(cptaVentilationsAnalytiques.ligneId, ligneId),
          inArray(
            cptaVentilationsAnalytiques.sectionId,
            sections.map((s) => s.id),
          ),
        ),
      );
    }
    if (saisies.length > 0) {
      await tx.insert(cptaVentilationsAnalytiques).values(saisies.map((v) => ({ ligneId, sectionId: v.sectionId, montant: formatMontant(v.montant), createdBy: userId })));
    }
  });
  return { ligneId, axeId, ventilations: saisies.map((v) => ({ sectionId: v.sectionId, montant: formatMontant(v.montant) })), reste: formatMontant(reste) };
}

// ---------------------------------------------------------------------------
// Restitution
// ---------------------------------------------------------------------------

export async function restitutionAnalytique(exerciceId: number, axeId: number) {
  const exercice = await getExercice(exerciceId);
  const axe = await axeDuContribuable(axeId, exercice.contribuableId);
  const sections = await db.select().from(cptaSectionsAnalytiques).where(eq(cptaSectionsAnalytiques.axeId, axe.id)).orderBy(asc(cptaSectionsAnalytiques.code));
  const sectionIds = sections.map((s) => s.id);

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
    .where(and(eq(cptaEcritures.exerciceId, exerciceId), ne(cptaEcritures.statut, "BROUILLON"), or(like(cptaComptes.numero, "6%"), like(cptaComptes.numero, "7%"), like(cptaComptes.numero, "8%"))));
  const ventilations =
    lignes.length > 0 && sectionIds.length > 0
      ? await db
          .select()
          .from(cptaVentilationsAnalytiques)
          .where(and(inArray(cptaVentilationsAnalytiques.ligneId, lignes.map((l) => l.ligneId)), inArray(cptaVentilationsAnalytiques.sectionId, sectionIds)))
      : [];

  // Chaque ligne se découpe en ses parts ventilées, plus ce qui reste.
  const parts: LigneAnalytique[] = [];
  for (const l of lignes) {
    const { montant, sens } = montantEtSens(l);
    let ventile = 0;
    for (const v of ventilations.filter((v) => v.ligneId === l.ligneId)) {
      const m = parseMontant(v.montant);
      ventile += m;
      parts.push({ compteNumero: l.compteNumero, compteLibelle: l.compteLibelle, montant: m, sens, sectionId: v.sectionId });
    }
    if (montant - ventile > 0) {
      parts.push({ compteNumero: l.compteNumero, compteLibelle: l.compteLibelle, montant: montant - ventile, sens, sectionId: null });
    }
  }

  const m = formatMontant;
  const restitution = restitutionParSection(
    parts,
    sections.map((s) => ({ id: s.id, code: s.code, libelle: s.libelle })),
  );
  const total = restitution.reduce((t, r) => ({ charges: t.charges + r.charges, produits: t.produits + r.produits }), { charges: 0, produits: 0 });
  return {
    exercice: { id: exercice.id, libelle: exercice.libelle },
    axe: { id: axe.id, code: axe.code, libelle: axe.libelle },
    lignes: restitution.map((r) => ({
      section: r.section,
      charges: m(r.charges),
      produits: m(r.produits),
      resultat: m(r.resultat),
      comptes: r.comptes.map((c) => ({ ...c, charges: m(c.charges), produits: m(c.produits) })),
    })),
    totaux: { charges: m(total.charges), produits: m(total.produits), resultat: m(total.produits - total.charges) },
  };
}
