import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { paieBulletins, paieRubriquesFixes, paieSalaries } from "@/db/schema";
import { conflict, notFound } from "@/lib/http";
import { formatMontant, parseMontant } from "@/lib/comptable/money";
import type { z } from "zod";
import type { salarieCreateSchema, salarieUpdateSchema } from "@/lib/schemas/paie";

/**
 * Salariés d'un contribuable.
 *
 * La fiche porte ce qui ne change pas d'un mois à l'autre : le salaire de
 * base, le régime, les primes fixes, les avantages en nature. Le mois
 * apporte le reste, sur le bulletin. Un salarié sorti garde sa fiche — ses
 * bulletins y renvoient — et cesse simplement d'en recevoir.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EntreeSalarie = z.infer<typeof salarieCreateSchema>;
export type ModificationSalarie = z.infer<typeof salarieUpdateSchema>;

function versLigne(input: ModificationSalarie) {
  return {
    matricule: input.matricule,
    nom: input.nom,
    prenoms: input.prenoms ?? null,
    niu: input.niu ?? null,
    numeroCnps: input.numeroCnps ?? null,
    dateNaissance: input.dateNaissance ?? null,
    dateEmbauche: input.dateEmbauche,
    dateSortie: input.dateSortie ?? null,
    poste: input.poste ?? null,
    categorie: input.categorie ?? null,
    echelon: input.echelon ?? null,
    salaireBase: formatMontant(parseMontant(input.salaireBase)),
    regimeCnps: input.regimeCnps,
    groupeRisque: input.groupeRisque,
    modePaiement: input.modePaiement,
    banque: input.banque ?? null,
    avantagesNature: input.avantagesNature,
    actif: input.actif,
    notes: input.notes ?? null,
  };
}

async function remplacerRubriques(tx: Tx, salarieId: number, rubriques: ModificationSalarie["rubriquesFixes"]) {
  await tx.delete(paieRubriquesFixes).where(eq(paieRubriquesFixes.salarieId, salarieId));
  if (rubriques.length === 0) return;
  await tx.insert(paieRubriquesFixes).values(
    rubriques.map((r, i) => ({
      salarieId,
      libelle: r.libelle,
      montant: formatMontant(parseMontant(r.montant)),
      cotisable: r.cotisable,
      imposable: r.imposable,
      ordre: i,
    })),
  );
}

export async function listerSalaries(contribuableId: number, options: { actifs?: boolean } = {}) {
  const conditions = [eq(paieSalaries.contribuableId, contribuableId)];
  if (options.actifs !== undefined) conditions.push(eq(paieSalaries.actif, options.actifs));
  return db
    .select()
    .from(paieSalaries)
    .where(and(...conditions))
    .orderBy(asc(paieSalaries.matricule));
}

export async function getSalarie(id: number) {
  const [salarie] = await db.select().from(paieSalaries).where(eq(paieSalaries.id, id));
  if (!salarie) throw notFound("Salarié introuvable.");
  const rubriquesFixes = await db
    .select()
    .from(paieRubriquesFixes)
    .where(eq(paieRubriquesFixes.salarieId, id))
    .orderBy(asc(paieRubriquesFixes.ordre), asc(paieRubriquesFixes.id));
  return { ...salarie, rubriquesFixes };
}

async function verifierMatricule(contribuableId: number, matricule: string, saufId?: number) {
  const [existant] = await db
    .select({ id: paieSalaries.id })
    .from(paieSalaries)
    .where(and(eq(paieSalaries.contribuableId, contribuableId), eq(paieSalaries.matricule, matricule)));
  if (existant && existant.id !== saufId) throw conflict(`Le matricule ${matricule} est déjà attribué.`);
}

export async function creerSalarie(input: EntreeSalarie) {
  await verifierMatricule(input.contribuableId, input.matricule);
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(paieSalaries)
      .values({ contribuableId: input.contribuableId, ...versLigne(input) })
      .returning({ id: paieSalaries.id });
    await remplacerRubriques(tx, row.id, input.rubriquesFixes);
    return row.id;
  });
  return getSalarie(id);
}

export async function modifierSalarie(id: number, input: ModificationSalarie) {
  const existant = await getSalarie(id);
  await verifierMatricule(existant.contribuableId, input.matricule, id);
  await db.transaction(async (tx) => {
    await tx
      .update(paieSalaries)
      .set({ ...versLigne(input), updatedAt: new Date() })
      .where(eq(paieSalaries.id, id));
    await remplacerRubriques(tx, id, input.rubriquesFixes);
  });
  return getSalarie(id);
}

/** Suppression réservée à une fiche sans bulletin : après, on désactive. */
export async function supprimerSalarie(id: number) {
  await getSalarie(id);
  const [{ n }] = await db.select({ n: count() }).from(paieBulletins).where(eq(paieBulletins.salarieId, id));
  if (n > 0) {
    throw conflict("Ce salarié a des bulletins : désactivez-le plutôt, avec sa date de sortie.");
  }
  await db.delete(paieSalaries).where(eq(paieSalaries.id, id));
}
