import "server-only";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  contribuables,
  declarations,
  factureLignes,
  factures,
  reglements,
} from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/http";
import {
  calculeTotaux,
  formatNombre,
  formatNumeroFacture,
  libellePeriode,
  objetParDefaut,
  sequenceDepuisNumero,
  statutCalcule,
  tauxTvaParDefaut,
  type CategorieLigne,
} from "@/lib/facturation";
import { lireParametre } from "@/lib/services/parametres";

/**
 * Exécuteur de requêtes : la base elle-même, ou une transaction en cours. Il
 * permet aux écritures liées d'une même facture de réussir ou d'échouer en bloc.
 */
type Executeur = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Préfixe de numérotation, paramétrable dans l'ERP. */
async function prefixeNumero(): Promise<string> {
  const p = await lireParametre<{ prefixe?: string }>("facturation_numerotation");
  return p?.prefixe?.trim() || "FA";
}

/**
 * Numéro suivant pour l'année donnée.
 *
 * La séquence repart à 1 chaque année. Deux créations simultanées pourraient
 * viser le même numéro : l'index unique sur `numero` les départage, et
 * l'appelant réessaie (voir `creerFacture`).
 */
export async function prochainNumero(annee: number): Promise<string> {
  const prefixe = await prefixeNumero();
  const [dernier] = await db
    .select({ numero: factures.numero })
    .from(factures)
    .where(like(factures.numero, `${prefixe}-${annee}-%`))
    .orderBy(desc(factures.numero))
    .limit(1);

  const sequence = dernier
    ? sequenceDepuisNumero(dernier.numero, prefixe, annee) + 1
    : 1;
  return formatNumeroFacture(prefixe, annee, sequence);
}

/**
 * Délai de paiement applicable à un contribuable, en jours.
 *
 * Le délai convenu sur sa fiche prime. À défaut — aucun délai n'ayant été
 * négocié avec lui — le délai général des paramètres s'applique : sans lui,
 * l'échéance de la facture ne pourrait pas être calculée.
 */
async function delaiPaiementJours(contribuableId?: number): Promise<number> {
  if (contribuableId != null) {
    const [ctb] = await db
      .select({ jours: contribuables.delaiPaiementJours })
      .from(contribuables)
      .where(eq(contribuables.id, contribuableId));
    if (ctb?.jours != null && ctb.jours > 0) return ctb.jours;
  }
  const p = await lireParametre<{ jours?: number }>("facturation_delai_paiement");
  const j = Number(p?.jours);
  return Number.isFinite(j) && j > 0 ? Math.floor(j) : 15;
}

function ajouteJours(dateIso: string, jours: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Recalculs
// ---------------------------------------------------------------------------

/**
 * Recalcule totaux, encaissements et statut d'une facture à partir de ses
 * lignes et de ses règlements. Appelé après toute écriture qui les touche :
 * les colonnes agrégées ne doivent jamais diverger de leur détail.
 */
export async function recalculeFacture(
  factureId: number,
  executeur: Executeur = db,
) {
  const [facture] = await executeur
    .select()
    .from(factures)
    .where(eq(factures.id, factureId));
  if (!facture) throw notFound("Facture introuvable.");

  const lignes = await executeur
    .select({
      montantHt: factureLignes.montantHt,
      tauxTva: factureLignes.tauxTva,
    })
    .from(factureLignes)
    .where(eq(factureLignes.factureId, factureId));

  const totaux = calculeTotaux(
    lignes.map((l) => ({
      montantHt: Number(l.montantHt),
      tauxTva: Number(l.tauxTva),
    })),
  );

  const [{ regle }] = await executeur
    .select({ regle: sql<string>`coalesce(sum(${reglements.montant}), 0)` })
    .from(reglements)
    .where(eq(reglements.factureId, factureId));
  const montantRegle = Number(regle);

  const statut = statutCalcule({
    statut: facture.statut,
    totalTtc: totaux.totalTtc,
    montantRegle,
    dateEcheance: facture.dateEcheance,
  });

  const [maj] = await executeur
    .update(factures)
    .set({
      totalHt: totaux.totalHt.toFixed(2),
      totalTva: totaux.totalTva.toFixed(2),
      totalTtc: totaux.totalTtc.toFixed(2),
      montantRegle: montantRegle.toFixed(2),
      statut,
      updatedAt: new Date(),
    })
    .where(eq(factures.id, factureId))
    .returning();

  return maj;
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

export type LigneSaisie = {
  categorie: CategorieLigne;
  libelle: string;
  montantHt: number;
  tauxTva?: number;
  declarationId?: number | null;
};

/**
 * Lignes proposées pour un contribuable sur une période : les honoraires
 * convenus, puis les impôts et cotisations de la période à reverser. Le
 * collaborateur reste libre de les corriger avant l'envoi — les honoraires ne
 * sont pas un montant figé.
 */
export async function lignesProposees(
  contribuableId: number,
  periode: string,
): Promise<LigneSaisie[]> {
  const [ctb] = await db
    .select({
      nom: contribuables.nom,
      honoraireMensuel: contribuables.honoraireMensuel,
      remisePct: contribuables.remisePct,
    })
    .from(contribuables)
    .where(eq(contribuables.id, contribuableId));
  if (!ctb) throw notFound("Contribuable introuvable.");

  const lignes: LigneSaisie[] = [];

  // Les honoraires figurent toujours, même non convenus : la ligne attend son
  // montant plutôt que de laisser l'utilisateur reconstruire le tableau.
  const honoraire = Number(ctb.honoraireMensuel ?? 0);
  lignes.push({
    categorie: "HONORAIRES",
    libelle: `Honoraires — ${libellePeriode(periode)}`,
    montantHt: honoraire,
    tauxTva: tauxTvaParDefaut("HONORAIRES"),
  });

  // La remise est un pourcentage des honoraires, portée en négatif : elle
  // réduit d'autant la base soumise à TVA.
  const remisePct = Number(ctb.remisePct ?? 0);
  if (remisePct > 0 && honoraire > 0) {
    lignes.push({
      categorie: "HONORAIRES",
      libelle: `Remise commerciale — ${formatNombre(remisePct)} %`,
      montantHt: -arrondiFcfa((honoraire * remisePct) / 100),
      tauxTva: tauxTvaParDefaut("HONORAIRES"),
    });
  }

  // Refacturation : chaque échéance de la période devient une ligne, rattachée
  // à sa déclaration pour garder la traçabilité. Une échéance non encore
  // chiffrée donne une ligne à zéro, à compléter avant émission — jamais un
  // blocage.
  const echeances = await db
    .select({
      id: declarations.id,
      type: declarations.type,
      montant: declarations.montant,
    })
    .from(declarations)
    .where(
      and(
        eq(declarations.contribuableId, contribuableId),
        eq(declarations.periode, periode),
      ),
    );

  for (const e of echeances) {
    const categorie: CategorieLigne = e.type === "CNPS" ? "CNPS" : "IMPOT_TRESOR";
    lignes.push({
      categorie,
      libelle:
        categorie === "CNPS"
          ? "CNPS : cotisations sociales"
          : `Trésor : ${e.type}`,
      montantHt: Number(e.montant ?? 0),
      tauxTva: tauxTvaParDefaut(categorie),
      declarationId: e.id,
    });
  }

  // Aucune échéance enregistrée sur la période : on prépare tout de même la
  // ligne de refacturation, puisque ces montants sont saisis à la main.
  if (echeances.length === 0) {
    lignes.push({
      categorie: "IMPOT_TRESOR",
      libelle: `Impôts et cotisations — ${libellePeriode(periode)}`,
      montantHt: 0,
      tauxTva: tauxTvaParDefaut("IMPOT_TRESOR"),
    });
  }

  return lignes;
}

/** Le franc CFA n'a pas de subdivision : les montants sont des entiers. */
function arrondiFcfa(n: number): number {
  return Math.round(n);
}

export type CreationFacture = {
  contribuableId: number;
  periode: string;
  dateEmission: string;
  dateEcheance?: string;
  objet?: string | null;
  notes?: string | null;
  lignes: LigneSaisie[];
  createdBy: number;
};

/**
 * Crée une facture en brouillon avec ses lignes, puis calcule ses totaux.
 *
 * En cas de collision de numéro (deux créations simultanées), on réessaie :
 * l'index unique garantit qu'un seul numéro est attribué à chaque facture.
 */
export async function creerFacture(input: CreationFacture) {
  const annee = Number(input.dateEmission.slice(0, 4));
  if (!Number.isFinite(annee)) throw badRequest("Date d'émission invalide.");

  const dateEcheance =
    input.dateEcheance ??
    ajouteJours(
      input.dateEmission,
      await delaiPaiementJours(input.contribuableId),
    );

  for (let tentative = 0; tentative < 5; tentative++) {
    const numero = await prochainNumero(annee);
    try {
      // En-tête, lignes et totaux dans une seule transaction : une facture sans
      // ses lignes, ou dont les totaux ne correspondent pas au détail, ne doit
      // jamais subsister si l'une des écritures échoue.
      return await db.transaction(async (tx) => {
        const [facture] = await tx
          .insert(factures)
          .values({
            numero,
            contribuableId: input.contribuableId,
            periode: input.periode,
            objet: input.objet ?? objetParDefaut(input.periode),
            dateEmission: input.dateEmission,
            dateEcheance,
            statut: "BROUILLON",
            notes: input.notes ?? null,
            createdBy: input.createdBy,
          })
          .returning();

        if (input.lignes.length > 0) {
          await tx.insert(factureLignes).values(
            input.lignes.map((l, i) => ({
              factureId: facture.id,
              categorie: l.categorie,
              libelle: l.libelle,
              montantHt: l.montantHt.toFixed(2),
              tauxTva: (l.tauxTva ?? tauxTvaParDefaut(l.categorie)).toFixed(2),
              declarationId: l.declarationId ?? null,
              ordre: i,
            })),
          );
        }

        return await recalculeFacture(facture.id, tx);
      });
    } catch (err) {
      if (estCollisionNumero(err)) continue;
      if (estDoublonPeriode(err)) {
        throw conflict(
          `Une facture existe déjà pour ce contribuable sur la période ${input.periode}.`,
        );
      }
      throw err;
    }
  }
  throw conflict("Impossible d'attribuer un numéro de facture, réessayez.");
}

function codeContrainte(err: unknown): string | null {
  const e = err as { code?: string; constraint?: string; cause?: unknown };
  if (e?.code === "23505") return e.constraint ?? "";
  if (e?.cause) return codeContrainte(e.cause);
  return null;
}

const estCollisionNumero = (err: unknown) =>
  codeContrainte(err)?.includes("numero") ?? false;

const estDoublonPeriode = (err: unknown) => {
  const c = codeContrainte(err);
  return c !== null && c.includes("periode");
};
