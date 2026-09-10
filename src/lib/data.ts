import "server-only";
import { db } from "@/db";
import {
  acfSuivis,
  contribuables,
  declarations,
  penalites,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { isEnRetard, type StatutDeclaration } from "@/lib/constants";

export async function getContribuables() {
  return db.select().from(contribuables).orderBy(asc(contribuables.nom));
}

export async function getContribuableById(id: number) {
  const [row] = await db.select().from(contribuables).where(eq(contribuables.id, id));
  return row ?? null;
}

export async function getDeclarationsByContribuable(contribuableId: number) {
  return db
    .select()
    .from(declarations)
    .where(eq(declarations.contribuableId, contribuableId))
    .orderBy(desc(declarations.dateEcheance));
}

export async function getAcfByContribuable(contribuableId: number) {
  return db
    .select()
    .from(acfSuivis)
    .where(eq(acfSuivis.contribuableId, contribuableId))
    .orderBy(desc(acfSuivis.dateDemande));
}

export async function getAllDeclarationsWithContribuable() {
  return db
    .select({
      id: declarations.id,
      contribuableId: declarations.contribuableId,
      contribuableNom: contribuables.nom,
      type: declarations.type,
      periodicite: declarations.periodicite,
      periode: declarations.periode,
      dateEcheance: declarations.dateEcheance,
      statut: declarations.statut,
      datePaiement: declarations.datePaiement,
      montant: declarations.montant,
      notes: declarations.notes,
    })
    .from(declarations)
    .innerJoin(contribuables, eq(declarations.contribuableId, contribuables.id))
    .orderBy(desc(declarations.dateEcheance));
}

export async function getAllAcfWithContribuable() {
  return db
    .select({
      id: acfSuivis.id,
      contribuableId: acfSuivis.contribuableId,
      contribuableNom: contribuables.nom,
      objet: acfSuivis.objet,
      dateDemande: acfSuivis.dateDemande,
      statut: acfSuivis.statut,
      motifBlocage: acfSuivis.motifBlocage,
      solution: acfSuivis.solution,
      dateResolution: acfSuivis.dateResolution,
      responsable: acfSuivis.responsable,
      notes: acfSuivis.notes,
    })
    .from(acfSuivis)
    .innerJoin(contribuables, eq(acfSuivis.contribuableId, contribuables.id))
    .orderBy(desc(acfSuivis.dateDemande));
}

export async function getDashboardSummary() {
  const [totalContribuables] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contribuables)
    .where(eq(contribuables.actif, true));

  const allDeclarations = await getAllDeclarationsWithContribuable();
  const allAcf = await getAllAcfWithContribuable();

  const enRetard = allDeclarations.filter((d) =>
    isEnRetard(d.dateEcheance, d.statut as StatutDeclaration),
  );

  const statutCounts: Record<string, number> = {};
  for (const d of allDeclarations) {
    const effectiveStatut = isEnRetard(d.dateEcheance, d.statut as StatutDeclaration)
      ? "EN_RETARD"
      : d.statut;
    statutCounts[effectiveStatut] = (statutCounts[effectiveStatut] ?? 0) + 1;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);

  const prochaines = allDeclarations
    .filter((d) => {
      if (d.statut === "PAYEE" || d.statut === "DEPOSEE" || d.statut === "EXONERE") return false;
      const echeance = new Date(d.dateEcheance);
      return echeance >= today && echeance <= in7Days;
    })
    .sort((a, b) => new Date(a.dateEcheance).getTime() - new Date(b.dateEcheance).getTime());

  const acfBloques = allAcf.filter((a) => a.statut === "BLOQUE");
  const acfEnCours = allAcf.filter((a) => a.statut === "EN_COURS");

  return {
    totalContribuables: totalContribuables?.count ?? 0,
    totalDeclarations: allDeclarations.length,
    enRetard,
    statutCounts,
    prochaines,
    acfBloques,
    acfEnCours,
    totalAcf: allAcf.length,
  };
}

// ---------------------------------------------------------------------------
// Analytics — agrégations pour la page Analytics
// ---------------------------------------------------------------------------

export async function getAnalytics(annee = 2026) {
  const byType = await db
    .select({
      type: declarations.type,
      count: sql<number>`count(*)::int`,
    })
    .from(declarations)
    .groupBy(declarations.type);

  const byRegime = await db
    .select({
      regime: contribuables.regimeFiscal,
      count: sql<number>`count(*)::int`,
    })
    .from(contribuables)
    .where(and(eq(contribuables.actif, true), isNull(contribuables.deletedAt)))
    .groupBy(contribuables.regimeFiscal);

  const byMonthRaw = await db
    .select({
      mois: sql<string>`to_char(${declarations.dateEcheance}, 'MM')`,
      count: sql<number>`count(*)::int`,
    })
    .from(declarations)
    .where(sql`extract(year from ${declarations.dateEcheance}) = ${annee}`)
    .groupBy(sql`to_char(${declarations.dateEcheance}, 'MM')`);

  const byMonth = Array.from({ length: 12 }, (_, i) => {
    const key = String(i + 1).padStart(2, "0");
    return { mois: i + 1, count: byMonthRaw.find((r) => r.mois === key)?.count ?? 0 };
  });

  const [penTotal] = await db
    .select({
      total: sql<number>`coalesce(sum(${penalites.montant}), 0)::float`,
    })
    .from(penalites)
    .where(eq(penalites.statut, "ESTIMEE"));

  const today = new Date().toISOString().slice(0, 10);
  const topRetards = await db
    .select({
      nom: contribuables.nom,
      count: sql<number>`count(*)::int`,
    })
    .from(declarations)
    .innerJoin(contribuables, eq(declarations.contribuableId, contribuables.id))
    .where(
      and(
        sql`${declarations.dateEcheance} < ${today}`,
        inArray(declarations.statut, ["A_FAIRE", "EN_RETARD"]),
      ),
    )
    .groupBy(contribuables.nom)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  // Taux de dépôt : part des déclarations traitées (déposée/payée/exonérée).
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      traitees: sql<number>`count(*) filter (where ${declarations.statut} in ('DEPOSEE','PAYEE','EXONERE'))::int`,
    })
    .from(declarations);

  const tauxDepot =
    totals && totals.total > 0
      ? Math.round((totals.traitees / totals.total) * 100)
      : 0;

  return {
    byType,
    byRegime,
    byMonth,
    penalitesTotal: penTotal?.total ?? 0,
    topRetards,
    tauxDepot,
    totalDeclarations: totals?.total ?? 0,
  };
}
