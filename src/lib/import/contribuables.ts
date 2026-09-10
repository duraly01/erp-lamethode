// ---------------------------------------------------------------------------
// Import Excel des contribuables — lecture et interprétation d'une ligne
//
// Module pur : aucune base, aucun fichier. Il décrit les colonnes du classeur,
// sait retrouver une colonne malgré une casse ou des accents différents, et
// convertit une cellule en valeur exploitable.
//
// C'est ce même catalogue qui pilote l'export, afin que le fichier produit par
// l'ERP soit exactement celui qu'il sait relire.
// ---------------------------------------------------------------------------

/** Champs qu'une ligne du classeur peut modifier. */
export type CleImport =
  | "nom"
  | "niu"
  | "regimeFiscal"
  | "igsClasse"
  | "cgaAdherent"
  | "chiffreAffairesAnnuel"
  | "centreImpots"
  | "telephone"
  | "email"
  | "responsableDossier"
  | "honoraireMensuel"
  | "remisePct"
  | "delaiPaiementJours"
  | "adresseFacturation"
  | "facturationAuto"
  | "actif";

type Nature = "texte" | "nombre" | "entier" | "booleen" | "regime";

export type Colonne = {
  /** `null` pour l'identifiant technique, qui sert à apparier mais ne se modifie pas. */
  cle: CleImport | null;
  entete: string;
  largeur: number;
  nature: Nature;
};

/**
 * Les colonnes du classeur, dans l'ordre où elles apparaissent.
 *
 * L'identifiant vient en premier : c'est lui qui rattache une ligne du fichier
 * à une fiche existante. Le supprimer n'empêche pas l'import — le NIU prend
 * alors le relais — mais le rend moins sûr.
 */
export const COLONNES: Colonne[] = [
  { cle: null, entete: "ID", largeur: 8, nature: "entier" },
  { cle: "nom", entete: "Nom / Raison sociale", largeur: 36, nature: "texte" },
  { cle: "niu", entete: "NIU", largeur: 18, nature: "texte" },
  { cle: "regimeFiscal", entete: "Régime fiscal", largeur: 14, nature: "regime" },
  { cle: "igsClasse", entete: "Classe IGS", largeur: 12, nature: "entier" },
  { cle: "cgaAdherent", entete: "Adhérent CGA", largeur: 14, nature: "booleen" },
  { cle: "chiffreAffairesAnnuel", entete: "CA annuel (FCFA)", largeur: 18, nature: "nombre" },
  { cle: "centreImpots", entete: "Centre des impôts", largeur: 22, nature: "texte" },
  { cle: "telephone", entete: "Téléphone", largeur: 18, nature: "texte" },
  { cle: "email", entete: "Email", largeur: 26, nature: "texte" },
  { cle: "responsableDossier", entete: "Responsable", largeur: 20, nature: "texte" },
  { cle: "honoraireMensuel", entete: "Honoraires mensuels (FCFA)", largeur: 24, nature: "nombre" },
  { cle: "remisePct", entete: "Remise (%)", largeur: 12, nature: "nombre" },
  { cle: "delaiPaiementJours", entete: "Délai de paiement (jours)", largeur: 22, nature: "entier" },
  { cle: "adresseFacturation", entete: "Adresse de facturation", largeur: 30, nature: "texte" },
  { cle: "facturationAuto", entete: "Facturation automatique", largeur: 22, nature: "booleen" },
  { cle: "actif", entete: "Statut", largeur: 12, nature: "booleen" },
];

/** Nom lisible d'un champ, pour l'aperçu des modifications. */
export const LIBELLES: Record<CleImport, string> = COLONNES.reduce(
  (acc, c) => (c.cle ? { ...acc, [c.cle]: c.entete } : acc),
  {} as Record<CleImport, string>,
);

/**
 * Forme comparable d'un en-tête : sans accents, sans ponctuation, sans casse.
 * « Honoraires mensuels (FCFA) » et « honoraires mensuels fcfa » désignent
 * ainsi la même colonne, ce qui évite qu'un fichier retouché soit refusé.
 */
export function normaliseEntete(valeur: unknown): string {
  return String(valeur ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Colonne correspondant à un en-tête lu dans le fichier, si elle existe. */
export function colonnePourEntete(entete: unknown): Colonne | undefined {
  const cible = normaliseEntete(entete);
  if (!cible) return undefined;
  return COLONNES.find((c) => normaliseEntete(c.entete) === cible);
}

/** Une cellule vide ne modifie rien : c'est ce que traduit `undefined`. */
function estVide(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  return typeof v === "string" && v.trim() === "";
}

export function lireTexte(v: unknown): string | undefined {
  if (estVide(v)) return undefined;
  // Excel rend parfois un objet (formule, lien) plutôt qu'une chaîne.
  const brut =
    typeof v === "object" && v !== null && "text" in v
      ? String((v as { text: unknown }).text)
      : String(v);
  const t = brut.trim();
  return t === "" ? undefined : t;
}

/**
 * Nombre saisi à la française : « 1 250 000,50 » comme « 1250000.5 ».
 * Les espaces, y compris insécables, et le séparateur de milliers sont tolérés.
 */
export function lireNombre(v: unknown): number | undefined {
  if (estVide(v)) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const t = String(v)
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  if (t === "" || t === "-") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

const VRAIS = new Set(["oui", "o", "vrai", "true", "1", "x", "actif", "auto"]);
const FAUX = new Set(["non", "n", "faux", "false", "0", "inactif", "manuel"]);

export function lireBooleen(v: unknown): boolean | undefined {
  if (estVide(v)) return undefined;
  if (typeof v === "boolean") return v;
  const t = normaliseEntete(v);
  if (VRAIS.has(t)) return true;
  if (FAUX.has(t)) return false;
  return undefined;
}

export function lireRegime(v: unknown): "REEL" | "IGS" | undefined {
  if (estVide(v)) return undefined;
  const t = normaliseEntete(v);
  // On reconnaît le libellé court de l'export (« Réel », « IGS ») comme le
  // libellé long d'un fichier plus ancien (« Impôt Général Synthétique »).
  if (t.includes("igs") || t.includes("synthetique")) return "IGS";
  if (t.includes("reel")) return "REEL";
  return undefined;
}

export type LigneAnalysee = {
  /** Numéro de ligne dans le classeur, en-tête comprise : celui qu'affiche Excel. */
  ligne: number;
  id?: number;
  niu?: string;
  valeurs: Partial<Record<CleImport, unknown>>;
  erreurs: string[];
};

/**
 * Interprète une ligne du classeur.
 *
 * `cellules` associe chaque colonne reconnue à sa valeur brute. Les cellules
 * vides sont écartées : une colonne laissée blanche ne modifie pas la fiche,
 * de sorte qu'un fichier partiel ne puisse jamais effacer des données.
 */
export function analyseLigne(
  ligne: number,
  cellules: Map<Colonne, unknown>,
): LigneAnalysee {
  const res: LigneAnalysee = { ligne, valeurs: {}, erreurs: [] };

  for (const [colonne, brut] of cellules) {
    if (colonne.cle === null) {
      const id = lireNombre(brut);
      if (id !== undefined) {
        if (!Number.isInteger(id) || id <= 0) {
          res.erreurs.push("Identifiant invalide.");
        } else {
          res.id = id;
        }
      }
      continue;
    }

    let valeur: unknown;
    switch (colonne.nature) {
      case "texte":
        valeur = lireTexte(brut);
        break;
      case "nombre":
        valeur = lireNombre(brut);
        if (valeur === undefined && !estVide(brut)) {
          res.erreurs.push(`${colonne.entete} : nombre attendu.`);
        }
        break;
      case "entier": {
        const n = lireNombre(brut);
        if (n === undefined) {
          if (!estVide(brut)) res.erreurs.push(`${colonne.entete} : nombre entier attendu.`);
        } else if (!Number.isInteger(n)) {
          res.erreurs.push(`${colonne.entete} : nombre entier attendu.`);
        } else {
          valeur = n;
        }
        break;
      }
      case "booleen":
        valeur = lireBooleen(brut);
        if (valeur === undefined && !estVide(brut)) {
          res.erreurs.push(`${colonne.entete} : « Oui » ou « Non » attendu.`);
        }
        break;
      case "regime":
        valeur = lireRegime(brut);
        if (valeur === undefined && !estVide(brut)) {
          res.erreurs.push(`${colonne.entete} : « Réel » ou « IGS » attendu.`);
        }
        break;
    }

    if (valeur === undefined) continue;
    if (colonne.cle === "niu") res.niu = String(valeur);
    res.valeurs[colonne.cle] = valeur;
  }

  return res;
}

/** Une ligne entièrement vide est ignorée sans être signalée comme fautive. */
export function ligneVide(l: LigneAnalysee): boolean {
  return (
    l.id === undefined &&
    l.erreurs.length === 0 &&
    Object.keys(l.valeurs).length === 0
  );
}
