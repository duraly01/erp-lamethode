import "server-only";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  cptaComptes,
  cptaEcritures,
  cptaLettrages,
  cptaLignesEcriture,
} from "@/db/schema";
import { HttpError, badRequest, conflict, notFound } from "@/lib/http";
import { jourAuCameroun } from "@/lib/dates";
import { formatMontant, sommeMontants, parseMontant } from "@/lib/comptable/money";
import {
  prochainCodeLettrage,
  validerLettrage,
  postesOuverts,
  type LigneALettrer,
} from "@/lib/comptable/lettrage";

/**
 * Pose et retrait du lettrage.
 *
 * Le lettrage ne touche à aucun montant : il pose un code sur des lignes déjà
 * validées. Il se défait donc sans écriture de correction — c'est la seule
 * opération de la comptabilité générale qui soit réversible telle quelle.
 */

/** Lignes validées d'un compte, avec leur état de lettrage. */
async function chargerLignesDuCompte(compteId: number, ligneIds?: number[]) {
  const conditions = [
    eq(cptaLignesEcriture.compteId, compteId),
    // Un brouillon n'est pas encore un mouvement : il ne se lettre pas.
    ne(cptaEcritures.statut, "BROUILLON"),
  ];
  if (ligneIds) conditions.push(inArray(cptaLignesEcriture.id, ligneIds));

  return db
    .select({
      ligneId: cptaLignesEcriture.id,
      compteId: cptaLignesEcriture.compteId,
      tiersId: cptaLignesEcriture.tiersId,
      debit: cptaLignesEcriture.debit,
      credit: cptaLignesEcriture.credit,
      lettrage: cptaLignesEcriture.lettrage,
      dateEcriture: cptaEcritures.dateEcriture,
      numeroPiece: cptaEcritures.numeroPiece,
      libelle: cptaEcritures.libelle,
      dateEcheance: cptaLignesEcriture.dateEcheance,
    })
    .from(cptaLignesEcriture)
    .innerJoin(cptaEcritures, eq(cptaLignesEcriture.ecritureId, cptaEcritures.id))
    .where(and(...conditions));
}

/**
 * Lettre un ensemble de lignes sous un même code.
 *
 * Le contrôle décisif est porté par `validerLettrage` : le groupe doit se
 * solder. Lettrer des lignes qui ne se compensent pas ferait disparaître du
 * relevé des postes ouverts une somme qui reste due — donc une créance qu'on ne
 * relancerait plus.
 */
export async function lettrerLignes(
  compteId: number,
  ligneIds: number[],
  userId: number | null,
) {
  if (ligneIds.length < 2) {
    throw badRequest("Sélectionnez au moins deux lignes à lettrer.");
  }

  const [compte] = await db
    .select()
    .from(cptaComptes)
    .where(eq(cptaComptes.id, compteId));
  if (!compte) throw notFound("Compte introuvable.");
  if (!compte.lettrable) {
    throw conflict(`Le compte ${compte.numero} n'est pas déclaré lettrable.`);
  }

  const lignes = await chargerLignesDuCompte(compteId, ligneIds);

  // Une ligne demandée mais absente appartient à un autre compte, ou à un
  // brouillon : dans les deux cas la sélection est fausse et doit être rejetée
  // en bloc, jamais lettrée partiellement.
  if (lignes.length !== ligneIds.length) {
    throw badRequest(
      "Certaines lignes sélectionnées n'appartiennent pas à ce compte ou ne sont pas validées.",
    );
  }

  const aLettrer: LigneALettrer[] = lignes.map((l) => ({
    ligneId: l.ligneId,
    compteId: l.compteId,
    debit: l.debit,
    credit: l.credit,
    lettrage: l.lettrage,
  }));

  const erreurs = validerLettrage(aLettrer);
  if (erreurs.length > 0) {
    throw new HttpError(
      422,
      "lettrage_invalide",
      "Ces lignes ne peuvent pas être lettrées ensemble.",
      erreurs,
    );
  }

  return db.transaction(async (tx) => {
    // Le code se calcule d'après ceux déjà posés sur le compte, dans la
    // transaction : deux lettrages simultanés ne peuvent pas obtenir le même.
    const codesExistants = await tx
      .select({ code: cptaLettrages.code })
      .from(cptaLettrages)
      .where(eq(cptaLettrages.compteId, compteId));

    const code = prochainCodeLettrage(codesExistants.map((c) => c.code));

    const montant = sommeMontants(
      aLettrer.map((l) => parseMontant(l.debit)),
    );

    const [entete] = await tx
      .insert(cptaLettrages)
      .values({
        compteId,
        tiersId: lignes[0].tiersId,
        code,
        dateLettrage: jourAuCameroun(),
        montant: formatMontant(montant),
        createdBy: userId,
      })
      .returning();

    await tx
      .update(cptaLignesEcriture)
      .set({ lettrage: code })
      .where(inArray(cptaLignesEcriture.id, ligneIds));

    return { ...entete, ligneIds };
  });
}

/** Retire un code de lettrage et rouvre les lignes concernées. */
export async function delettrer(compteId: number, code: string) {
  const [entete] = await db
    .select()
    .from(cptaLettrages)
    .where(and(eq(cptaLettrages.compteId, compteId), eq(cptaLettrages.code, code)));
  if (!entete) throw notFound("Ce code de lettrage n'existe pas sur ce compte.");

  return db.transaction(async (tx) => {
    await tx
      .update(cptaLignesEcriture)
      .set({ lettrage: null })
      .where(
        and(
          eq(cptaLignesEcriture.compteId, compteId),
          eq(cptaLignesEcriture.lettrage, code),
        ),
      );

    await tx.delete(cptaLettrages).where(eq(cptaLettrages.id, entete.id));
  });
}

/**
 * Postes restant ouverts sur un compte : ce qui n'est ni soldé ni lettré.
 *
 * C'est la liste sur laquelle s'appuient la relance client et la balance âgée.
 */
export async function getPostesOuverts(compteId: number) {
  const lignes = await chargerLignesDuCompte(compteId);
  const ouverts = new Map(
    postesOuverts(
      lignes.map((l) => ({
        ligneId: l.ligneId,
        compteId: l.compteId,
        debit: l.debit,
        credit: l.credit,
        lettrage: l.lettrage,
      })),
    ).map((p) => [p.ligneId, p]),
  );

  return lignes
    .filter((l) => ouverts.has(l.ligneId))
    .map((l) => ({
      ...l,
      solde: ouverts.get(l.ligneId)!.solde,
    }));
}

/** Codes de lettrage déjà posés sur un compte, avec leur montant. */
export async function listerLettrages(compteId: number) {
  return db
    .select()
    .from(cptaLettrages)
    .where(eq(cptaLettrages.compteId, compteId));
}

/** Lignes portant un code donné — pour afficher le détail d'un lettrage. */
export async function getLignesLettrees(compteId: number, code: string) {
  return db
    .select({
      ligneId: cptaLignesEcriture.id,
      debit: cptaLignesEcriture.debit,
      credit: cptaLignesEcriture.credit,
      dateEcriture: cptaEcritures.dateEcriture,
      numeroPiece: cptaEcritures.numeroPiece,
      libelle: cptaEcritures.libelle,
    })
    .from(cptaLignesEcriture)
    .innerJoin(cptaEcritures, eq(cptaLignesEcriture.ecritureId, cptaEcritures.id))
    .where(
      and(
        eq(cptaLignesEcriture.compteId, compteId),
        eq(cptaLignesEcriture.lettrage, code),
        isNotNull(cptaLignesEcriture.lettrage),
      ),
    );
}
