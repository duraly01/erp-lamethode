// ---------------------------------------------------------------------------
// Lettrage — module pur.
//
// Lettrer, c'est rapprocher dans un compte de tiers les mouvements qui se
// compensent : une facture et son règlement portent le même code, et
// disparaissent ainsi du relevé des postes ouverts. C'est ce qui permet de
// savoir ce qu'un client doit réellement, et d'alimenter la balance âgée.
//
// Le lettrage ne modifie jamais les écritures : il pose seulement un code sur
// les lignes concernées, et se défait donc sans trace comptable.
// ---------------------------------------------------------------------------

import { parseMontant, sommeMontants } from "./money";

/** Alphabet des codes de lettrage : A, B, … Z, puis AA, AB, … */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Calcule le prochain code de lettrage disponible pour un compte.
 *
 * La progression suit celle des colonnes d'un tableur : après Z vient AA, après
 * AZ vient BA. Les codes déjà utilisés sont fournis tels qu'ils sont en base ;
 * les valeurs vides et les codes hors alphabet sont ignorés, ce qui rend la
 * fonction tolérante à un lettrage saisi à la main lors d'une reprise.
 */
export function prochainCodeLettrage(codesExistants: Iterable<string | null | undefined>): string {
  let max: string | null = null;

  for (const brut of codesExistants) {
    if (!brut) continue;
    const code = brut.trim().toUpperCase();
    if (!/^[A-Z]+$/.test(code)) continue;
    if (max === null || comparerCodes(code, max) > 0) max = code;
  }

  if (max === null) return "A";
  return incrementerCode(max);
}

/** Ordre des codes : d'abord la longueur, puis l'alphabet. */
function comparerCodes(a: string, b: string): number {
  return a.length - b.length || a.localeCompare(b);
}

function incrementerCode(code: string): string {
  const lettres = code.split("");
  let i = lettres.length - 1;

  while (i >= 0) {
    const rang = ALPHABET.indexOf(lettres[i]);
    if (rang < ALPHABET.length - 1) {
      lettres[i] = ALPHABET[rang + 1];
      return lettres.join("");
    }
    // La lettre était un Z : elle repasse à A et la retenue se propage.
    lettres[i] = "A";
    i -= 1;
  }

  // Toutes les lettres étaient des Z : le code gagne un caractère.
  return "A" + lettres.join("");
}

export type LigneALettrer = {
  ligneId: number;
  compteId: number;
  // Une ligne ne porte que l'une des deux colonnes : l'autre peut être absente
  // aussi bien qu'à zéro, et les deux cas valent zéro au calcul.
  debit?: string | number | null;
  credit?: string | number | null;
  /** Code déjà porté par la ligne, le cas échéant. */
  lettrage?: string | null;
};

export type CodeErreurLettrage =
  | "LIGNES_INSUFFISANTES"
  | "COMPTES_DIFFERENTS"
  | "DEJA_LETTREE"
  | "NON_SOLDE";

export type ErreurLettrage = {
  code: CodeErreurLettrage;
  message: string;
  ligneId?: number;
};

/**
 * Vérifie qu'un groupe de lignes peut être lettré ensemble.
 *
 * Trois conditions : au moins deux lignes, toutes sur le même compte, et un
 * total débit égal au total crédit. Cette dernière est l'essentiel — lettrer
 * des lignes qui ne se compensent pas ferait disparaître du relevé des postes
 * ouverts une somme qui reste due.
 */
export function validerLettrage(lignes: LigneALettrer[]): ErreurLettrage[] {
  const erreurs: ErreurLettrage[] = [];

  if (lignes.length < 2) {
    erreurs.push({
      code: "LIGNES_INSUFFISANTES",
      message: "Le lettrage porte sur au moins deux lignes.",
    });
    return erreurs;
  }

  const compteId = lignes[0].compteId;
  if (lignes.some((l) => l.compteId !== compteId)) {
    erreurs.push({
      code: "COMPTES_DIFFERENTS",
      message: "Toutes les lignes lettrées ensemble doivent appartenir au même compte.",
    });
  }

  for (const l of lignes) {
    if (l.lettrage) {
      erreurs.push({
        code: "DEJA_LETTREE",
        message: `La ligne est déjà lettrée sous le code ${l.lettrage} : délettrez-la d'abord.`,
        ligneId: l.ligneId,
      });
    }
  }

  const debit = sommeMontants(lignes.map((l) => parseMontant(l.debit)));
  const credit = sommeMontants(lignes.map((l) => parseMontant(l.credit)));

  if (debit !== credit) {
    erreurs.push({
      code: "NON_SOLDE",
      message: `Les lignes sélectionnées ne se compensent pas : écart de ${formatEcart(debit - credit)}.`,
    });
  }

  return erreurs;
}

function formatEcart(ecartCentimes: number): string {
  const absolu = Math.abs(ecartCentimes);
  return `${Math.floor(absolu / 100)},${String(absolu % 100).padStart(2, "0")}`;
}

export type PosteOuvert = {
  ligneId: number;
  debit: number;
  credit: number;
  /** Reste dû sur la ligne, positif au débit, négatif au crédit. */
  solde: number;
};

/**
 * Ne conserve que les lignes non lettrées d'un compte : les postes qui restent
 * ouverts. C'est cette liste qui alimente la relance client et la balance âgée.
 */
export function postesOuverts(lignes: LigneALettrer[]): PosteOuvert[] {
  return lignes
    .filter((l) => !l.lettrage)
    .map((l) => {
      const debit = parseMontant(l.debit);
      const credit = parseMontant(l.credit);
      return { ligneId: l.ligneId, debit, credit, solde: debit - credit };
    });
}

/**
 * Propose un lettrage automatique par rapprochement exact des montants.
 *
 * Volontairement conservateur : ne sont appariés que les couples débit/crédit
 * de montant strictement identique, un contre un. Les rapprochements partiels
 * ou multiples relèvent du jugement du comptable, et un lettrage automatique
 * trop zélé coûte plus cher à défaire qu'à ne pas faire.
 */
export function proposerLettrageAutomatique(
  lignes: LigneALettrer[],
): Array<[number, number]> {
  const ouverts = postesOuverts(lignes);
  const debiteurs = ouverts.filter((p) => p.solde > 0);
  const crediteurs = ouverts.filter((p) => p.solde < 0);

  const couples: Array<[number, number]> = [];
  const creditsUtilises = new Set<number>();

  for (const d of debiteurs) {
    const correspondance = crediteurs.find(
      (c) => !creditsUtilises.has(c.ligneId) && -c.solde === d.solde,
    );
    if (correspondance) {
      creditsUtilises.add(correspondance.ligneId);
      couples.push([d.ligneId, correspondance.ligneId]);
    }
  }

  return couples;
}

/**
 * Propose les postes ouverts d'un tiers qu'un règlement solde exactement.
 *
 * Un encaissement client solde des postes débiteurs — les factures qu'il doit ;
 * un décaissement fournisseur solde des postes créditeurs. On cherche un poste
 * seul du montant exact, puis une paire dont la somme fait le montant : un
 * client règle souvent deux factures d'un même virement. Au-delà, la
 * combinatoire ne guide plus le comptable, elle le noie — et le lettrage
 * partiel relève de son jugement, pas d'une proposition.
 *
 * Les postes reçus doivent déjà être **ceux du tiers** : le compte collectif
 * mêle tous les clients, et deux clients peuvent devoir le même montant.
 */
export function proposerImputationReglement(
  montant: number,
  sens: "ENCAISSEMENT" | "DECAISSEMENT",
  postes: Pick<PosteOuvert, "ligneId" | "solde">[],
): number[] {
  if (montant <= 0) return [];

  // Le reste dû dans le sens du règlement : un encaissement regarde ce que le
  // tiers doit (solde débiteur), un décaissement ce qu'on lui doit.
  const candidats = postes
    .map((p) => ({ ligneId: p.ligneId, reste: sens === "ENCAISSEMENT" ? p.solde : -p.solde }))
    .filter((p) => p.reste > 0);

  const seul = candidats.find((p) => p.reste === montant);
  if (seul) return [seul.ligneId];

  for (let i = 0; i < candidats.length; i++) {
    for (let j = i + 1; j < candidats.length; j++) {
      if (candidats[i].reste + candidats[j].reste === montant) {
        return [candidats[i].ligneId, candidats[j].ligneId];
      }
    }
  }
  return [];
}
