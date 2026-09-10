// ---------------------------------------------------------------------------
// Écriture comptable — règles de validation, module pur.
//
// Ce fichier concentre les contrôles qui décident si une écriture peut passer
// du brouillon à l'état validé. Il ne connaît ni la base de données ni HTTP :
// tout ce dont il a besoin lui est fourni en argument. C'est ce qui permet de
// le faire relire ligne à ligne par un comptable, et de le couvrir de tests
// sans monter d'environnement.
//
// Une fois validée, une écriture est immuable : elle ne se modifie ni ne se
// supprime, elle se contre-passe (voir `construireContrepassation`).
// ---------------------------------------------------------------------------

import {
  parseMontant,
  sommeMontants,
  montantDansLesBornes,
  MontantInvalideError,
} from "./money";

export type StatutExercice = "OUVERT" | "CLOS" | "VERROUILLE";

/** Ce que la validation a besoin de savoir d'un compte du plan. */
export type CompteContexte = {
  id: number;
  numero: string;
  /** Compte collectif de tiers : la ligne doit désigner un tiers. */
  collectif: boolean;
  actif: boolean;
};

/** Ce que la validation a besoin de savoir de l'exercice visé. */
export type ExerciceContexte = {
  /** Bornes incluses, au format ISO `AAAA-MM-JJ`. */
  dateDebut: string;
  dateFin: string;
  statut: StatutExercice;
};

/** Une ligne telle qu'elle est saisie, montants en unités (pas en centimes). */
export type LigneSaisie = {
  compteId: number;
  tiersId?: number | null;
  libelle?: string | null;
  debit?: string | number | null;
  credit?: string | number | null;
};

export type EcritureSaisie = {
  /** Date de l'opération, au format ISO `AAAA-MM-JJ`. */
  dateEcriture: string;
  libelle: string;
  lignes: LigneSaisie[];
};

/**
 * Code d'erreur stable, destiné à être renvoyé tel quel par l'API et traduit
 * côté interface. Le message français accompagne le code pour les journaux et
 * les cas où l'appelant ne fait pas sa propre traduction.
 */
export type CodeErreurEcriture =
  | "EXERCICE_FERME"
  | "DATE_INVALIDE"
  | "DATE_HORS_EXERCICE"
  | "LIBELLE_REQUIS"
  | "LIGNES_INSUFFISANTES"
  | "MONTANT_INVALIDE"
  | "MONTANT_HORS_BORNES"
  | "SENS_INVALIDE"
  | "COMPTE_INCONNU"
  | "COMPTE_INACTIF"
  | "TIERS_REQUIS"
  | "DESEQUILIBRE";

export type ErreurEcriture = {
  code: CodeErreurEcriture;
  message: string;
  /** Index de la ligne concernée, quand l'erreur est locale à une ligne. */
  ligne?: number;
};

export type ContexteValidation = {
  exercice: ExerciceContexte;
  /** Comptes du contribuable, indexés par identifiant. */
  comptes: Map<number, CompteContexte>;
};

const FORMAT_DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Totaux d'une écriture, en centimes. */
export type TotauxEcriture = {
  debit: number;
  credit: number;
  /** Écart débit − crédit ; nul quand l'écriture est équilibrée. */
  ecart: number;
  equilibree: boolean;
};

/**
 * Additionne les deux colonnes d'une écriture.
 *
 * Les lignes dont un montant est illisible sont ignorées ici : c'est
 * `validerEcriture` qui les signale, avec le numéro de ligne. Faire échouer le
 * calcul des totaux priverait l'utilisateur de tout retour utile.
 */
export function totauxEcriture(lignes: LigneSaisie[]): TotauxEcriture {
  const debits: number[] = [];
  const credits: number[] = [];

  for (const l of lignes) {
    try {
      debits.push(parseMontant(l.debit));
      credits.push(parseMontant(l.credit));
    } catch (e) {
      if (!(e instanceof MontantInvalideError)) throw e;
    }
  }

  const debit = sommeMontants(debits);
  const credit = sommeMontants(credits);
  return { debit, credit, ecart: debit - credit, equilibree: debit === credit };
}

/** La date tombe-t-elle dans les bornes de l'exercice ? Bornes incluses. */
export function estDansExercice(
  date: string,
  exercice: ExerciceContexte,
): boolean {
  // Le format ISO se compare lexicographiquement, sans passer par Date — ce
  // qui évite toute question de fuseau horaire.
  return date >= exercice.dateDebut && date <= exercice.dateFin;
}

/**
 * Vérifie qu'une écriture peut être validée.
 *
 * Renvoie la liste **complète** des erreurs plutôt que la première rencontrée :
 * un comptable qui saisit vingt lignes doit voir d'un coup tout ce qui cloche,
 * pas les découvrir une par une.
 */
export function validerEcriture(
  ecriture: EcritureSaisie,
  ctx: ContexteValidation,
): ErreurEcriture[] {
  const erreurs: ErreurEcriture[] = [];

  // --- En-tête -------------------------------------------------------------

  if (ctx.exercice.statut !== "OUVERT") {
    erreurs.push({
      code: "EXERCICE_FERME",
      message:
        ctx.exercice.statut === "CLOS"
          ? "L'exercice est clos : aucune écriture ne peut y être ajoutée."
          : "L'exercice est verrouillé : aucune écriture ne peut y être ajoutée.",
    });
  }

  if (!FORMAT_DATE_ISO.test(ecriture.dateEcriture)) {
    erreurs.push({
      code: "DATE_INVALIDE",
      message: "La date de l'écriture doit être au format AAAA-MM-JJ.",
    });
  } else if (!estDansExercice(ecriture.dateEcriture, ctx.exercice)) {
    erreurs.push({
      code: "DATE_HORS_EXERCICE",
      message: `La date doit être comprise entre le ${ctx.exercice.dateDebut} et le ${ctx.exercice.dateFin}.`,
    });
  }

  if (!ecriture.libelle || ecriture.libelle.trim() === "") {
    erreurs.push({
      code: "LIBELLE_REQUIS",
      message: "Le libellé de l'écriture est obligatoire.",
    });
  }

  if (ecriture.lignes.length < 2) {
    erreurs.push({
      code: "LIGNES_INSUFFISANTES",
      message: "Une écriture comporte au moins deux lignes.",
    });
  }

  // --- Lignes --------------------------------------------------------------

  ecriture.lignes.forEach((ligne, index) => {
    let debit: number;
    let credit: number;

    try {
      debit = parseMontant(ligne.debit);
      credit = parseMontant(ligne.credit);
    } catch (e) {
      if (!(e instanceof MontantInvalideError)) throw e;
      erreurs.push({
        code: "MONTANT_INVALIDE",
        message: "Le montant saisi n'est pas un nombre exploitable.",
        ligne: index,
      });
      return;
    }

    if (debit < 0 || credit < 0) {
      erreurs.push({
        code: "SENS_INVALIDE",
        message:
          "Un montant ne peut pas être négatif : inversez le sens de la ligne.",
        ligne: index,
      });
    } else if (debit === 0 && credit === 0) {
      erreurs.push({
        code: "SENS_INVALIDE",
        message: "La ligne doit porter un débit ou un crédit.",
        ligne: index,
      });
    } else if (debit !== 0 && credit !== 0) {
      erreurs.push({
        code: "SENS_INVALIDE",
        message:
          "La ligne ne peut pas porter à la fois un débit et un crédit : scindez-la en deux lignes.",
        ligne: index,
      });
    }

    if (!montantDansLesBornes(debit) || !montantDansLesBornes(credit)) {
      erreurs.push({
        code: "MONTANT_HORS_BORNES",
        message: "Le montant dépasse la capacité d'un montant comptable.",
        ligne: index,
      });
    }

    const compte = ctx.comptes.get(ligne.compteId);
    if (!compte) {
      erreurs.push({
        code: "COMPTE_INCONNU",
        message: "Le compte n'existe pas au plan comptable du contribuable.",
        ligne: index,
      });
      return;
    }

    if (!compte.actif) {
      erreurs.push({
        code: "COMPTE_INACTIF",
        message: `Le compte ${compte.numero} est désactivé.`,
        ligne: index,
      });
    }

    if (compte.collectif && (ligne.tiersId === null || ligne.tiersId === undefined)) {
      erreurs.push({
        code: "TIERS_REQUIS",
        message: `Le compte ${compte.numero} est un compte collectif : la ligne doit désigner un tiers.`,
        ligne: index,
      });
    }
  });

  // --- Équilibre -----------------------------------------------------------
  //
  // Contrôlé en dernier : quand une ligne est déjà fautive, annoncer en plus un
  // déséquilibre n'apprend rien. On ne le signale donc que si les lignes sont
  // par ailleurs correctes.

  const aDejaUneErreurDeLigne = erreurs.some((e) => e.ligne !== undefined);
  if (!aDejaUneErreurDeLigne && ecriture.lignes.length >= 2) {
    const totaux = totauxEcriture(ecriture.lignes);
    if (!totaux.equilibree) {
      erreurs.push({
        code: "DESEQUILIBRE",
        message: `L'écriture n'est pas équilibrée : écart de ${formatEcart(totaux.ecart)}.`,
      });
    }
  }

  return erreurs;
}

function formatEcart(ecartCentimes: number): string {
  const absolu = Math.abs(ecartCentimes);
  const entier = Math.floor(absolu / 100);
  const reste = absolu % 100;
  const sens = ecartCentimes > 0 ? "débit" : "crédit";
  return `${entier},${String(reste).padStart(2, "0")} en trop au ${sens}`;
}

/**
 * Compose le numéro de pièce à partir du compteur du journal.
 *
 * Le numéro est complété à gauche par des zéros pour que le tri alphabétique
 * d'un export corresponde à l'ordre chronologique : "VE2026-00007" et non
 * "VE2026-7", qui se classerait après "VE2026-10".
 */
export function formaterNumeroPiece(
  prefixe: string,
  numero: number,
  longueur = 5,
): string {
  if (!Number.isInteger(numero) || numero < 1) {
    throw new RangeError(`Numéro de pièce invalide : ${numero}`);
  }
  return `${prefixe}${String(numero).padStart(longueur, "0")}`;
}

/**
 * Construit les lignes de contre-passation d'une écriture.
 *
 * Corriger une écriture validée consiste à en enregistrer une seconde, de sens
 * inverse : les deux restent visibles au grand livre, et la trace de la
 * correction est conservée. C'est la raison pour laquelle l'ERP n'offre aucun
 * moyen de modifier une écriture validée.
 */
export function construireContrepassation(
  // Les deux colonnes sont facultatives : une ligne ne porte jamais que l'une
  // des deux, et l'autre est le plus souvent absente plutôt qu'à zéro.
  lignes: LigneSaisie[],
): Array<{
  compteId: number;
  tiersId: number | null;
  libelle: string | null;
  debit: number;
  credit: number;
}> {
  return lignes.map((l) => ({
    compteId: l.compteId,
    tiersId: l.tiersId ?? null,
    libelle: l.libelle ?? null,
    // Le débit devient crédit et réciproquement.
    debit: parseMontant(l.credit),
    credit: parseMontant(l.debit),
  }));
}
