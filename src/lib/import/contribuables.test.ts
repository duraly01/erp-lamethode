import { describe, it, expect } from "vitest";
import {
  COLONNES,
  analyseLigne,
  colonnePourEntete,
  ligneVide,
  lireBooleen,
  lireNombre,
  lireRegime,
  lireTexte,
  normaliseEntete,
  type Colonne,
} from "@/lib/import/contribuables";

const col = (entete: string): Colonne => {
  const c = COLONNES.find((x) => x.entete === entete);
  if (!c) throw new Error(`Colonne inconnue dans le test : ${entete}`);
  return c;
};

describe("reconnaissance des en-têtes", () => {
  it("retrouve une colonne malgré la casse, les accents et la ponctuation", () => {
    expect(colonnePourEntete("HONORAIRES MENSUELS (FCFA)")?.cle).toBe(
      "honoraireMensuel",
    );
    expect(colonnePourEntete("honoraires mensuels fcfa")?.cle).toBe(
      "honoraireMensuel",
    );
    expect(colonnePourEntete("Regime fiscal")?.cle).toBe("regimeFiscal");
  });

  it("ignore une colonne étrangère au modèle", () => {
    expect(colonnePourEntete("Commentaire du gérant")).toBeUndefined();
    expect(colonnePourEntete("")).toBeUndefined();
  });

  it("normalise les accents et la ponctuation", () => {
    expect(normaliseEntete("Délai de paiement (jours)")).toBe(
      "delai de paiement jours",
    );
  });
});

describe("lecture des cellules", () => {
  it("lit un nombre à la française, séparateurs compris", () => {
    expect(lireNombre("1 250 000,50")).toBe(1250000.5);
    expect(lireNombre("10000")).toBe(10000);
    expect(lireNombre(37500)).toBe(37500);
    expect(lireNombre("-2 000")).toBe(-2000);
  });

  it("traite une cellule vide comme une absence, non comme un zéro", () => {
    expect(lireNombre("")).toBeUndefined();
    expect(lireNombre("   ")).toBeUndefined();
    expect(lireNombre(null)).toBeUndefined();
    expect(lireTexte("")).toBeUndefined();
    expect(lireBooleen("")).toBeUndefined();
  });

  it("accepte les formes courantes du oui et du non", () => {
    for (const v of ["Oui", "OUI", "vrai", "1", "x", "Actif"]) {
      expect(lireBooleen(v)).toBe(true);
    }
    for (const v of ["Non", "faux", "0", "Inactif", "Manuel"]) {
      expect(lireBooleen(v)).toBe(false);
    }
    expect(lireBooleen("peut-être")).toBeUndefined();
  });

  it("reconnaît le régime sous sa forme courte comme sous sa forme longue", () => {
    expect(lireRegime("Réel")).toBe("REEL");
    expect(lireRegime("Régime du Réel")).toBe("REEL");
    expect(lireRegime("IGS")).toBe("IGS");
    expect(lireRegime("Impôt Général Synthétique (IGS)")).toBe("IGS");
    expect(lireRegime("Simplifié")).toBeUndefined();
  });
});

describe("analyse d'une ligne", () => {
  it("retient l'identifiant et les valeurs renseignées", () => {
    const r = analyseLigne(
      2,
      new Map<Colonne, unknown>([
        [col("ID"), 12],
        [col("Nom / Raison sociale"), "ACME SARL"],
        [col("Honoraires mensuels (FCFA)"), "25 000"],
        [col("Facturation automatique"), "Oui"],
      ]),
    );
    expect(r.erreurs).toEqual([]);
    expect(r.id).toBe(12);
    expect(r.valeurs.nom).toBe("ACME SARL");
    expect(r.valeurs.honoraireMensuel).toBe(25000);
    expect(r.valeurs.facturationAuto).toBe(true);
  });

  it("n'inscrit rien pour une cellule vide : une omission n'efface pas", () => {
    const r = analyseLigne(
      3,
      new Map<Colonne, unknown>([
        [col("ID"), 7],
        [col("Honoraires mensuels (FCFA)"), ""],
        [col("Adresse de facturation"), null],
      ]),
    );
    expect(r.erreurs).toEqual([]);
    expect(Object.keys(r.valeurs)).toEqual([]);
  });

  it("signale une valeur non interprétable sans deviner", () => {
    const r = analyseLigne(
      4,
      new Map<Colonne, unknown>([
        [col("ID"), 7],
        [col("Honoraires mensuels (FCFA)"), "beaucoup"],
        [col("Régime fiscal"), "Forfait"],
      ]),
    );
    expect(r.erreurs).toHaveLength(2);
    expect(r.erreurs.join(" ")).toContain("nombre attendu");
    expect(r.erreurs.join(" ")).toContain("Réel");
    expect(r.valeurs.honoraireMensuel).toBeUndefined();
  });

  it("refuse un délai de paiement non entier", () => {
    const r = analyseLigne(
      5,
      new Map<Colonne, unknown>([[col("Délai de paiement (jours)"), "12,5"]]),
    );
    expect(r.erreurs.join(" ")).toContain("entier");
  });

  it("expose le NIU pour permettre l'appariement sans identifiant", () => {
    const r = analyseLigne(
      6,
      new Map<Colonne, unknown>([[col("NIU"), " P056200017396S "]]),
    );
    expect(r.niu).toBe("P056200017396S");
    expect(r.id).toBeUndefined();
  });

  it("tient une ligne entièrement vide pour négligeable", () => {
    const r = analyseLigne(
      7,
      new Map<Colonne, unknown>([
        [col("ID"), ""],
        [col("Nom / Raison sociale"), "  "],
      ]),
    );
    expect(ligneVide(r)).toBe(true);
  });

  it("ne tient pas pour vide une ligne porteuse d'une erreur", () => {
    const r = analyseLigne(
      8,
      new Map<Colonne, unknown>([[col("Remise (%)"), "dix"]]),
    );
    expect(ligneVide(r)).toBe(false);
  });
});
