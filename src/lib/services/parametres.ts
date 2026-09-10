import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { parametres } from "@/db/schema";

/**
 * Lit un paramètre du cabinet. Retourne `undefined` si la clé n'existe pas,
 * ce qui laisse chaque appelant décider de son propre défaut.
 */
export async function lireParametre<T>(cle: string): Promise<T | undefined> {
  const [row] = await db
    .select({ valeur: parametres.valeur })
    .from(parametres)
    .where(eq(parametres.cle, cle));
  return (row?.valeur as T) ?? undefined;
}

/** Variante avec valeur de repli, pour les paramètres toujours nécessaires. */
export async function lireParametreOu<T>(cle: string, defaut: T): Promise<T> {
  return (await lireParametre<T>(cle)) ?? defaut;
}
