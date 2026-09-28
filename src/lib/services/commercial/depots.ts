import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cptaAxesAnalytiques, cptaSectionsAnalytiques, gcDepots, users } from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/http";

/**
 * Les dépôts du contribuable : entrepôt, boutiques, restaurant.
 *
 * Le responsable nommé est la raison d'être de la table. Tant que le stock
 * est « dans la machine », il n'est le stock de personne et aucun écart n'est
 * imputable ; un dépôt sans responsable est donc un dépôt qu'on accepte de ne
 * pas contrôler, et l'interface doit le montrer comme tel.
 */

export type EntreeDepot = {
  contribuableId: number;
  code: string;
  libelle: string;
  type: "ENTREPOT" | "BOUTIQUE" | "RESTAURANT" | "TRANSIT";
  responsableUserId?: number | null;
  sectionId?: number | null;
  politiqueNegatif?: "REFUSE" | "TOLERE";
};

const colonnes = {
  id: gcDepots.id,
  contribuableId: gcDepots.contribuableId,
  code: gcDepots.code,
  libelle: gcDepots.libelle,
  type: gcDepots.type,
  responsableUserId: gcDepots.responsableUserId,
  responsableNom: users.nom,
  sectionId: gcDepots.sectionId,
  sectionCode: cptaSectionsAnalytiques.code,
  sectionLibelle: cptaSectionsAnalytiques.libelle,
  politiqueNegatif: gcDepots.politiqueNegatif,
  actif: gcDepots.actif,
  createdAt: gcDepots.createdAt,
};

function requete() {
  return db
    .select(colonnes)
    .from(gcDepots)
    .leftJoin(users, eq(gcDepots.responsableUserId, users.id))
    .leftJoin(cptaSectionsAnalytiques, eq(gcDepots.sectionId, cptaSectionsAnalytiques.id));
}

export async function listerDepots(contribuableId: number, inclureInactifs = false) {
  const conditions = [eq(gcDepots.contribuableId, contribuableId)];
  if (!inclureInactifs) conditions.push(eq(gcDepots.actif, true));
  return requete().where(and(...conditions)).orderBy(asc(gcDepots.code));
}

export async function getDepot(id: number) {
  const [d] = await requete().where(eq(gcDepots.id, id));
  if (!d) throw notFound("Dépôt introuvable.");
  return d;
}

/**
 * La section analytique doit relever d'un axe du même contribuable : sans ce
 * contrôle, le résultat d'un site s'imputerait sur l'analytique d'un autre
 * client du cabinet.
 */
async function verifierSection(sectionId: number, contribuableId: number) {
  const [s] = await db
    .select({ id: cptaSectionsAnalytiques.id })
    .from(cptaSectionsAnalytiques)
    .innerJoin(cptaAxesAnalytiques, eq(cptaSectionsAnalytiques.axeId, cptaAxesAnalytiques.id))
    .where(and(eq(cptaSectionsAnalytiques.id, sectionId), eq(cptaAxesAnalytiques.contribuableId, contribuableId)));
  if (!s) throw notFound("Section analytique introuvable pour ce contribuable.");
}

async function verifierResponsable(userId: number) {
  const [u] = await db.select({ id: users.id, actif: users.actif }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound("Utilisateur introuvable.");
  if (!u.actif) throw badRequest("Ce compte est désactivé : il ne peut pas être responsable d'un dépôt.");
}

export async function creerDepot(input: EntreeDepot) {
  if (input.sectionId) await verifierSection(input.sectionId, input.contribuableId);
  if (input.responsableUserId) await verifierResponsable(input.responsableUserId);

  const [existant] = await db
    .select({ id: gcDepots.id })
    .from(gcDepots)
    .where(and(eq(gcDepots.contribuableId, input.contribuableId), eq(gcDepots.code, input.code)));
  if (existant) throw conflict(`Le code ${input.code} désigne déjà un dépôt de ce contribuable.`);

  const [d] = await db
    .insert(gcDepots)
    .values({
      contribuableId: input.contribuableId,
      code: input.code,
      libelle: input.libelle,
      type: input.type,
      responsableUserId: input.responsableUserId ?? null,
      sectionId: input.sectionId ?? null,
      politiqueNegatif: input.politiqueNegatif ?? "REFUSE",
    })
    .returning({ id: gcDepots.id });
  return getDepot(d.id);
}

export async function modifierDepot(id: number, input: Partial<Omit<EntreeDepot, "contribuableId" | "code">> & { actif?: boolean }) {
  const actuel = await getDepot(id);
  if (input.sectionId) await verifierSection(input.sectionId, actuel.contribuableId);
  if (input.responsableUserId) await verifierResponsable(input.responsableUserId);

  await db
    .update(gcDepots)
    .set({
      ...(input.libelle !== undefined ? { libelle: input.libelle } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.responsableUserId !== undefined ? { responsableUserId: input.responsableUserId } : {}),
      ...(input.sectionId !== undefined ? { sectionId: input.sectionId } : {}),
      ...(input.politiqueNegatif !== undefined ? { politiqueNegatif: input.politiqueNegatif } : {}),
      ...(input.actif !== undefined ? { actif: input.actif } : {}),
      updatedAt: new Date(),
    })
    .where(eq(gcDepots.id, id));
  return getDepot(id);
}

/**
 * Un dépôt ne se supprime pas, il se désactive.
 *
 * Il sera bientôt cité par des mouvements de stock, et un site retiré des
 * livres emporterait l'explication de ce qui y est entré et sorti.
 */
export async function desactiverDepot(id: number) {
  await getDepot(id);
  await db.update(gcDepots).set({ actif: false, updatedAt: new Date() }).where(eq(gcDepots.id, id));
  return getDepot(id);
}
