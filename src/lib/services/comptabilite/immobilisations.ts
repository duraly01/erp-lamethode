import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { cptaComptes, cptaDotations, cptaEcritures, cptaExercices, cptaImmobilisations, cptaJournaux, cptaPieces, cptaTiers } from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/http";
import { formatMontant, parseMontant } from "@/lib/comptable/money";
import {
  AmortissementError,
  cumulADate,
  genererEcritureDotations,
  genererEcritureSortie,
  periodesPourPlan,
  planAmortissement,
  tableauImmobilisations,
  totauxTableau,
  type FicheAmortissable,
  type Periode,
} from "@/lib/comptable/amortissement";
import { getExercice } from "./exercices";
import { creerBrouillon, validerEcritureEnBase } from "./ecritures";

/**
 * Registre des immobilisations.
 *
 * La fiche porte tout ce que le plan a besoin de savoir ; le plan lui-même
 * ne se stocke pas, il se recalcule sur les exercices du contribuable,
 * prolongés avant et après pour couvrir la vie du bien. Ce qui laisse une
 * trace, c'est ce qui est passé dans les livres : la dotation de chaque
 * exercice, liée à son écriture, et la sortie du bien.
 *
 * Une fiche dont une dotation a été passée ne change plus ses paramètres
 * d'amortissement : le plan déjà constaté en dépend. Le reste — libellé,
 * fournisseur, notes — se corrige librement.
 */

type Immobilisation = typeof cptaImmobilisations.$inferSelect;

export type EntreeImmobilisation = {
  code: string;
  libelle: string;
  description?: string | null;
  compteId: number;
  compteAmortissementId?: number | null;
  compteDotationId?: number | null;
  dateAcquisition: string;
  dateMiseEnService: string;
  valeurOrigine: string | number;
  valeurResiduelle?: string | number | null;
  mode: "LINEAIRE" | "DEGRESSIF";
  dureeMois?: number | null;
  fournisseurId?: number | null;
  pieceId?: number | null;
  referenceFacture?: string | null;
  notes?: string | null;
};

function fiche(i: Immobilisation): FicheAmortissable {
  return {
    valeurOrigine: parseMontant(i.valeurOrigine),
    valeurResiduelle: parseMontant(i.valeurResiduelle),
    dateMiseEnService: i.dateMiseEnService,
    dureeMois: i.dureeMois,
    mode: i.mode,
    dateSortie: i.dateSortie,
  };
}

function veille(iso: string): string {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j - 1)).toISOString().slice(0, 10);
}

async function exercicesDe(contribuableId: number): Promise<(Periode & { id: number; libelle: string; statut: string })[]> {
  const rows = await db
    .select({ id: cptaExercices.id, libelle: cptaExercices.libelle, statut: cptaExercices.statut, dateDebut: cptaExercices.dateDebut, dateFin: cptaExercices.dateFin })
    .from(cptaExercices)
    .where(eq(cptaExercices.contribuableId, contribuableId))
    .orderBy(asc(cptaExercices.dateDebut));
  if (rows.length === 0) throw badRequest("Aucun exercice comptable : ouvrez-en un avant de tenir les immobilisations.");
  return rows;
}

/** Les périodes qui couvrent la vie de tous les biens : les exercices, prolongés pour le plus ancien et le plus long. */
function periodesCouvrant(exercices: Periode[], fiches: FicheAmortissable[]): Periode[] {
  return fiches.reduce((p, f) => periodesPourPlan(p, f), exercices);
}

/** Traduit une erreur du moteur en réponse HTTP lisible. */
function calculer<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof AmortissementError) throw badRequest(e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Contrôles de la fiche
// ---------------------------------------------------------------------------

async function compteDuContribuable(compteId: number, contribuableId: number, attendu: RegExp, role: string) {
  const [c] = await db.select().from(cptaComptes).where(and(eq(cptaComptes.id, compteId), eq(cptaComptes.contribuableId, contribuableId)));
  if (!c) throw notFound(`Compte ${role} introuvable pour ce contribuable.`);
  if (!attendu.test(c.numero)) throw badRequest(`Le compte ${c.numero} n'est pas un compte ${role}.`);
  if (!c.actif) throw badRequest(`Le compte ${c.numero} est désactivé.`);
  return c;
}

async function verifierEntree(input: EntreeImmobilisation, contribuableId: number) {
  const amortissable = input.dureeMois !== null && input.dureeMois !== undefined;
  const compte = await compteDuContribuable(input.compteId, contribuableId, /^2[0-7]/, "d'immobilisation");
  if (amortissable) {
    if (!input.compteAmortissementId || !input.compteDotationId) {
      throw badRequest("Un bien qui s'amortit a besoin d'un compte d'amortissement (28) et d'un compte de dotation (68).");
    }
    await compteDuContribuable(input.compteAmortissementId, contribuableId, /^28/, "d'amortissement");
    await compteDuContribuable(input.compteDotationId, contribuableId, /^68/, "de dotation");
  }
  if (input.dateMiseEnService < input.dateAcquisition) {
    throw badRequest("La mise en service ne peut pas précéder l'acquisition.");
  }
  if (input.fournisseurId) {
    const [t] = await db.select({ id: cptaTiers.id }).from(cptaTiers).where(and(eq(cptaTiers.id, input.fournisseurId), eq(cptaTiers.contribuableId, contribuableId)));
    if (!t) throw notFound("Fournisseur introuvable pour ce contribuable.");
  }
  if (input.pieceId) {
    const [p] = await db.select({ id: cptaPieces.id, type: cptaPieces.type }).from(cptaPieces).where(and(eq(cptaPieces.id, input.pieceId), eq(cptaPieces.contribuableId, contribuableId)));
    if (!p) throw notFound("Pièce introuvable pour ce contribuable.");
    if (p.type !== "FACTURE_ACHAT") throw badRequest("Seule une facture d'achat peut porter une immobilisation.");
  }
  // Le moteur valide les montants et la durée.
  calculer(() =>
    planAmortissement(
      {
        valeurOrigine: parseMontant(input.valeurOrigine),
        valeurResiduelle: parseMontant(input.valeurResiduelle ?? 0),
        dateMiseEnService: input.dateMiseEnService,
        dureeMois: amortissable ? input.dureeMois! : null,
        mode: input.mode,
      },
      [],
    ),
  );
  return { compte, amortissable };
}

function colonnes(input: EntreeImmobilisation, amortissable: boolean) {
  return {
    code: input.code.trim(),
    libelle: input.libelle.trim(),
    description: input.description ?? null,
    compteId: input.compteId,
    compteAmortissementId: amortissable ? input.compteAmortissementId! : null,
    compteDotationId: amortissable ? input.compteDotationId! : null,
    dateAcquisition: input.dateAcquisition,
    dateMiseEnService: input.dateMiseEnService,
    valeurOrigine: formatMontant(parseMontant(input.valeurOrigine)),
    valeurResiduelle: formatMontant(parseMontant(input.valeurResiduelle ?? 0)),
    mode: input.mode,
    dureeMois: amortissable ? input.dureeMois! : null,
    fournisseurId: input.fournisseurId ?? null,
    pieceId: input.pieceId ?? null,
    referenceFacture: input.referenceFacture ?? null,
    notes: input.notes ?? null,
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function listerImmobilisations(contribuableId: number, exerciceId?: number) {
  const rows = await db
    .select({ immobilisation: cptaImmobilisations, compteNumero: cptaComptes.numero, compteLibelle: cptaComptes.libelle })
    .from(cptaImmobilisations)
    .innerJoin(cptaComptes, eq(cptaImmobilisations.compteId, cptaComptes.id))
    .where(eq(cptaImmobilisations.contribuableId, contribuableId))
    .orderBy(asc(cptaComptes.numero), asc(cptaImmobilisations.code));
  if (rows.length === 0) return [];

  // À la clôture de l'exercice demandé — ou aujourd'hui, à défaut —, ce qui
  // est amorti et ce qui reste, pour lire le registre d'un coup d'œil.
  const exercices = await exercicesDe(contribuableId);
  const exercice = exerciceId ? exercices.find((e) => e.id === exerciceId) : undefined;
  const date = exercice?.dateFin ?? exercices[exercices.length - 1].dateFin;
  const dotees = exercice
    ? new Set((await db.select({ id: cptaDotations.immobilisationId }).from(cptaDotations).where(eq(cptaDotations.exerciceId, exercice.id))).map((d) => d.id))
    : new Set<number>();

  return rows.map((r) => {
    const f = fiche(r.immobilisation);
    const periodes = periodesPourPlan(exercices, f);
    const cumul = calculer(() => cumulADate(f, periodes, date));
    return {
      ...r.immobilisation,
      compteNumero: r.compteNumero,
      compteLibelle: r.compteLibelle,
      cumulAmortissements: formatMontant(cumul),
      valeurNette: formatMontant(f.valeurOrigine - cumul),
      doteeDansExercice: exercice ? dotees.has(r.immobilisation.id) : null,
    };
  });
}

export async function getImmobilisation(id: number) {
  const [row] = await db
    .select({
      immobilisation: cptaImmobilisations,
      compteNumero: cptaComptes.numero,
      compteLibelle: cptaComptes.libelle,
      fournisseur: { code: cptaTiers.code, raisonSociale: cptaTiers.raisonSociale },
    })
    .from(cptaImmobilisations)
    .innerJoin(cptaComptes, eq(cptaImmobilisations.compteId, cptaComptes.id))
    .leftJoin(cptaTiers, eq(cptaImmobilisations.fournisseurId, cptaTiers.id))
    .where(eq(cptaImmobilisations.id, id));
  if (!row) throw notFound("Immobilisation introuvable.");
  const i = row.immobilisation;
  const exercices = await exercicesDe(i.contribuableId);
  const f = fiche(i);
  const periodes = periodesPourPlan(exercices, f);
  const plan = calculer(() => planAmortissement(f, periodes));
  const dotations = await db
    .select({
      exerciceId: cptaDotations.exerciceId,
      montant: cptaDotations.montant,
      ecritureId: cptaDotations.ecritureId,
      numeroPiece: cptaEcritures.numeroPiece,
      statut: cptaEcritures.statut,
    })
    .from(cptaDotations)
    .innerJoin(cptaEcritures, eq(cptaDotations.ecritureId, cptaEcritures.id))
    .where(eq(cptaDotations.immobilisationId, id));
  const parExercice = new Map(exercices.map((e) => [`${e.dateDebut}|${e.dateFin}`, e]));
  let sortie: { numeroPiece: string | null; statut: string } | null = null;
  if (i.ecritureSortieId) {
    const [e] = await db.select({ numeroPiece: cptaEcritures.numeroPiece, statut: cptaEcritures.statut }).from(cptaEcritures).where(eq(cptaEcritures.id, i.ecritureSortieId));
    sortie = e ?? null;
  }
  return {
    ...i,
    compteNumero: row.compteNumero,
    compteLibelle: row.compteLibelle,
    fournisseur: row.fournisseur?.code ? row.fournisseur : null,
    modifiable: dotations.length === 0 && i.statut === "EN_SERVICE",
    plan: plan.map((l) => {
      const ex = parExercice.get(`${l.dateDebut}|${l.dateFin}`);
      const passee = ex ? dotations.find((d) => d.exerciceId === ex.id) : undefined;
      return {
        ...l,
        base: formatMontant(l.base),
        dotation: formatMontant(l.dotation),
        cumulFin: formatMontant(l.cumulFin),
        vncFin: formatMontant(l.vncFin),
        exercice: ex ? { id: ex.id, libelle: ex.libelle, statut: ex.statut } : null,
        passee: passee ? { montant: passee.montant, ecritureId: passee.ecritureId, numeroPiece: passee.numeroPiece } : null,
      };
    }),
    ecritureSortie: sortie,
  };
}

// ---------------------------------------------------------------------------
// Fiches
// ---------------------------------------------------------------------------

export async function creerImmobilisation(contribuableId: number, input: EntreeImmobilisation, userId: number | null) {
  const { amortissable } = await verifierEntree(input, contribuableId);
  const [existante] = await db
    .select({ id: cptaImmobilisations.id })
    .from(cptaImmobilisations)
    .where(and(eq(cptaImmobilisations.contribuableId, contribuableId), eq(cptaImmobilisations.code, input.code.trim())));
  if (existante) throw conflict(`Le code ${input.code.trim()} est déjà pris.`);
  const [row] = await db
    .insert(cptaImmobilisations)
    .values({ contribuableId, createdBy: userId, ...colonnes(input, amortissable) })
    .returning();
  return getImmobilisation(row.id);
}

export async function modifierImmobilisation(id: number, input: EntreeImmobilisation) {
  const [i] = await db.select().from(cptaImmobilisations).where(eq(cptaImmobilisations.id, id));
  if (!i) throw notFound("Immobilisation introuvable.");
  if (i.statut !== "EN_SERVICE") throw conflict("Un bien sorti de l'actif ne se modifie plus.");
  const { amortissable } = await verifierEntree(input, i.contribuableId);
  const dotees = await db.select({ id: cptaDotations.id }).from(cptaDotations).where(eq(cptaDotations.immobilisationId, id));
  const c = colonnes(input, amortissable);
  if (dotees.length > 0) {
    // Le plan a déjà été constaté : ce qui le détermine ne bouge plus.
    const figes: (keyof typeof c)[] = ["compteId", "compteAmortissementId", "compteDotationId", "dateMiseEnService", "valeurOrigine", "valeurResiduelle", "mode", "dureeMois"];
    const changes = figes.filter((k) => String(c[k] ?? "") !== String(i[k] ?? ""));
    if (changes.length > 0) {
      throw conflict("Une dotation a déjà été passée sur ce bien : ses paramètres d'amortissement ne se modifient plus.");
    }
  }
  if (c.code !== i.code) {
    const [existante] = await db
      .select({ id: cptaImmobilisations.id })
      .from(cptaImmobilisations)
      .where(and(eq(cptaImmobilisations.contribuableId, i.contribuableId), eq(cptaImmobilisations.code, c.code)));
    if (existante) throw conflict(`Le code ${c.code} est déjà pris.`);
  }
  await db.update(cptaImmobilisations).set(c).where(eq(cptaImmobilisations.id, id));
  return getImmobilisation(id);
}

export async function supprimerImmobilisation(id: number) {
  const [i] = await db.select().from(cptaImmobilisations).where(eq(cptaImmobilisations.id, id));
  if (!i) throw notFound("Immobilisation introuvable.");
  const dotees = await db.select({ id: cptaDotations.id }).from(cptaDotations).where(eq(cptaDotations.immobilisationId, id));
  if (dotees.length > 0 || i.ecritureSortieId) {
    throw conflict("Ce bien a laissé des écritures dans les livres : il ne se supprime pas.");
  }
  await db.delete(cptaImmobilisations).where(eq(cptaImmobilisations.id, id));
}

// ---------------------------------------------------------------------------
// Dotations de l'exercice
// ---------------------------------------------------------------------------

async function journalDivers(contribuableId: number) {
  const [j] = await db
    .select()
    .from(cptaJournaux)
    .where(and(eq(cptaJournaux.contribuableId, contribuableId), eq(cptaJournaux.type, "DIVERS"), eq(cptaJournaux.actif, true)))
    .limit(1);
  if (!j) throw badRequest("Aucun journal d'opérations diverses pour ce contribuable.");
  return j;
}

/** Les biens amortissables encore à doter pour l'exercice : en service, non sortis avant sa fin, sans dotation passée. */
async function biensADoter(exerciceId: number) {
  const exercice = await getExercice(exerciceId);
  const biens = await db
    .select()
    .from(cptaImmobilisations)
    .where(and(eq(cptaImmobilisations.contribuableId, exercice.contribuableId), eq(cptaImmobilisations.statut, "EN_SERVICE")));
  const deja = new Set((await db.select({ id: cptaDotations.immobilisationId }).from(cptaDotations).where(eq(cptaDotations.exerciceId, exerciceId))).map((d) => d.id));
  return {
    exercice,
    biens: biens.filter((b) => b.dureeMois !== null && !deja.has(b.id) && b.dateMiseEnService <= exercice.dateFin),
  };
}

/** Ce que les dotations de l'exercice donneraient, sans rien écrire. */
export async function previsualiserDotations(exerciceId: number) {
  const { exercice, biens } = await biensADoter(exerciceId);
  const exercices = await exercicesDe(exercice.contribuableId);
  const lignes = biens.map((b) => {
    const f = fiche(b);
    const plan = calculer(() => planAmortissement(f, periodesPourPlan(exercices, f)));
    const l = plan.find((x) => x.dateDebut === exercice.dateDebut && x.dateFin === exercice.dateFin);
    return { id: b.id, code: b.code, libelle: b.libelle, dotation: formatMontant(l?.dotation ?? 0) };
  });
  return { exercice: { id: exercice.id, libelle: exercice.libelle, statut: exercice.statut }, lignes: lignes.filter((l) => parseMontant(l.dotation) > 0) };
}

/**
 * Passe les dotations de l'exercice : une écriture d'opérations diverses
 * datée du dernier jour, une paire de lignes par bien. Relancée plus tard —
 * un bien ajouté après coup —, elle ne reprend que ce qui n'a pas encore
 * été doté.
 */
export async function passerDotations(exerciceId: number, userId: number | null) {
  const { exercice, biens } = await biensADoter(exerciceId);
  if (exercice.statut !== "OUVERT") throw conflict("L'exercice n'est pas ouvert.");
  if (biens.length === 0) throw badRequest("Rien à doter : tous les biens amortissables de l'exercice ont leur dotation.");
  const exercices = await exercicesDe(exercice.contribuableId);
  const couverture = periodesCouvrant(exercices, biens.map(fiche));

  const { lignes, dotations } = calculer(() =>
    genererEcritureDotations(
      biens.map((b) => ({
        id: b.id,
        code: b.code,
        libelle: b.libelle,
        fiche: fiche(b),
        comptes: { dotation: b.compteDotationId!, amortissement: b.compteAmortissementId! },
      })),
      couverture,
      { dateDebut: exercice.dateDebut, dateFin: exercice.dateFin },
      exercice.libelle,
    ),
  );
  if (lignes.length === 0) throw badRequest("Rien à doter : aucune dotation n'est due pour cet exercice.");

  const journal = await journalDivers(exercice.contribuableId);
  const brouillon = await creerBrouillon(
    {
      exerciceId,
      journalId: journal.id,
      dateEcriture: exercice.dateFin,
      libelle: `Dotations aux amortissements ${exercice.libelle}`,
      reference: `DOT ${exercice.dateFin.slice(0, 4)}`,
      origine: "AMORTISSEMENT",
      origineId: exerciceId,
      lignes,
    },
    userId,
  );
  const ecriture = await validerEcritureEnBase(brouillon.id, userId);
  await db.insert(cptaDotations).values(
    dotations.map((d) => ({ immobilisationId: d.immobilisationId, exerciceId, montant: formatMontant(d.montant), ecritureId: ecriture.id })),
  );
  return { ecriture, dotations: dotations.map((d) => ({ ...d, montant: formatMontant(d.montant) })) };
}

// ---------------------------------------------------------------------------
// Sortie
// ---------------------------------------------------------------------------

export type EntreeSortie = {
  dateSortie: string;
  /** Prix de cession hors taxes ; nul ou absent pour une mise au rebut. */
  prixCession?: string | number | null;
  notes?: string | null;
};

async function comptesDeSortie(contribuableId: number, compteImmobilisation: string) {
  const rows = await db
    .select({ id: cptaComptes.id, numero: cptaComptes.numero })
    .from(cptaComptes)
    .where(and(eq(cptaComptes.contribuableId, contribuableId), eq(cptaComptes.actif, true)));
  const parNumero = new Map(rows.map((r) => [r.numero, r.id]));
  const incorporelle = compteImmobilisation.startsWith("21");
  const trouve = (numeros: string[]) => numeros.map((n) => parNumero.get(n)).find((id) => id !== undefined) ?? null;
  const valeurComptable = trouve(incorporelle ? ["811", "812", "81"] : ["812", "81"]);
  if (!valeurComptable) throw badRequest("Le plan comptable n'a pas de compte 812 (valeur comptable des cessions).");
  return {
    valeurComptable,
    produitCession: trouve(incorporelle ? ["821", "822", "82"] : ["822", "82"]),
    creanceCession: trouve(["485"]),
  };
}

/**
 * Sort le bien de l'actif à la date dite : dotation complémentaire jusqu'à
 * la sortie, amortissements et valeur d'origine soldés, valeur nette en
 * charge, prix de cession en produit. La fiche garde la date, le prix et
 * l'écriture.
 */
export async function sortirImmobilisation(id: number, input: EntreeSortie, userId: number | null) {
  const [i] = await db.select().from(cptaImmobilisations).where(eq(cptaImmobilisations.id, id));
  if (!i) throw notFound("Immobilisation introuvable.");
  if (i.statut !== "EN_SERVICE") throw conflict("Ce bien est déjà sorti de l'actif.");
  const prix = parseMontant(input.prixCession ?? 0);

  const [exercice] = await db
    .select()
    .from(cptaExercices)
    .where(and(eq(cptaExercices.contribuableId, i.contribuableId), lte(cptaExercices.dateDebut, input.dateSortie), gte(cptaExercices.dateFin, input.dateSortie)))
    .limit(1);
  if (!exercice) throw badRequest(`Aucun exercice comptable ne couvre le ${input.dateSortie}.`);
  if (exercice.statut !== "OUVERT") throw conflict(`L'exercice ${exercice.libelle} n'est plus ouvert.`);

  const exercices = await exercicesDe(i.contribuableId);
  const f = fiche(i);
  const periodes = periodesPourPlan(exercices, f);
  const [dejaPassee] = await db
    .select({ id: cptaDotations.id, montant: cptaDotations.montant })
    .from(cptaDotations)
    .where(and(eq(cptaDotations.immobilisationId, id), eq(cptaDotations.exerciceId, exercice.id)));
  const [compteImmo] = await db.select({ numero: cptaComptes.numero }).from(cptaComptes).where(eq(cptaComptes.id, i.compteId));
  const comptes = await comptesDeSortie(i.contribuableId, compteImmo.numero);

  const r = calculer(() =>
    genererEcritureSortie({
      code: i.code,
      libelle: i.libelle,
      fiche: f,
      dateSortie: input.dateSortie,
      prixCession: prix,
      cumulDebutExercice: cumulADate(f, periodes, veille(exercice.dateDebut)),
      dotationDejaPassee: dejaPassee ? parseMontant(dejaPassee.montant) : 0,
      exercice: { dateDebut: exercice.dateDebut, dateFin: exercice.dateFin },
      periodes,
      comptes: { immobilisation: i.compteId, amortissement: i.compteAmortissementId, dotation: i.compteDotationId, ...comptes },
    }),
  );

  const journal = await journalDivers(i.contribuableId);
  const motif = prix > 0 ? "Cession" : "Mise au rebut";
  const brouillon = await creerBrouillon(
    {
      exerciceId: exercice.id,
      journalId: journal.id,
      dateEcriture: input.dateSortie,
      libelle: `${motif} — ${i.code} ${i.libelle}`,
      reference: i.code,
      origine: "CESSION",
      origineId: i.id,
      lignes: r.lignes,
    },
    userId,
  );
  const ecriture = await validerEcritureEnBase(brouillon.id, userId);

  await db.transaction(async (tx) => {
    await tx
      .update(cptaImmobilisations)
      .set({
        statut: prix > 0 ? "CEDEE" : "REBUT",
        dateSortie: input.dateSortie,
        prixCession: formatMontant(prix),
        ecritureSortieId: ecriture.id,
        notes: input.notes ?? i.notes,
        updatedAt: new Date(),
      })
      .where(eq(cptaImmobilisations.id, id));
    // La dotation complémentaire compte comme dotation de l'exercice : elle
    // s'ajoute à celle déjà passée, ou en tient lieu.
    if (r.dotationComplementaire > 0) {
      if (dejaPassee) {
        await tx
          .update(cptaDotations)
          .set({ montant: formatMontant(parseMontant(dejaPassee.montant) + r.dotationComplementaire) })
          .where(eq(cptaDotations.id, dejaPassee.id));
      } else {
        await tx.insert(cptaDotations).values({ immobilisationId: id, exerciceId: exercice.id, montant: formatMontant(r.dotationComplementaire), ecritureId: ecriture.id });
      }
    }
  });
  return { ...(await getImmobilisation(id)), ecriture, vnc: formatMontant(r.vnc), dotationComplementaire: formatMontant(r.dotationComplementaire) };
}

// ---------------------------------------------------------------------------
// Tableau des immobilisations
// ---------------------------------------------------------------------------

export async function getTableauImmobilisations(exerciceId: number) {
  const exercice = await getExercice(exerciceId);
  const exercices = await exercicesDe(exercice.contribuableId);
  const rows = await db
    .select({ immobilisation: cptaImmobilisations, compteNumero: cptaComptes.numero })
    .from(cptaImmobilisations)
    .innerJoin(cptaComptes, eq(cptaImmobilisations.compteId, cptaComptes.id))
    .where(eq(cptaImmobilisations.contribuableId, exercice.contribuableId))
    .orderBy(asc(cptaComptes.numero), asc(cptaImmobilisations.code));
  const biens = rows.map((r) => ({
    id: r.immobilisation.id,
    code: r.immobilisation.code,
    libelle: r.immobilisation.libelle,
    compteNumero: r.compteNumero,
    fiche: fiche(r.immobilisation),
    dateAcquisition: r.immobilisation.dateAcquisition,
  }));
  const periodes = periodesCouvrant(exercices, biens.map((b) => b.fiche));
  const lignes = calculer(() => tableauImmobilisations(biens, periodes, { dateDebut: exercice.dateDebut, dateFin: exercice.dateFin }));
  const dotees = new Set((await db.select({ id: cptaDotations.immobilisationId }).from(cptaDotations).where(eq(cptaDotations.exerciceId, exerciceId))).map((d) => d.id));
  const m = formatMontant;
  const t = totauxTableau(lignes);
  return {
    exercice: { id: exercice.id, libelle: exercice.libelle, dateDebut: exercice.dateDebut, dateFin: exercice.dateFin },
    lignes: lignes.map((l) => ({
      ...l,
      brutDebut: m(l.brutDebut),
      acquisitions: m(l.acquisitions),
      sorties: m(l.sorties),
      brutFin: m(l.brutFin),
      amortDebut: m(l.amortDebut),
      dotation: m(l.dotation),
      amortSorties: m(l.amortSorties),
      amortFin: m(l.amortFin),
      vncFin: m(l.vncFin),
      dotee: dotees.has(l.id),
    })),
    totaux: {
      brutDebut: m(t.brutDebut),
      acquisitions: m(t.acquisitions),
      sorties: m(t.sorties),
      brutFin: m(t.brutFin),
      amortDebut: m(t.amortDebut),
      dotation: m(t.dotation),
      amortSorties: m(t.amortSorties),
      amortFin: m(t.amortFin),
      vncFin: m(t.vncFin),
    },
  };
}

/** Nombre de biens amortissables de l'exercice qui attendent encore leur dotation — pour les contrôles de clôture. */
export async function biensSansDotation(exerciceId: number) {
  const { biens } = await biensADoter(exerciceId);
  return biens.map((b) => b.code);
}
