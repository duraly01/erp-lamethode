import "server-only";
import { and, desc, eq, inArray, or, like, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  contribuables,
  cptaComptes,
  cptaEcritures,
  cptaExercices,
  cptaJournaux,
  cptaLignesEcriture,
  cptaPieceLignes,
  cptaPieces,
  cptaTaxes,
  cptaTiers,
} from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/http";
import { formatMontant, parseMontant } from "@/lib/comptable/money";
import {
  genererFactureVente,
  genererFactureAchat,
  genererReglement,
  genererLiquidationTva,
  PieceInvalideError,
  tvaParTaxe,
  type EcritureGeneree,
  type LignePiece,
  type TaxeApplicable,
} from "@/lib/comptable/generation";
import { bornesPeriodeMensuelle } from "@/lib/comptable/tva";
import { getExercice } from "./exercices";
import { creerBrouillon, validerEcritureEnBase } from "./ecritures";
import { getDeclarationTva } from "./tva";
import { getPostesOuverts, lettrerLignes } from "./lettrage";
import type { PiecePdf } from "@/lib/exports/piece-comptable-pdf";

/**
 * Saisie assistée : une pièce entre, une écriture sort.
 *
 * Ce service rassemble ce dont le moteur de génération a besoin — le tiers et
 * son compte, les taxes en vigueur à la date de la pièce, le journal et son
 * compte de contrepartie — puis confie l'écriture à `creerBrouillon`, qui la
 * traite exactement comme une saisie manuelle. La génération ne dispense de
 * rien : la même validation s'applique, la même numérotation, le même journal.
 */

type TypeJournal = (typeof cptaJournaux.$inferSelect)["type"];

export type LigneSaisiePiece = {
  compteId: number;
  libelle?: string | null;
  /** Montant hors taxes en francs saisis, tel qu'il figure sur la pièce. */
  montantHt: string | number;
  taxeId?: number | null;
};

export type EntreeFacture = {
  exerciceId: number;
  /** À défaut, le journal du type attendu (ventes ou achats). */
  journalId?: number | null;
  dateEcriture: string;
  reference?: string | null;
  dateEcheance?: string | null;
  tiersId: number;
  lignes: LigneSaisiePiece[];
  /** Valider dans la foulée, au lieu de laisser un brouillon. */
  valider?: boolean;
};

export type EntreeReglement = {
  exerciceId: number;
  /** Journal de banque ou de caisse : son compte de contrepartie est la trésorerie. */
  journalId: number;
  dateEcriture: string;
  reference?: string | null;
  tiersId: number;
  montant: string | number;
  sens: "ENCAISSEMENT" | "DECAISSEMENT";
  valider?: boolean;
  /**
   * Lignes de facture que ce règlement solde, à lettrer avec lui.
   *
   * Leur somme doit faire exactement le montant : un lettrage ne se pose que
   * sur un groupe qui se solde. Exige la validation, un brouillon ne se
   * lettrant pas.
   */
  lettrerAvec?: number[];
};

// ---------------------------------------------------------------------------
// Chargement du contexte
// ---------------------------------------------------------------------------

async function chargerTiers(tiersId: number, contribuableId: number) {
  const [tiers] = await db
    .select()
    .from(cptaTiers)
    .where(and(eq(cptaTiers.id, tiersId), eq(cptaTiers.contribuableId, contribuableId)));
  if (!tiers) throw notFound("Tiers introuvable pour ce contribuable.");
  if (!tiers.compteId) {
    throw badRequest(
      `Le tiers « ${tiers.raisonSociale} » n'est rattaché à aucun compte collectif : ` +
        "indiquez son compte (411 pour un client, 401 pour un fournisseur) avant de lui imputer une pièce.",
    );
  }
  return { id: tiers.id, compteId: tiers.compteId, raisonSociale: tiers.raisonSociale };
}

/**
 * Les taxes demandées, telles qu'elles sont en vigueur à la date de la pièce.
 *
 * Une taxe est datée : demander aujourd'hui le taux d'une facture de l'an
 * dernier doit rendre le taux de l'an dernier. Une taxe hors de sa période de
 * validité est refusée plutôt que substituée en silence.
 */
async function chargerTaxes(
  ids: number[],
  contribuableId: number,
  date: string,
): Promise<Map<number, TaxeApplicable>> {
  if (ids.length === 0) return new Map();

  const rows = await db
    .select()
    .from(cptaTaxes)
    .where(and(inArray(cptaTaxes.id, ids), eq(cptaTaxes.contribuableId, contribuableId)));

  const parId = new Map<number, TaxeApplicable>();
  for (const t of rows) {
    const enVigueur =
      t.valideDu <= date && (t.valideAu === null || t.valideAu >= date);
    if (!enVigueur) {
      throw badRequest(
        `La taxe « ${t.libelle} » n'est pas en vigueur au ${date} ` +
          `(valide du ${t.valideDu}${t.valideAu ? ` au ${t.valideAu}` : ""}).`,
      );
    }
    if (!t.compteId) {
      throw badRequest(`La taxe « ${t.libelle} » n'est rattachée à aucun compte.`);
    }
    parId.set(t.id, { id: t.id, taux: t.taux, compteId: t.compteId });
  }

  for (const id of ids) {
    if (!parId.has(id)) throw notFound(`Taxe ${id} introuvable pour ce contribuable.`);
  }
  return parId;
}

async function journalParDefaut(contribuableId: number, type: TypeJournal) {
  const [j] = await db
    .select()
    .from(cptaJournaux)
    .where(
      and(
        eq(cptaJournaux.contribuableId, contribuableId),
        eq(cptaJournaux.type, type),
        eq(cptaJournaux.actif, true),
      ),
    )
    .limit(1);
  if (!j) throw badRequest(`Aucun journal de type ${type} pour ce contribuable.`);
  return j;
}

async function journalParId(journalId: number, contribuableId: number) {
  const [j] = await db
    .select()
    .from(cptaJournaux)
    .where(and(eq(cptaJournaux.id, journalId), eq(cptaJournaux.contribuableId, contribuableId)));
  if (!j) throw notFound("Journal introuvable pour ce contribuable.");
  return j;
}

async function lignesPiece(
  lignes: LigneSaisiePiece[],
  contribuableId: number,
  date: string,
): Promise<LignePiece[]> {
  const taxes = await chargerTaxes(
    [...new Set(lignes.map((l) => l.taxeId).filter((id): id is number => !!id))],
    contribuableId,
    date,
  );
  return lignes.map((l) => ({
    compteId: l.compteId,
    libelle: l.libelle ?? null,
    montantHt: parseMontant(l.montantHt),
    taxe: l.taxeId ? taxes.get(l.taxeId)! : null,
  }));
}

/** Traduit une erreur du moteur en réponse HTTP lisible. */
function generer<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof PieceInvalideError) throw badRequest(e.message);
    throw e;
  }
}

async function enregistrer(
  generee: EcritureGeneree,
  p: {
    exerciceId: number;
    journalId: number;
    dateEcriture: string;
    origine: NonNullable<Parameters<typeof creerBrouillon>[0]["origine"]>;
    origineId?: number;
    valider: boolean;
  },
  userId: number | null,
) {
  const brouillon = await creerBrouillon(
    {
      exerciceId: p.exerciceId,
      journalId: p.journalId,
      dateEcriture: p.dateEcriture,
      libelle: generee.libelle,
      reference: generee.reference,
      origine: p.origine,
      origineId: p.origineId ?? null,
      lignes: generee.lignes,
    },
    userId,
  );

  const ecriture = p.valider
    ? await validerEcritureEnBase(brouillon.id, userId)
    : brouillon;

  return { ecriture, generee };
}

// ---------------------------------------------------------------------------
// Pièces
// ---------------------------------------------------------------------------

/**
 * Persiste la pièce, génère et enregistre son écriture, et lie les deux.
 *
 * La pièce est écrite d'abord : c'est elle que l'on retrouve, relit, et dont
 * on suit le règlement. L'écriture la désigne par `origine_id`, la pièce
 * désigne l'écriture par `ecriture_id` — le lien tient dans les deux sens,
 * et survit à la suppression d'un brouillon (la pièce reste, à
 * recomptabiliser).
 */
async function enregistrerFacture(
  type: "FACTURE_VENTE" | "FACTURE_ACHAT",
  input: EntreeFacture,
  userId: number | null,
) {
  const exercice = await getExercice(input.exerciceId);
  const [tiers, lignes, journal] = await Promise.all([
    chargerTiers(input.tiersId, exercice.contribuableId),
    lignesPiece(input.lignes, exercice.contribuableId, input.dateEcriture),
    input.journalId
      ? journalParId(input.journalId, exercice.contribuableId)
      : journalParDefaut(exercice.contribuableId, type === "FACTURE_VENTE" ? "VENTE" : "ACHAT"),
  ]);

  const commun = { lignes, reference: input.reference, dateEcheance: input.dateEcheance };
  const generee = generer(() =>
    type === "FACTURE_VENTE"
      ? genererFactureVente({ client: tiers, ...commun })
      : genererFactureAchat({ fournisseur: tiers, ...commun }),
  );

  const piece = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(cptaPieces)
      .values({
        contribuableId: exercice.contribuableId,
        exerciceId: input.exerciceId,
        type,
        reference: input.reference ?? null,
        tiersId: tiers.id,
        datePiece: input.dateEcriture,
        dateEcheance: input.dateEcheance ?? null,
        totalHt: formatMontant(generee.totalHt),
        totalTva: formatMontant(generee.totalTva),
        totalTtc: formatMontant(generee.totalTtc),
        createdBy: userId,
      })
      .returning();
    await tx.insert(cptaPieceLignes).values(
      lignes.map((l, i) => ({
        pieceId: p.id,
        ordre: i,
        compteId: l.compteId,
        libelle: l.libelle ?? null,
        montantHt: formatMontant(l.montantHt),
        taxeId: l.taxe?.id ?? null,
      })),
    );
    return p;
  });

  const resultat = await enregistrer(
    generee,
    {
      exerciceId: input.exerciceId,
      journalId: journal.id,
      dateEcriture: input.dateEcriture,
      origine: type,
      origineId: piece.id,
      valider: !!input.valider,
    },
    userId,
  );

  await db
    .update(cptaPieces)
    .set({ ecritureId: resultat.ecriture.id })
    .where(eq(cptaPieces.id, piece.id));

  return { ...resultat, piece: { ...piece, ecritureId: resultat.ecriture.id } };
}

export async function enregistrerFactureVente(input: EntreeFacture, userId: number | null) {
  return enregistrerFacture("FACTURE_VENTE", input, userId);
}

export async function enregistrerFactureAchat(input: EntreeFacture, userId: number | null) {
  return enregistrerFacture("FACTURE_ACHAT", input, userId);
}

/**
 * Règlement sur un journal de trésorerie.
 *
 * Le compte de trésorerie n'est pas demandé : c'est le compte de contrepartie
 * du journal — la banque pour le journal de banque, la caisse pour celui de
 * caisse. Le demander à nouveau ouvrirait la porte à un règlement « de banque »
 * imputé en caisse.
 */
export async function enregistrerReglement(input: EntreeReglement, userId: number | null) {
  const exercice = await getExercice(input.exerciceId);
  const [tiers, journal] = await Promise.all([
    chargerTiers(input.tiersId, exercice.contribuableId),
    journalParId(input.journalId, exercice.contribuableId),
  ]);

  if (journal.type !== "BANQUE" && journal.type !== "CAISSE") {
    throw badRequest(
      `Le journal ${journal.code} n'est pas un journal de trésorerie : un règlement se passe en banque ou en caisse.`,
    );
  }
  if (!journal.compteContrepartieId) {
    throw badRequest(
      `Le journal ${journal.code} n'a pas de compte de contrepartie : indiquez son compte de trésorerie.`,
    );
  }

  const montant = parseMontant(input.montant);
  const aLettrer = input.lettrerAvec ?? [];

  // Tout ce qui pourrait faire échouer le lettrage est vérifié ici, avant que
  // l'écriture n'existe : un règlement validé puis un lettrage refusé
  // laisseraient une pièce à moitié traitée, ce qui est pire qu'un refus net.
  if (aLettrer.length > 0) {
    if (!input.valider) {
      throw badRequest("Le lettrage exige de valider le règlement : un brouillon ne se lettre pas.");
    }
    const ouverts = await getPostesOuverts(tiers.compteId, tiers.id);
    const parId = new Map(ouverts.map((p) => [p.ligneId, p]));
    const inconnus = aLettrer.filter((id) => !parId.has(id));
    if (inconnus.length > 0) {
      throw badRequest(
        "Une ligne à lettrer au moins n'est pas un poste ouvert de ce tiers : déjà lettrée, au brouillon, ou d'un autre tiers.",
      );
    }
    // Le reste dû dans le sens du règlement doit faire exactement le montant.
    const reste = aLettrer.reduce((t, id) => {
      const s = parId.get(id)!.solde;
      return t + (input.sens === "ENCAISSEMENT" ? s : -s);
    }, 0);
    if (reste !== montant) {
      throw badRequest(
        "Les factures désignées ne se soldent pas par ce règlement : leur reste dû ne fait pas le montant réglé. " +
          "Un règlement partiel se lettre plus tard, avec le complément.",
      );
    }
  }

  const generee = generer(() =>
    genererReglement({
      tiers,
      compteTresorerieId: journal.compteContrepartieId!,
      montant,
      sens: input.sens,
      reference: input.reference,
    }),
  );

  const resultat = await enregistrer(
    generee,
    {
      exerciceId: input.exerciceId,
      journalId: journal.id,
      dateEcriture: input.dateEcriture,
      origine: "REGLEMENT",
      valider: !!input.valider,
    },
    userId,
  );

  if (aLettrer.length === 0) return { ...resultat, lettrage: null };

  // La ligne du règlement sur le compte du tiers, à lettrer avec les factures.
  const [ligneTiers] = await db
    .select({ id: cptaLignesEcriture.id })
    .from(cptaLignesEcriture)
    .where(
      and(
        eq(cptaLignesEcriture.ecritureId, resultat.ecriture.id),
        eq(cptaLignesEcriture.compteId, tiers.compteId),
      ),
    );
  const lettrage = await lettrerLignes(tiers.compteId, [ligneTiers.id, ...aLettrer], userId);

  return { ...resultat, lettrage };
}

// ---------------------------------------------------------------------------
// Liquidation de la TVA
// ---------------------------------------------------------------------------

const LIBELLE_LIQUIDATION = "Liquidation de la TVA — ";

/**
 * Passe l'écriture de liquidation de la TVA d'un mois, au journal des
 * opérations diverses, datée du dernier jour de la période.
 *
 * Une seule liquidation par période : une seconde redéclarerait le mois. La
 * garde repose sur le libellé et la référence de l'écriture, qui sont ceux que
 * ce service pose — une liquidation saisie à la main sous un autre libellé ne
 * serait pas vue, et c'est une limite connue.
 */
export async function liquiderTva(
  exerciceId: number,
  periode: string,
  userId: number | null,
  options: { valider?: boolean } = {},
) {
  const exercice = await getExercice(exerciceId);
  const bornes = bornesPeriodeMensuelle(periode);

  const [deja] = await db
    .select({ id: cptaEcritures.id, statut: cptaEcritures.statut })
    .from(cptaEcritures)
    .where(
      and(
        eq(cptaEcritures.exerciceId, exerciceId),
        eq(cptaEcritures.reference, periode),
        like(cptaEcritures.libelle, `${LIBELLE_LIQUIDATION}%`),
        or(
          eq(cptaEcritures.statut, "BROUILLON"),
          eq(cptaEcritures.statut, "VALIDEE"),
        ),
      ),
    )
    .limit(1);
  if (deja) {
    throw conflict(
      `La TVA de ${periode} a déjà été liquidée (écriture n° ${deja.id}, ${deja.statut.toLowerCase()}).`,
    );
  }

  const declaration = await getDeclarationTva(exerciceId, periode);

  // Les comptes de TVA du contribuable, par numéro : le calcul les désigne
  // ainsi, l'écriture a besoin de leurs identifiants.
  const comptes = await db
    .select({ id: cptaComptes.id, numero: cptaComptes.numero })
    .from(cptaComptes)
    .where(
      and(
        eq(cptaComptes.contribuableId, exercice.contribuableId),
        like(cptaComptes.numero, "44%"),
      ),
    );
  const parNumero = new Map(comptes.map((c) => [c.numero, c.id]));
  const exiger = (numero: string) => {
    const id = parNumero.get(numero);
    if (!id) throw badRequest(`Le compte ${numero} n'existe pas dans le plan de ce contribuable.`);
    return id;
  };

  const generee = generer(() =>
    genererLiquidationTva(declaration, {
      parNumero: exiger,
      tvaDueId: exiger("4441"),
      creditAReporterId: exiger("4449"),
    }),
  );

  const journal = await journalParDefaut(exercice.contribuableId, "DIVERS");

  return enregistrer(
    generee,
    {
      exerciceId,
      journalId: journal.id,
      dateEcriture: bornes.dateFin,
      origine: "MANUELLE",
      valider: !!options.valider,
    },
    userId,
  );
}

// ---------------------------------------------------------------------------
// Lecture des pièces
// ---------------------------------------------------------------------------

export type StatutComptable = "NON_COMPTABILISEE" | "BROUILLON" | "VALIDEE" | "CONTREPASSEE";
export type StatutReglement = "SANS_OBJET" | "EN_ATTENTE" | "EN_RETARD" | "REGLEE";

/**
 * Statut de règlement d'une facture, lu sur le lettrage de sa ligne de tiers.
 *
 * Lettrée, elle est réglée — c'est la définition du lettrage. Non lettrée,
 * elle attend, ou elle est en retard si son échéance est passée. Une pièce
 * non validée n'a pas de règlement à suivre : sa ligne n'est pas encore un
 * mouvement.
 */
function statutReglement(
  statutComptable: StatutComptable,
  lettrage: string | null,
  dateEcheance: string | null,
  aujourdhui: string,
): StatutReglement {
  if (statutComptable !== "VALIDEE") return "SANS_OBJET";
  if (lettrage) return "REGLEE";
  if (dateEcheance && dateEcheance < aujourdhui) return "EN_RETARD";
  return "EN_ATTENTE";
}

export type FiltrePieces = {
  exerciceId: number;
  type?: "FACTURE_VENTE" | "FACTURE_ACHAT";
  tiersId?: number;
};

export async function listerPieces(filtre: FiltrePieces, aujourdhui: string) {
  const conditions = [eq(cptaPieces.exerciceId, filtre.exerciceId)];
  if (filtre.type) conditions.push(eq(cptaPieces.type, filtre.type));
  if (filtre.tiersId) conditions.push(eq(cptaPieces.tiersId, filtre.tiersId));

  const rows = await db
    .select({
      piece: cptaPieces,
      tiersCode: cptaTiers.code,
      tiersRaisonSociale: cptaTiers.raisonSociale,
      tiersCompteId: cptaTiers.compteId,
      ecritureStatut: cptaEcritures.statut,
      numeroPiece: cptaEcritures.numeroPiece,
      // Le lettrage de la ligne du tiers, seule ligne de l'écriture sur son compte.
      lettrage: sql<string | null>`(
        select l.lettrage from cpta_lignes_ecriture l
        where l.ecriture_id = ${cptaEcritures.id} and l.compte_id = ${cptaTiers.compteId}
        limit 1
      )`,
    })
    .from(cptaPieces)
    .innerJoin(cptaTiers, eq(cptaPieces.tiersId, cptaTiers.id))
    .leftJoin(cptaEcritures, eq(cptaPieces.ecritureId, cptaEcritures.id))
    .where(and(...conditions))
    .orderBy(desc(cptaPieces.datePiece), desc(cptaPieces.id));

  return rows.map((r) => {
    const statutComptable: StatutComptable = r.ecritureStatut ?? "NON_COMPTABILISEE";
    return {
      ...r.piece,
      tiers: { code: r.tiersCode, raisonSociale: r.tiersRaisonSociale },
      numeroPiece: r.numeroPiece,
      statutComptable,
      statutReglement: statutReglement(statutComptable, r.lettrage, r.piece.dateEcheance, aujourdhui),
    };
  });
}

export async function getPiece(id: number, aujourdhui: string) {
  const [row] = await db.select().from(cptaPieces).where(eq(cptaPieces.id, id));
  if (!row) throw notFound("Pièce introuvable.");

  const [detail] = await listerPieces({ exerciceId: row.exerciceId, tiersId: row.tiersId }, aujourdhui).then(
    (l) => l.filter((p) => p.id === id),
  );

  const lignes = await db
    .select({
      id: cptaPieceLignes.id,
      ordre: cptaPieceLignes.ordre,
      compteId: cptaPieceLignes.compteId,
      compteNumero: cptaComptes.numero,
      compteLibelle: cptaComptes.libelle,
      libelle: cptaPieceLignes.libelle,
      montantHt: cptaPieceLignes.montantHt,
      taxeId: cptaPieceLignes.taxeId,
      taxeLibelle: cptaTaxes.libelle,
      taux: cptaTaxes.taux,
    })
    .from(cptaPieceLignes)
    .innerJoin(cptaComptes, eq(cptaPieceLignes.compteId, cptaComptes.id))
    .leftJoin(cptaTaxes, eq(cptaPieceLignes.taxeId, cptaTaxes.id))
    .where(eq(cptaPieceLignes.pieceId, id))
    .orderBy(cptaPieceLignes.ordre);

  return { ...detail, lignes };
}

// ---------------------------------------------------------------------------
// Impression
// ---------------------------------------------------------------------------

/**
 * La pièce avec tout ce qu'un document imprimé doit porter : l'émetteur,
 * le destinataire, la TVA ventilée par taxe telle qu'elle a été
 * comptabilisée, et l'écriture produite.
 */
export async function getPiecePourImpression(id: number, aujourdhui: string): Promise<PiecePdf> {
  const piece = await getPiece(id, aujourdhui);

  const [ctx] = await db
    .select({
      exerciceLibelle: cptaExercices.libelle,
      contribuable: {
        nom: contribuables.nom,
        niu: contribuables.niu,
        adresse: contribuables.adresseFacturation,
        telephone: contribuables.telephone,
        email: contribuables.email,
        centreImpots: contribuables.centreImpots,
        regimeFiscal: contribuables.regimeFiscal,
      },
      tiers: {
        code: cptaTiers.code,
        raisonSociale: cptaTiers.raisonSociale,
        niu: cptaTiers.niu,
        adresse: cptaTiers.adresse,
        telephone: cptaTiers.telephone,
        email: cptaTiers.email,
      },
    })
    .from(cptaPieces)
    .innerJoin(cptaExercices, eq(cptaPieces.exerciceId, cptaExercices.id))
    .innerJoin(contribuables, eq(cptaPieces.contribuableId, contribuables.id))
    .innerJoin(cptaTiers, eq(cptaPieces.tiersId, cptaTiers.id))
    .where(eq(cptaPieces.id, id));

  // La TVA se ventile par taxe sur la base cumulée, comme à la génération :
  // le document porte ce qui a été comptabilisé, pas une somme d'arrondis.
  const taxes = tvaParTaxe(
    piece.lignes.map((l) => ({
      montantHt: parseMontant(l.montantHt),
      taxe: l.taxeId && l.taux ? { id: l.taxeId, taux: l.taux, libelle: l.taxeLibelle ?? "TVA" } : null,
    })),
  ).map((t) => ({ libelle: t.taxe.libelle, taux: String(t.taxe.taux), base: t.base, montant: t.montant }));

  let ecriture: PiecePdf["ecriture"] = null;
  if (piece.ecritureId) {
    const [e] = await db
      .select({
        numeroPiece: cptaEcritures.numeroPiece,
        dateEcriture: cptaEcritures.dateEcriture,
        statut: cptaEcritures.statut,
        journalCode: cptaJournaux.code,
        journalLibelle: cptaJournaux.libelle,
      })
      .from(cptaEcritures)
      .innerJoin(cptaJournaux, eq(cptaEcritures.journalId, cptaJournaux.id))
      .where(eq(cptaEcritures.id, piece.ecritureId));
    const lignes = await db
      .select({
        compteNumero: cptaComptes.numero,
        compteLibelle: cptaComptes.libelle,
        libelle: cptaLignesEcriture.libelle,
        debit: cptaLignesEcriture.debit,
        credit: cptaLignesEcriture.credit,
      })
      .from(cptaLignesEcriture)
      .innerJoin(cptaComptes, eq(cptaLignesEcriture.compteId, cptaComptes.id))
      .where(eq(cptaLignesEcriture.ecritureId, piece.ecritureId))
      .orderBy(cptaLignesEcriture.ordre);
    ecriture = {
      ...e,
      lignes: lignes.map((l) => ({ ...l, debit: parseMontant(l.debit), credit: parseMontant(l.credit) })),
    };
  }

  return {
    type: piece.type,
    reference: piece.reference,
    datePiece: piece.datePiece,
    dateEcheance: piece.dateEcheance,
    notes: piece.notes,
    exercice: { libelle: ctx.exerciceLibelle },
    contribuable: ctx.contribuable,
    tiers: ctx.tiers,
    lignes: piece.lignes.map((l) => ({
      compteNumero: l.compteNumero,
      compteLibelle: l.compteLibelle,
      libelle: l.libelle,
      montantHt: parseMontant(l.montantHt),
      taxeLibelle: l.taxeLibelle,
      taux: l.taux,
    })),
    taxes,
    totalHt: parseMontant(piece.totalHt),
    totalTva: parseMontant(piece.totalTva),
    totalTtc: parseMontant(piece.totalTtc),
    statutComptable: piece.statutComptable,
    statutReglement: piece.statutReglement,
    ecriture,
  };
}
