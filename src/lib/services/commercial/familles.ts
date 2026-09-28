import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { gcArticles, gcFamilles } from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/http";

/**
 * Les familles d'articles, arborescentes.
 *
 * Elles ne servent pas qu'au classement : elles portent les comptes par
 * défaut. Rattacher « Boissons » au 6011 et au 7011 évite de répéter
 * l'imputation sur trois cents références, et c'est ce qui rend l'import d'un
 * fichier client praticable.
 */

export type EntreeFamille = {
  contribuableId: number;
  code: string;
  libelle: string;
  parentId?: number | null;
  compteAchatId?: number | null;
  compteVenteId?: number | null;
  compteStockId?: number | null;
  compteVariationId?: number | null;
  taxeId?: number | null;
};

export async function listerFamilles(contribuableId: number, inclureInactives = false) {
  const conditions = [eq(gcFamilles.contribuableId, contribuableId)];
  if (!inclureInactives) conditions.push(eq(gcFamilles.actif, true));
  return db.select().from(gcFamilles).where(and(...conditions)).orderBy(asc(gcFamilles.code));
}

export async function getFamille(id: number) {
  const [f] = await db.select().from(gcFamilles).where(eq(gcFamilles.id, id));
  if (!f) throw notFound("Famille introuvable.");
  return f;
}

/**
 * Le parent doit relever du même contribuable, et ne pas fermer un cycle.
 *
 * Un cycle rendrait l'arbre infini à l'affichage comme à la résolution des
 * comptes hérités ; la base ne l'interdit pas, une clé étrangère vers
 * soi-même s'en accommode très bien.
 */
async function verifierParent(parentId: number, contribuableId: number, enfantId?: number) {
  const parent = await getFamille(parentId);
  if (parent.contribuableId !== contribuableId) throw conflict("Cette famille parente appartient à un autre contribuable.");
  if (enfantId === undefined) return;

  let courant: number | null = parentId;
  for (let profondeur = 0; courant !== null && profondeur < 50; profondeur++) {
    if (courant === enfantId) throw badRequest("Une famille ne peut pas devenir sa propre descendante.");
    const f = await getFamille(courant);
    courant = f.parentId;
  }
}

export async function creerFamille(input: EntreeFamille) {
  if (input.parentId) await verifierParent(input.parentId, input.contribuableId);
  const [existante] = await db
    .select({ id: gcFamilles.id })
    .from(gcFamilles)
    .where(and(eq(gcFamilles.contribuableId, input.contribuableId), eq(gcFamilles.code, input.code)));
  if (existante) throw conflict(`Le code ${input.code} désigne déjà une famille de ce contribuable.`);

  const [f] = await db
    .insert(gcFamilles)
    .values({
      contribuableId: input.contribuableId,
      code: input.code,
      libelle: input.libelle,
      parentId: input.parentId ?? null,
      compteAchatId: input.compteAchatId ?? null,
      compteVenteId: input.compteVenteId ?? null,
      compteStockId: input.compteStockId ?? null,
      compteVariationId: input.compteVariationId ?? null,
      taxeId: input.taxeId ?? null,
    })
    .returning();
  return f;
}

export async function modifierFamille(
  id: number,
  input: Partial<Omit<EntreeFamille, "contribuableId" | "code">> & { actif?: boolean },
) {
  const actuelle = await getFamille(id);
  if (input.parentId) await verifierParent(input.parentId, actuelle.contribuableId, id);

  await db
    .update(gcFamilles)
    .set({
      ...(input.libelle !== undefined ? { libelle: input.libelle } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.compteAchatId !== undefined ? { compteAchatId: input.compteAchatId } : {}),
      ...(input.compteVenteId !== undefined ? { compteVenteId: input.compteVenteId } : {}),
      ...(input.compteStockId !== undefined ? { compteStockId: input.compteStockId } : {}),
      ...(input.compteVariationId !== undefined ? { compteVariationId: input.compteVariationId } : {}),
      ...(input.taxeId !== undefined ? { taxeId: input.taxeId } : {}),
      ...(input.actif !== undefined ? { actif: input.actif } : {}),
      updatedAt: new Date(),
    })
    .where(eq(gcFamilles.id, id));
  return getFamille(id);
}

/**
 * Une famille vide se supprime vraiment — contrairement aux articles et aux
 * dépôts, elle n'est citée par aucun mouvement passé. Peuplée, elle se
 * désactive, sans quoi ses articles perdraient leurs comptes par défaut.
 */
export async function supprimerFamille(id: number) {
  await getFamille(id);
  const [article] = await db.select({ id: gcArticles.id }).from(gcArticles).where(eq(gcArticles.familleId, id)).limit(1);
  const [enfant] = await db.select({ id: gcFamilles.id }).from(gcFamilles).where(eq(gcFamilles.parentId, id)).limit(1);
  if (article || enfant) {
    await db.update(gcFamilles).set({ actif: false, updatedAt: new Date() }).where(eq(gcFamilles.id, id));
    return { supprimee: false, famille: await getFamille(id) };
  }
  await db.delete(gcFamilles).where(eq(gcFamilles.id, id));
  return { supprimee: true, famille: null };
}

/**
 * Les comptes effectifs d'un article : les siens, complétés par ceux de sa
 * famille, puis de ses ancêtres. Le plus proche l'emporte — l'exception que
 * porte l'article prime sur la règle de la famille.
 */
export async function comptesEffectifs(articleId: number) {
  const [a] = await db.select().from(gcArticles).where(eq(gcArticles.id, articleId));
  if (!a) throw notFound("Article introuvable.");

  const resolus = {
    compteAchatId: a.compteAchatId,
    compteVenteId: a.compteVenteId,
    compteStockId: a.compteStockId,
    compteVariationId: a.compteVariationId,
    taxeId: a.taxeId,
  };

  let familleId = a.familleId;
  for (let profondeur = 0; familleId !== null && profondeur < 50; profondeur++) {
    const f = await getFamille(familleId);
    for (const cle of Object.keys(resolus) as (keyof typeof resolus)[]) {
      if (resolus[cle] === null) resolus[cle] = f[cle];
    }
    familleId = f.parentId;
  }
  return resolus;
}
