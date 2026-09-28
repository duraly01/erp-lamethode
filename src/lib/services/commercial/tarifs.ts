import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { gcArticles, gcTarifPrix, gcTarifs } from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/http";
import { formatMontant, parseMontant } from "@/lib/comptable/money";
import {
  planifierChangement,
  prixADate,
  TarifError,
  verifierCoherence,
  type PeriodePrix,
} from "@/lib/commercial/tarif";

/**
 * Les grilles tarifaires du contribuable et leurs prix datés.
 *
 * Le service est la seule porte d'entrée des prix, et c'est délibéré : le
 * non-chevauchement des périodes ne peut pas être garanti par la base sur cet
 * hébergement (il y faudrait `btree_gist`). Tout passe donc par
 * `lib/commercial/tarif.ts`, et chaque écriture revérifie la cohérence de ce
 * qu'elle laisse derrière elle.
 *
 * Les prix vivent en francs en base, comme tous les montants, et en centimes
 * entiers dans le module pur.
 */

export type EntreeTarif = {
  contribuableId: number;
  code: string;
  libelle: string;
  typeDepotDefaut?: "ENTREPOT" | "BOUTIQUE" | "RESTAURANT" | "TRANSIT" | null;
};

export async function listerTarifs(contribuableId: number, inclureInactifs = false) {
  const conditions = [eq(gcTarifs.contribuableId, contribuableId)];
  if (!inclureInactifs) conditions.push(eq(gcTarifs.actif, true));
  return db.select().from(gcTarifs).where(and(...conditions)).orderBy(asc(gcTarifs.code));
}

export async function getTarif(id: number) {
  const [t] = await db.select().from(gcTarifs).where(eq(gcTarifs.id, id));
  if (!t) throw notFound("Tarif introuvable.");
  return t;
}

export async function creerTarif(input: EntreeTarif) {
  const [existant] = await db
    .select({ id: gcTarifs.id })
    .from(gcTarifs)
    .where(and(eq(gcTarifs.contribuableId, input.contribuableId), eq(gcTarifs.code, input.code)));
  if (existant) throw conflict(`Le code ${input.code} désigne déjà un tarif de ce contribuable.`);

  const [t] = await db
    .insert(gcTarifs)
    .values({
      contribuableId: input.contribuableId,
      code: input.code,
      libelle: input.libelle,
      typeDepotDefaut: input.typeDepotDefaut ?? null,
    })
    .returning();
  return t;
}

export async function modifierTarif(
  id: number,
  input: Partial<Omit<EntreeTarif, "contribuableId" | "code">> & { actif?: boolean },
) {
  await getTarif(id);
  await db
    .update(gcTarifs)
    .set({
      ...(input.libelle !== undefined ? { libelle: input.libelle } : {}),
      ...(input.typeDepotDefaut !== undefined ? { typeDepotDefaut: input.typeDepotDefaut } : {}),
      ...(input.actif !== undefined ? { actif: input.actif } : {}),
      updatedAt: new Date(),
    })
    .where(eq(gcTarifs.id, id));
  return getTarif(id);
}

/**
 * Un tarif encore garni se désactive au lieu d'être supprimé : ses prix sont
 * l'histoire des ventes passées, et les effacer rendrait une facture de mars
 * inexplicable.
 */
export async function supprimerTarif(id: number) {
  await getTarif(id);
  const [prix] = await db.select({ id: gcTarifPrix.id }).from(gcTarifPrix).where(eq(gcTarifPrix.tarifId, id)).limit(1);
  if (prix) {
    await db.update(gcTarifs).set({ actif: false, updatedAt: new Date() }).where(eq(gcTarifs.id, id));
    return { supprime: false, tarif: await getTarif(id) };
  }
  await db.delete(gcTarifs).where(eq(gcTarifs.id, id));
  return { supprime: true, tarif: null };
}

// ---------------------------------------------------------------------------
// Prix
// ---------------------------------------------------------------------------

async function articleDuMemeContribuable(articleId: number, contribuableId: number) {
  const [a] = await db
    .select({ id: gcArticles.id, contribuableId: gcArticles.contribuableId, actif: gcArticles.actif })
    .from(gcArticles)
    .where(eq(gcArticles.id, articleId));
  if (!a) throw notFound("Article introuvable.");
  if (a.contribuableId !== contribuableId) throw conflict("Cet article appartient à un autre contribuable.");
  return a;
}

/** Les périodes d'un article dans un tarif, en centimes, de la plus récente à la plus ancienne. */
async function periodesDe(tarifId: number, articleId: number): Promise<PeriodePrix[]> {
  const lignes = await db
    .select({
      id: gcTarifPrix.id,
      valideDu: gcTarifPrix.valideDu,
      valideAu: gcTarifPrix.valideAu,
      prixHt: gcTarifPrix.prixHt,
    })
    .from(gcTarifPrix)
    .where(and(eq(gcTarifPrix.tarifId, tarifId), eq(gcTarifPrix.articleId, articleId)))
    .orderBy(desc(gcTarifPrix.valideDu));
  return lignes.map((l) => ({ id: l.id, valideDu: l.valideDu, valideAu: l.valideAu, prixHt: parseMontant(l.prixHt) }));
}

/**
 * Les prix du tarif : l'historique complet d'un article, ou l'état de la
 * grille à une date — un prix par article, celui qui s'applique ce jour-là.
 */
export async function listerPrix(tarifId: number, options: { articleId?: number; aDate?: string } = {}) {
  const tarif = await getTarif(tarifId);

  if (options.articleId) {
    await articleDuMemeContribuable(options.articleId, tarif.contribuableId);
    const periodes = await periodesDe(tarifId, options.articleId);
    return {
      tarif,
      articleId: options.articleId,
      periodes: periodes.map((p) => ({ ...p, prixHt: formatMontant(p.prixHt) })),
      enVigueur: options.aDate ? (prixADate(periodes, options.aDate)?.prixHt ?? null) : null,
    };
  }

  const lignes = await db
    .select({
      id: gcTarifPrix.id,
      articleId: gcTarifPrix.articleId,
      articleCode: gcArticles.code,
      articleLibelle: gcArticles.libelle,
      valideDu: gcTarifPrix.valideDu,
      valideAu: gcTarifPrix.valideAu,
      prixHt: gcTarifPrix.prixHt,
    })
    .from(gcTarifPrix)
    .innerJoin(gcArticles, eq(gcTarifPrix.articleId, gcArticles.id))
    .where(eq(gcTarifPrix.tarifId, tarifId))
    .orderBy(asc(gcArticles.code), desc(gcTarifPrix.valideDu));

  if (!options.aDate) return { tarif, lignes };

  // À une date, un article n'a qu'un prix : celui dont la période la couvre.
  const date = options.aDate;
  const retenues = lignes.filter((l) => l.valideDu <= date && (l.valideAu === null || date <= l.valideAu));
  return { tarif, aDate: date, lignes: retenues };
}

/**
 * Applique un changement de prix à partir d'une date.
 *
 * La période en cours est close la veille, une nouvelle s'ouvre — rien n'est
 * écrasé. C'est ce qui permettra de relire une vente de mars au prix de mars,
 * et sans quoi aucune marge passée n'est vérifiable.
 *
 * Le tout en une transaction : une clôture sans ouverture laisserait l'article
 * sans prix, et la vente serait refusée le lendemain sans que personne
 * comprenne pourquoi.
 */
export async function changerPrix(
  tarifId: number,
  input: { articleId: number; aPartirDu: string; prixHt: string | number },
  userId: number | null,
) {
  const tarif = await getTarif(tarifId);
  const article = await articleDuMemeContribuable(input.articleId, tarif.contribuableId);
  if (!article.actif) throw badRequest("Cet article est désactivé : il ne peut pas recevoir de nouveau prix.");

  const periodes = await periodesDe(tarifId, input.articleId);

  let plan;
  try {
    plan = planifierChangement(periodes, input.aPartirDu, parseMontant(input.prixHt));
  } catch (e) {
    if (e instanceof TarifError) throw badRequest(e.message);
    throw e;
  }

  await db.transaction(async (tx) => {
    for (const c of plan.aClore) {
      await tx.update(gcTarifPrix).set({ valideAu: c.valideAu }).where(eq(gcTarifPrix.id, c.id));
    }
    await tx.insert(gcTarifPrix).values({
      tarifId,
      articleId: input.articleId,
      valideDu: plan.aOuvrir.valideDu,
      valideAu: plan.aOuvrir.valideAu,
      prixHt: formatMontant(plan.aOuvrir.prixHt),
      createdBy: userId,
    });
  });

  // Relecture : l'invariant que la base ne sait pas tenir est vérifié sur ce
  // qui a réellement été écrit, pas sur ce qu'on croyait écrire.
  const apres = await periodesDe(tarifId, input.articleId);
  verifierCoherence(apres);

  return {
    tarif,
    articleId: input.articleId,
    periodes: apres.map((p) => ({ ...p, prixHt: formatMontant(p.prixHt) })),
  };
}

/**
 * Supprime une période de prix.
 *
 * La période précédente n'est pas rouverte automatiquement : deviner que son
 * ancien prix doit reprendre serait une décision commerciale, pas une
 * correction technique. L'article peut donc se retrouver sans prix à cette
 * date, et c'est visible.
 */
export async function supprimerPrix(tarifId: number, prixId: number) {
  const [p] = await db
    .select({ id: gcTarifPrix.id, articleId: gcTarifPrix.articleId })
    .from(gcTarifPrix)
    .where(and(eq(gcTarifPrix.id, prixId), eq(gcTarifPrix.tarifId, tarifId)));
  if (!p) throw notFound("Prix introuvable dans ce tarif.");

  await db.delete(gcTarifPrix).where(eq(gcTarifPrix.id, prixId));
  const apres = await periodesDe(tarifId, p.articleId);
  return {
    articleId: p.articleId,
    periodes: apres.map((x) => ({ ...x, prixHt: formatMontant(x.prixHt) })),
  };
}
