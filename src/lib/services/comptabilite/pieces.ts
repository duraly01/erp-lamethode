import "server-only";
import { and, eq, inArray, or, like } from "drizzle-orm";
import { db } from "@/db";
import {
  cptaComptes,
  cptaEcritures,
  cptaJournaux,
  cptaTaxes,
  cptaTiers,
} from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/http";
import { parseMontant } from "@/lib/comptable/money";
import {
  genererFactureVente,
  genererFactureAchat,
  genererReglement,
  genererLiquidationTva,
  PieceInvalideError,
  type EcritureGeneree,
  type LignePiece,
  type TaxeApplicable,
} from "@/lib/comptable/generation";
import { bornesPeriodeMensuelle } from "@/lib/comptable/tva";
import { getExercice } from "./exercices";
import { creerBrouillon, validerEcritureEnBase } from "./ecritures";
import { getDeclarationTva } from "./tva";

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

export async function enregistrerFactureVente(input: EntreeFacture, userId: number | null) {
  const exercice = await getExercice(input.exerciceId);
  const [client, lignes, journal] = await Promise.all([
    chargerTiers(input.tiersId, exercice.contribuableId),
    lignesPiece(input.lignes, exercice.contribuableId, input.dateEcriture),
    input.journalId
      ? journalParId(input.journalId, exercice.contribuableId)
      : journalParDefaut(exercice.contribuableId, "VENTE"),
  ]);

  const generee = generer(() =>
    genererFactureVente({
      client,
      lignes,
      reference: input.reference,
      dateEcheance: input.dateEcheance,
    }),
  );

  return enregistrer(
    generee,
    {
      exerciceId: input.exerciceId,
      journalId: journal.id,
      dateEcriture: input.dateEcriture,
      origine: "FACTURE_VENTE",
      valider: !!input.valider,
    },
    userId,
  );
}

export async function enregistrerFactureAchat(input: EntreeFacture, userId: number | null) {
  const exercice = await getExercice(input.exerciceId);
  const [fournisseur, lignes, journal] = await Promise.all([
    chargerTiers(input.tiersId, exercice.contribuableId),
    lignesPiece(input.lignes, exercice.contribuableId, input.dateEcriture),
    input.journalId
      ? journalParId(input.journalId, exercice.contribuableId)
      : journalParDefaut(exercice.contribuableId, "ACHAT"),
  ]);

  const generee = generer(() =>
    genererFactureAchat({
      fournisseur,
      lignes,
      reference: input.reference,
      dateEcheance: input.dateEcheance,
    }),
  );

  return enregistrer(
    generee,
    {
      exerciceId: input.exerciceId,
      journalId: journal.id,
      dateEcriture: input.dateEcriture,
      origine: "FACTURE_ACHAT",
      valider: !!input.valider,
    },
    userId,
  );
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

  const generee = generer(() =>
    genererReglement({
      tiers,
      compteTresorerieId: journal.compteContrepartieId!,
      montant: parseMontant(input.montant),
      sens: input.sens,
      reference: input.reference,
    }),
  );

  return enregistrer(
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
