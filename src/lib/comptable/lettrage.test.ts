import { describe, it, expect } from "vitest";
import {
  prochainCodeLettrage,
  validerLettrage,
  postesOuverts,
  proposerLettrageAutomatique,
  type LigneALettrer,
  type CodeErreurLettrage,
} from "./lettrage";
import { parseMontant } from "./money";

describe("prochainCodeLettrage", () => {
  it("commence à A sur un compte vierge", () => {
    expect(prochainCodeLettrage([])).toBe("A");
  });

  it("progresse dans l'alphabet", () => {
    expect(prochainCodeLettrage(["A"])).toBe("B");
    expect(prochainCodeLettrage(["A", "B", "C"])).toBe("D");
  });

  it("passe à deux lettres après Z, comme les colonnes d'un tableur", () => {
    expect(prochainCodeLettrage(["Z"])).toBe("AA");
    expect(prochainCodeLettrage(["AA"])).toBe("AB");
    expect(prochainCodeLettrage(["AZ"])).toBe("BA");
    expect(prochainCodeLettrage(["ZZ"])).toBe("AAA");
  });

  it("repart du plus grand code, quel que soit l'ordre reçu", () => {
    expect(prochainCodeLettrage(["C", "A", "B"])).toBe("D");
    // AA est supérieur à Z : la longueur prime sur l'ordre alphabétique.
    expect(prochainCodeLettrage(["Z", "AA", "B"])).toBe("AB");
  });

  it("ignore les valeurs vides et les codes hors alphabet", () => {
    // Tolérance nécessaire à une reprise de données lettrées à la main.
    expect(prochainCodeLettrage([null, undefined, "", "  ", "12", "A-1"])).toBe("A");
    expect(prochainCodeLettrage(["A", null, "x9"])).toBe("B");
  });

  it("accepte un code saisi en minuscules", () => {
    expect(prochainCodeLettrage(["a", "b"])).toBe("C");
  });
});

/** Facture de 11 925 puis son règlement, sur le compte fournisseur 401. */
const FACTURE: LigneALettrer = { ligneId: 1, compteId: 3, debit: null, credit: "11925.00" };
const REGLEMENT: LigneALettrer = { ligneId: 2, compteId: 3, debit: "11925.00", credit: null };

const codes = (e: ReturnType<typeof validerLettrage>): CodeErreurLettrage[] =>
  e.map((x) => x.code);

describe("validerLettrage", () => {
  it("accepte une facture et son règlement du même montant", () => {
    expect(validerLettrage([FACTURE, REGLEMENT])).toEqual([]);
  });

  it("accepte un règlement soldé par plusieurs versements", () => {
    expect(
      validerLettrage([
        { ligneId: 1, compteId: 3, credit: "10000.00" },
        { ligneId: 2, compteId: 3, debit: "6000.00" },
        { ligneId: 3, compteId: 3, debit: "4000.00" },
      ]),
    ).toEqual([]);
  });

  it("refuse un lettrage qui laisserait un reste dû", () => {
    // C'est le contrôle essentiel : lettrer sans solder ferait disparaître du
    // relevé des postes ouverts une somme qui reste due.
    const e = validerLettrage([
      FACTURE,
      { ligneId: 2, compteId: 3, debit: "10000.00" },
    ]);
    expect(codes(e)).toContain("NON_SOLDE");
  });

  it("refuse un écart d'un centime", () => {
    const e = validerLettrage([
      FACTURE,
      { ligneId: 2, compteId: 3, debit: "11925.01" },
    ]);
    expect(codes(e)).toContain("NON_SOLDE");
  });

  it("refuse un lettrage sur une seule ligne", () => {
    expect(codes(validerLettrage([FACTURE]))).toContain("LIGNES_INSUFFISANTES");
  });

  it("refuse de mêler deux comptes", () => {
    const e = validerLettrage([
      FACTURE,
      { ligneId: 2, compteId: 4, debit: "11925.00" },
    ]);
    expect(codes(e)).toContain("COMPTES_DIFFERENTS");
  });

  it("refuse une ligne déjà lettrée et désigne laquelle", () => {
    const e = validerLettrage([
      { ...FACTURE, lettrage: "A" },
      REGLEMENT,
    ]);
    expect(codes(e)).toContain("DEJA_LETTREE");
    expect(e.find((x) => x.code === "DEJA_LETTREE")?.ligneId).toBe(1);
  });
});

describe("postesOuverts", () => {
  it("ne retient que les lignes non lettrées", () => {
    const ouverts = postesOuverts([
      { ...FACTURE, lettrage: "A" },
      { ...REGLEMENT, lettrage: "A" },
      { ligneId: 3, compteId: 3, credit: "5000.00" },
    ]);
    expect(ouverts.map((p) => p.ligneId)).toEqual([3]);
  });

  it("chiffre le reste dû, négatif au crédit", () => {
    const ouverts = postesOuverts([
      { ligneId: 3, compteId: 3, credit: "5000.00" },
      { ligneId: 4, compteId: 3, debit: "2000.00" },
    ]);
    expect(ouverts[0].solde).toBe(-parseMontant("5000"));
    expect(ouverts[1].solde).toBe(parseMontant("2000"));
  });
});

describe("proposerLettrageAutomatique", () => {
  it("apparie les montants strictement identiques", () => {
    expect(proposerLettrageAutomatique([FACTURE, REGLEMENT])).toEqual([[2, 1]]);
  });

  it("n'apparie pas deux fois le même crédit", () => {
    const couples = proposerLettrageAutomatique([
      { ligneId: 1, compteId: 3, credit: "1000.00" },
      { ligneId: 2, compteId: 3, debit: "1000.00" },
      { ligneId: 3, compteId: 3, debit: "1000.00" },
    ]);
    expect(couples).toHaveLength(1);
  });

  it("laisse au comptable les rapprochements partiels", () => {
    // Prudence délibérée : un lettrage automatique trop zélé coûte plus cher
    // à défaire qu'à ne pas faire.
    const couples = proposerLettrageAutomatique([
      { ligneId: 1, compteId: 3, credit: "10000.00" },
      { ligneId: 2, compteId: 3, debit: "6000.00" },
      { ligneId: 3, compteId: 3, debit: "4000.00" },
    ]);
    expect(couples).toEqual([]);
  });

  it("ignore les lignes déjà lettrées", () => {
    const couples = proposerLettrageAutomatique([
      { ...FACTURE, lettrage: "A" },
      { ...REGLEMENT, lettrage: "A" },
    ]);
    expect(couples).toEqual([]);
  });
});
