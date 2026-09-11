import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { parametres } from "@/db/schema";
import { badRequest } from "@/lib/http";
import { lireParametre } from "@/lib/services/parametres";
import { BAREME_PAIE_DEFAUT, CLE_BAREME_PAIE, baremeEnVigueur, verifierBareme, type BaremePaie } from "@/lib/paie/bareme";

/**
 * Le barème de paie, en versions datées.
 *
 * Tant que le cabinet n'en a pas enregistré, c'est le barème livré qui
 * s'applique : une paie ne peut pas attendre qu'un paramètre soit saisi. Dès
 * qu'une version est enregistrée, elle fait foi — y compris pour les mois
 * qu'elle couvre rétroactivement.
 */
export async function lireBaremePaie(): Promise<BaremePaie[]> {
  const versions = await lireParametre<BaremePaie[]>(CLE_BAREME_PAIE);
  return Array.isArray(versions) && versions.length > 0 ? versions : BAREME_PAIE_DEFAUT;
}

/** Le barème d'un mois de paie, ou une erreur lisible s'il n'y en a pas. */
export async function baremePourPeriode(periode: string): Promise<BaremePaie> {
  const b = baremeEnVigueur(await lireBaremePaie(), periode);
  if (!b) throw badRequest(`Aucun barème de paie ne s'applique à ${periode} : ajoutez-en un dans Paramètres.`);
  return b;
}

/** Enregistre toutes les versions, après vérification de chacune. */
export async function enregistrerBaremePaie(versions: BaremePaie[]) {
  const erreurs = versions.flatMap((v) => verifierBareme(v).map((e) => `${v.valideDu} — ${e}`));
  if (erreurs.length > 0) throw badRequest(erreurs.join(" "));
  const dates = new Set(versions.map((v) => v.valideDu));
  if (dates.size !== versions.length) throw badRequest("Deux versions du barème ont la même date d'application.");

  const triees = [...versions].sort((a, b) => (a.valideDu < b.valideDu ? -1 : 1));
  // Le paramètre n'existe pas forcément : une base créée avant la paie ne l'a pas.
  await db
    .insert(parametres)
    .values({
      cle: CLE_BAREME_PAIE,
      valeur: triees,
      description: "Barème de paie (CNPS, IRPP, CFC, FNE, TDL, RAV, avantages en nature), en versions datées",
    })
    .onConflictDoUpdate({
      target: parametres.cle,
      set: { valeur: triees, updatedAt: sql`now()` },
    });
  return triees;
}
