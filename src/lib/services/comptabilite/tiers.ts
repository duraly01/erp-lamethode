import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cptaComptes, cptaTiers } from "@/db/schema";
import { conflict, notFound } from "@/lib/http";

/**
 * Clients, fournisseurs et salariés **du contribuable** — à ne pas confondre
 * avec les contribuables eux-mêmes, qui sont les clients du cabinet.
 */

export async function listerTiers(contribuableId: number) {
  return db
    .select()
    .from(cptaTiers)
    .where(
      and(
        eq(cptaTiers.contribuableId, contribuableId),
        eq(cptaTiers.actif, true),
      ),
    )
    .orderBy(asc(cptaTiers.raisonSociale));
}

export type EntreeTiers = {
  contribuableId: number;
  code: string;
  raisonSociale: string;
  types: string[];
  niu?: string | null;
  compteId?: number | null;
  telephone?: string | null;
  email?: string | null;
};

export async function creerTiers(input: EntreeTiers) {
  // Le compte de rattachement doit appartenir au même contribuable : sans ce
  // contrôle, un tiers pourrait pointer vers le plan comptable d'un autre.
  if (input.compteId) {
    const [compte] = await db
      .select({ id: cptaComptes.id, contribuableId: cptaComptes.contribuableId })
      .from(cptaComptes)
      .where(eq(cptaComptes.id, input.compteId));
    if (!compte) throw notFound("Compte de rattachement introuvable.");
    if (compte.contribuableId !== input.contribuableId) {
      throw conflict("Ce compte appartient à un autre contribuable.");
    }
  }

  const [tiers] = await db
    .insert(cptaTiers)
    .values({
      contribuableId: input.contribuableId,
      code: input.code,
      raisonSociale: input.raisonSociale,
      types: input.types,
      niu: input.niu ?? null,
      compteId: input.compteId ?? null,
      telephone: input.telephone ?? null,
      email: input.email ?? null,
    })
    .returning();

  return tiers;
}
