import "server-only";
import { and, asc, count, eq, ilike, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cptaComptes,
  cptaTaxes,
  cptaTiers,
  gcArticleCodes,
  gcArticles,
  gcFamilles,
} from "@/db/schema";
import { conflict, notFound } from "@/lib/http";

/**
 * Le référentiel des articles du contribuable.
 *
 * Le code interne est attribué par l'ERP, et c'est le point de tout le
 * module : chez le client des entretiens, les articles sans référence sont
 * intraçables, et ceux qui en ont la tiennent du fournisseur — donc d'un tiers
 * qui peut la changer, et qui ne couvre pas tout le catalogue. Un code maison
 * ne dépend de personne.
 *
 * Les codes du fournisseur et les codes-barres restent enregistrés à côté,
 * autant qu'il en existe, pour retrouver l'article à la réception ou en caisse.
 */

const PREFIXE_CODE = "ART";

/**
 * Le prochain code libre du contribuable, sous la forme `ART-000001`.
 *
 * Le numéro suit le plus grand déjà attribué, et non le nombre d'articles :
 * un article supprimé ne doit pas rendre son code, sous peine de faire
 * désigner deux marchandises différentes par le même code dans deux fichiers
 * d'inventaire successifs.
 *
 * La numérotation n'a pas besoin d'être sans trou — elle n'est pas comptable.
 * En cas de course entre deux créations simultanées, l'unicité en base
 * tranche et l'appelant réessaie.
 */
async function prochainCode(contribuableId: number): Promise<string> {
  const [max] = await db
    .select({
      n: sql<number>`coalesce(max(nullif(regexp_replace(${gcArticles.code}, '^${sql.raw(PREFIXE_CODE)}-', ''), '')::bigint), 0)`,
    })
    .from(gcArticles)
    .where(
      and(
        eq(gcArticles.contribuableId, contribuableId),
        sql`${gcArticles.code} ~ ('^' || ${PREFIXE_CODE} || '-[0-9]+$')`,
      ),
    );
  return `${PREFIXE_CODE}-${String(Number(max?.n ?? 0) + 1).padStart(6, "0")}`;
}

export type EntreeArticle = {
  contribuableId: number;
  code?: string;
  libelle: string;
  familleId?: number | null;
  unite?: string;
  variante?: string | null;
  suiviLot?: boolean;
  dureeVieMinJours?: number | null;
  compteAchatId?: number | null;
  compteVenteId?: number | null;
  compteStockId?: number | null;
  compteVariationId?: number | null;
  taxeId?: number | null;
};

const colonnes = {
  id: gcArticles.id,
  contribuableId: gcArticles.contribuableId,
  code: gcArticles.code,
  libelle: gcArticles.libelle,
  familleId: gcArticles.familleId,
  familleCode: gcFamilles.code,
  familleLibelle: gcFamilles.libelle,
  unite: gcArticles.unite,
  variante: gcArticles.variante,
  suiviLot: gcArticles.suiviLot,
  dureeVieMinJours: gcArticles.dureeVieMinJours,
  compteAchatId: gcArticles.compteAchatId,
  compteVenteId: gcArticles.compteVenteId,
  compteStockId: gcArticles.compteStockId,
  compteVariationId: gcArticles.compteVariationId,
  taxeId: gcArticles.taxeId,
  actif: gcArticles.actif,
  createdAt: gcArticles.createdAt,
};

/**
 * Les comptes et la taxe cités doivent relever du même contribuable — le plan
 * comptable est propre à chacun, et une imputation croisée passerait inaperçue
 * jusqu'à la première écriture.
 */
async function verifierRattachements(input: Partial<EntreeArticle>, contribuableId: number) {
  const comptes = [input.compteAchatId, input.compteVenteId, input.compteStockId, input.compteVariationId].filter(
    (x): x is number => typeof x === "number",
  );
  for (const compteId of comptes) {
    const [c] = await db
      .select({ contribuableId: cptaComptes.contribuableId })
      .from(cptaComptes)
      .where(eq(cptaComptes.id, compteId));
    if (!c) throw notFound("Compte introuvable.");
    if (c.contribuableId !== contribuableId) throw conflict("Un compte cité appartient à un autre contribuable.");
  }
  if (input.taxeId) {
    const [t] = await db
      .select({ contribuableId: cptaTaxes.contribuableId })
      .from(cptaTaxes)
      .where(eq(cptaTaxes.id, input.taxeId));
    if (!t) throw notFound("Taxe introuvable.");
    if (t.contribuableId !== contribuableId) throw conflict("Cette taxe appartient à un autre contribuable.");
  }
  if (input.familleId) {
    const [f] = await db
      .select({ contribuableId: gcFamilles.contribuableId })
      .from(gcFamilles)
      .where(eq(gcFamilles.id, input.familleId));
    if (!f) throw notFound("Famille introuvable.");
    if (f.contribuableId !== contribuableId) throw conflict("Cette famille appartient à un autre contribuable.");
  }
}

export async function listerArticles(filtre: {
  contribuableId: number;
  q?: string;
  familleId?: number;
  inclureInactifs?: boolean;
  page: number;
  pageSize: number;
}) {
  const conditions = [eq(gcArticles.contribuableId, filtre.contribuableId)];
  if (!filtre.inclureInactifs) conditions.push(eq(gcArticles.actif, true));
  if (filtre.familleId) conditions.push(eq(gcArticles.familleId, filtre.familleId));
  if (filtre.q) {
    const motif = `%${filtre.q}%`;
    // La recherche porte aussi sur les codes alternatifs : à la réception, on
    // tient la référence du fournisseur, pas le code interne.
    conditions.push(
      or(
        ilike(gcArticles.libelle, motif),
        ilike(gcArticles.code, motif),
        sql`exists (select 1 from ${gcArticleCodes} ac where ac.article_id = ${gcArticles.id} and ac.code ilike ${motif})`,
      )!,
    );
  }
  const where = and(...conditions);

  const [{ total }] = await db.select({ total: count() }).from(gcArticles).where(where);
  const items = await db
    .select(colonnes)
    .from(gcArticles)
    .leftJoin(gcFamilles, eq(gcArticles.familleId, gcFamilles.id))
    .where(where)
    .orderBy(asc(gcArticles.code))
    .limit(filtre.pageSize)
    .offset((filtre.page - 1) * filtre.pageSize);

  return { items, total, page: filtre.page, pageSize: filtre.pageSize };
}

export async function getArticle(id: number) {
  const [a] = await db
    .select(colonnes)
    .from(gcArticles)
    .leftJoin(gcFamilles, eq(gcArticles.familleId, gcFamilles.id))
    .where(eq(gcArticles.id, id));
  if (!a) throw notFound("Article introuvable.");
  const codes = await db
    .select({
      id: gcArticleCodes.id,
      type: gcArticleCodes.type,
      code: gcArticleCodes.code,
      tiersId: gcArticleCodes.tiersId,
      tiersRaisonSociale: cptaTiers.raisonSociale,
    })
    .from(gcArticleCodes)
    .leftJoin(cptaTiers, eq(gcArticleCodes.tiersId, cptaTiers.id))
    .where(eq(gcArticleCodes.articleId, id))
    .orderBy(asc(gcArticleCodes.type), asc(gcArticleCodes.code));
  return { ...a, codes };
}

export async function creerArticle(input: EntreeArticle) {
  await verifierRattachements(input, input.contribuableId);

  const code = input.code ?? (await prochainCode(input.contribuableId));
  const [existant] = await db
    .select({ id: gcArticles.id })
    .from(gcArticles)
    .where(and(eq(gcArticles.contribuableId, input.contribuableId), eq(gcArticles.code, code)));
  if (existant) throw conflict(`Le code ${code} désigne déjà un article de ce contribuable.`);

  const [a] = await db
    .insert(gcArticles)
    .values({
      contribuableId: input.contribuableId,
      code,
      libelle: input.libelle,
      familleId: input.familleId ?? null,
      unite: input.unite ?? "U",
      variante: input.variante ?? null,
      suiviLot: input.suiviLot ?? false,
      dureeVieMinJours: input.dureeVieMinJours ?? null,
      compteAchatId: input.compteAchatId ?? null,
      compteVenteId: input.compteVenteId ?? null,
      compteStockId: input.compteStockId ?? null,
      compteVariationId: input.compteVariationId ?? null,
      taxeId: input.taxeId ?? null,
    })
    .returning({ id: gcArticles.id });
  return getArticle(a.id);
}

export async function modifierArticle(id: number, input: Partial<EntreeArticle> & { actif?: boolean }) {
  const actuel = await getArticle(id);
  await verifierRattachements(input, actuel.contribuableId);

  if (input.code !== undefined && input.code !== actuel.code) {
    const [collision] = await db
      .select({ id: gcArticles.id })
      .from(gcArticles)
      .where(
        and(
          eq(gcArticles.contribuableId, actuel.contribuableId),
          eq(gcArticles.code, input.code),
          ne(gcArticles.id, id),
        ),
      );
    if (collision) throw conflict(`Le code ${input.code} désigne déjà un autre article.`);
  }

  await db
    .update(gcArticles)
    .set({
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.libelle !== undefined ? { libelle: input.libelle } : {}),
      ...(input.familleId !== undefined ? { familleId: input.familleId } : {}),
      ...(input.unite !== undefined ? { unite: input.unite } : {}),
      ...(input.variante !== undefined ? { variante: input.variante } : {}),
      ...(input.suiviLot !== undefined ? { suiviLot: input.suiviLot } : {}),
      ...(input.dureeVieMinJours !== undefined ? { dureeVieMinJours: input.dureeVieMinJours } : {}),
      ...(input.compteAchatId !== undefined ? { compteAchatId: input.compteAchatId } : {}),
      ...(input.compteVenteId !== undefined ? { compteVenteId: input.compteVenteId } : {}),
      ...(input.compteStockId !== undefined ? { compteStockId: input.compteStockId } : {}),
      ...(input.compteVariationId !== undefined ? { compteVariationId: input.compteVariationId } : {}),
      ...(input.taxeId !== undefined ? { taxeId: input.taxeId } : {}),
      ...(input.actif !== undefined ? { actif: input.actif } : {}),
      updatedAt: new Date(),
    })
    .where(eq(gcArticles.id, id));
  return getArticle(id);
}

/** Un article se désactive : il sera cité par des mouvements passés. */
export async function desactiverArticle(id: number) {
  await getArticle(id);
  await db.update(gcArticles).set({ actif: false, updatedAt: new Date() }).where(eq(gcArticles.id, id));
  return getArticle(id);
}

// ---------------------------------------------------------------------------
// Codes alternatifs
// ---------------------------------------------------------------------------

/**
 * Ajoute un code-barres ou une référence fournisseur.
 *
 * L'unicité porte sur tout le catalogue : un code déjà pris par un autre
 * article est refusé en nommant cet article, parce que c'est exactement le
 * doublon qu'on cherche à empêcher — deux marchandises sous un même
 * code-barres rendent la caisse indéterministe.
 */
export async function ajouterCode(
  articleId: number,
  input: { type: "EAN" | "FOURNISSEUR" | "INTERNE_ANCIEN"; code: string; tiersId?: number | null },
) {
  const article = await getArticle(articleId);
  if (input.type === "FOURNISSEUR" && input.tiersId) {
    const [t] = await db
      .select({ contribuableId: cptaTiers.contribuableId })
      .from(cptaTiers)
      .where(eq(cptaTiers.id, input.tiersId));
    if (!t) throw notFound("Fournisseur introuvable.");
    if (t.contribuableId !== article.contribuableId) throw conflict("Ce fournisseur appartient à un autre contribuable.");
  }

  const [collision] = await db
    .select({ articleId: gcArticleCodes.articleId, articleCode: gcArticles.code, articleLibelle: gcArticles.libelle })
    .from(gcArticleCodes)
    .innerJoin(gcArticles, eq(gcArticleCodes.articleId, gcArticles.id))
    .where(
      and(
        eq(gcArticleCodes.contribuableId, article.contribuableId),
        eq(gcArticleCodes.type, input.type),
        eq(gcArticleCodes.code, input.code),
      ),
    );
  if (collision) {
    if (collision.articleId === articleId) throw conflict("Ce code est déjà enregistré sur cet article.");
    throw conflict(`Ce code désigne déjà ${collision.articleCode} — ${collision.articleLibelle}.`);
  }

  await db.insert(gcArticleCodes).values({
    contribuableId: article.contribuableId,
    articleId,
    type: input.type,
    code: input.code,
    tiersId: input.tiersId ?? null,
  });
  return getArticle(articleId);
}

export async function retirerCode(articleId: number, codeId: number) {
  const [c] = await db
    .select({ id: gcArticleCodes.id })
    .from(gcArticleCodes)
    .where(and(eq(gcArticleCodes.id, codeId), eq(gcArticleCodes.articleId, articleId)));
  if (!c) throw notFound("Code introuvable sur cet article.");
  await db.delete(gcArticleCodes).where(eq(gcArticleCodes.id, codeId));
  return getArticle(articleId);
}

/**
 * Retrouve un article par n'importe lequel de ses codes — interne, EAN,
 * fournisseur. C'est l'entrée de la douchette et de la réception.
 */
export async function chercherParCode(contribuableId: number, code: string) {
  const [parInterne] = await db
    .select(colonnes)
    .from(gcArticles)
    .leftJoin(gcFamilles, eq(gcArticles.familleId, gcFamilles.id))
    .where(and(eq(gcArticles.contribuableId, contribuableId), eq(gcArticles.code, code.toUpperCase())));
  if (parInterne) return parInterne;

  const [parAlternatif] = await db
    .select(colonnes)
    .from(gcArticleCodes)
    .innerJoin(gcArticles, eq(gcArticleCodes.articleId, gcArticles.id))
    .leftJoin(gcFamilles, eq(gcArticles.familleId, gcFamilles.id))
    .where(and(eq(gcArticleCodes.contribuableId, contribuableId), eq(gcArticleCodes.code, code)));
  if (!parAlternatif) throw notFound(`Aucun article ne porte le code ${code}.`);
  return parAlternatif;
}

/** Exposé pour l'import : le code que prendrait le prochain article. */
export async function prochainCodeArticle(contribuableId: number) {
  return prochainCode(contribuableId);
}
