import { describe, it, expect } from "vitest";
import {
  validerEcriture,
  totauxEcriture,
  estDansExercice,
  formaterNumeroPiece,
  construireContrepassation,
  type ContexteValidation,
  type CompteContexte,
  type EcritureSaisie,
  type CodeErreurEcriture,
  type ErreurEcriture,
} from "./ecriture";

const COMPTES: CompteContexte[] = [
  { id: 1, numero: "601", collectif: false, actif: true },
  { id: 2, numero: "4452", collectif: false, actif: true },
  { id: 3, numero: "401", collectif: true, actif: true },
  { id: 4, numero: "6055", collectif: false, actif: false },
];

const ctx = (
  statut: "OUVERT" | "CLOS" | "VERROUILLE" = "OUVERT",
): ContexteValidation => ({
  exercice: { dateDebut: "2026-01-01", dateFin: "2026-12-31", statut },
  comptes: new Map(COMPTES.map((c) => [c.id, c])),
});

/** Achat de marchandises 10 000 HT + TVA 1 925, à crédit fournisseur. */
const ACHAT: EcritureSaisie = {
  dateEcriture: "2026-03-15",
  libelle: "Facture fournisseur AF-2026-041",
  lignes: [
    { compteId: 1, debit: "10000.00", credit: null },
    { compteId: 2, debit: "1925.00", credit: null },
    { compteId: 3, tiersId: 7, debit: null, credit: "11925.00" },
  ],
};

const codes = (e: ErreurEcriture[]): CodeErreurEcriture[] =>
  e.map((x) => x.code);

describe("validerEcriture — écriture correcte", () => {
  it("accepte un achat équilibré", () => {
    expect(validerEcriture(ACHAT, ctx())).toEqual([]);
  });
});

describe("validerEcriture — équilibre", () => {
  it("refuse une écriture déséquilibrée", () => {
    const e = validerEcriture(
      {
        ...ACHAT,
        lignes: [
          ...ACHAT.lignes.slice(0, 2),
          { compteId: 3, tiersId: 7, credit: "11000.00" },
        ],
      },
      ctx(),
    );
    expect(codes(e)).toContain("DESEQUILIBRE");
  });

  it("détecte un écart d'un seul centime", () => {
    const e = validerEcriture(
      {
        ...ACHAT,
        lignes: [
          { compteId: 1, debit: "10000.00" },
          { compteId: 3, tiersId: 7, credit: "10000.01" },
        ],
      },
      ctx(),
    );
    expect(codes(e)).toContain("DESEQUILIBRE");
  });

  it("ne signale pas de déséquilibre quand une ligne est déjà fautive", () => {
    // Signaler les deux noierait la cause sous sa conséquence.
    const e = validerEcriture(
      {
        ...ACHAT,
        lignes: [
          { compteId: 1, debit: "100", credit: "50" },
          { compteId: 3, tiersId: 7, credit: "50" },
        ],
      },
      ctx(),
    );
    expect(codes(e)).toContain("SENS_INVALIDE");
    expect(codes(e)).not.toContain("DESEQUILIBRE");
  });
});

describe("validerEcriture — sens des lignes", () => {
  it("refuse une ligne portant à la fois débit et crédit", () => {
    const e = validerEcriture(
      {
        ...ACHAT,
        lignes: [
          { compteId: 1, debit: "100", credit: "100" },
          { compteId: 1, credit: "100" },
        ],
      },
      ctx(),
    );
    expect(codes(e)).toContain("SENS_INVALIDE");
    expect(e[0].ligne).toBe(0);
  });

  it("refuse une ligne sans montant", () => {
    const e = validerEcriture(
      { ...ACHAT, lignes: [{ compteId: 1 }, { compteId: 1, credit: "100" }] },
      ctx(),
    );
    expect(codes(e)).toContain("SENS_INVALIDE");
  });

  it("refuse un montant négatif", () => {
    const e = validerEcriture(
      {
        ...ACHAT,
        lignes: [
          { compteId: 1, debit: "-100" },
          { compteId: 1, credit: "-100" },
        ],
      },
      ctx(),
    );
    expect(codes(e).filter((c) => c === "SENS_INVALIDE")).toHaveLength(2);
  });

  it("signale un montant illisible sans faire échouer la validation entière", () => {
    const e = validerEcriture(
      {
        ...ACHAT,
        lignes: [
          { compteId: 1, debit: "dix mille" },
          { compteId: 1, credit: "100" },
        ],
      },
      ctx(),
    );
    expect(codes(e)).toContain("MONTANT_INVALIDE");
  });
});

describe("validerEcriture — exercice et date", () => {
  it("refuse la saisie dans un exercice clos", () => {
    expect(codes(validerEcriture(ACHAT, ctx("CLOS")))).toContain(
      "EXERCICE_FERME",
    );
  });

  it("refuse la saisie dans un exercice verrouillé", () => {
    expect(codes(validerEcriture(ACHAT, ctx("VERROUILLE")))).toContain(
      "EXERCICE_FERME",
    );
  });

  it("refuse une date hors des bornes de l'exercice", () => {
    const e = validerEcriture({ ...ACHAT, dateEcriture: "2025-12-31" }, ctx());
    expect(codes(e)).toContain("DATE_HORS_EXERCICE");
  });

  it("accepte les bornes elles-mêmes", () => {
    expect(
      validerEcriture({ ...ACHAT, dateEcriture: "2026-01-01" }, ctx()),
    ).toEqual([]);
    expect(
      validerEcriture({ ...ACHAT, dateEcriture: "2026-12-31" }, ctx()),
    ).toEqual([]);
  });

  it("refuse une date mal formée", () => {
    const e = validerEcriture({ ...ACHAT, dateEcriture: "15/03/2026" }, ctx());
    expect(codes(e)).toContain("DATE_INVALIDE");
  });
});

describe("validerEcriture — comptes et tiers", () => {
  it("refuse un compte absent du plan", () => {
    const e = validerEcriture(
      {
        ...ACHAT,
        lignes: [
          { compteId: 999, debit: "100" },
          { compteId: 1, credit: "100" },
        ],
      },
      ctx(),
    );
    expect(codes(e)).toContain("COMPTE_INCONNU");
  });

  it("refuse un compte désactivé", () => {
    const e = validerEcriture(
      {
        ...ACHAT,
        lignes: [
          { compteId: 4, debit: "100" },
          { compteId: 1, credit: "100" },
        ],
      },
      ctx(),
    );
    expect(codes(e)).toContain("COMPTE_INACTIF");
  });

  it("exige un tiers sur un compte collectif", () => {
    const e = validerEcriture(
      {
        ...ACHAT,
        lignes: [
          { compteId: 1, debit: "100" },
          { compteId: 3, credit: "100" },
        ],
      },
      ctx(),
    );
    expect(codes(e)).toContain("TIERS_REQUIS");
  });

  it("n'exige pas de tiers sur un compte ordinaire", () => {
    const e = validerEcriture(
      {
        ...ACHAT,
        lignes: [
          { compteId: 1, debit: "100" },
          { compteId: 2, credit: "100" },
        ],
      },
      ctx(),
    );
    expect(codes(e)).not.toContain("TIERS_REQUIS");
  });
});

describe("validerEcriture — en-tête", () => {
  it("exige un libellé", () => {
    expect(codes(validerEcriture({ ...ACHAT, libelle: "   " }, ctx()))).toContain(
      "LIBELLE_REQUIS",
    );
  });

  it("exige au moins deux lignes", () => {
    const e = validerEcriture(
      { ...ACHAT, lignes: [{ compteId: 1, debit: "100" }] },
      ctx(),
    );
    expect(codes(e)).toContain("LIGNES_INSUFFISANTES");
  });

  it("remonte toutes les erreurs d'un coup", () => {
    // Un comptable qui saisit vingt lignes doit voir tout ce qui cloche
    // en une fois, pas le découvrir erreur après erreur.
    const e = validerEcriture(
      {
        dateEcriture: "2020-01-01",
        libelle: "",
        lignes: [{ compteId: 999, debit: "100" }],
      },
      ctx("CLOS"),
    );
    expect(codes(e)).toEqual(
      expect.arrayContaining([
        "EXERCICE_FERME",
        "DATE_HORS_EXERCICE",
        "LIBELLE_REQUIS",
        "LIGNES_INSUFFISANTES",
        "COMPTE_INCONNU",
      ]),
    );
  });
});

describe("totauxEcriture", () => {
  it("totalise les deux colonnes et calcule l'écart", () => {
    const t = totauxEcriture(ACHAT.lignes);
    expect(t.debit).toBe(1192500);
    expect(t.credit).toBe(1192500);
    expect(t.ecart).toBe(0);
    expect(t.equilibree).toBe(true);
  });

  it("chiffre l'écart d'une écriture déséquilibrée", () => {
    const t = totauxEcriture([
      { compteId: 1, debit: "100.00" },
      { compteId: 2, credit: "60.00" },
    ]);
    expect(t.ecart).toBe(4000);
    expect(t.equilibree).toBe(false);
  });
});

describe("estDansExercice", () => {
  const ex = {
    dateDebut: "2026-01-01",
    dateFin: "2026-12-31",
    statut: "OUVERT" as const,
  };

  it("inclut les bornes", () => {
    expect(estDansExercice("2026-01-01", ex)).toBe(true);
    expect(estDansExercice("2026-12-31", ex)).toBe(true);
    expect(estDansExercice("2025-12-31", ex)).toBe(false);
    expect(estDansExercice("2027-01-01", ex)).toBe(false);
  });
});

describe("formaterNumeroPiece", () => {
  it("complète à gauche pour que le tri texte suive l'ordre des pièces", () => {
    expect(formaterNumeroPiece("VE2026-", 7)).toBe("VE2026-00007");
    expect(formaterNumeroPiece("VE2026-", 10)).toBe("VE2026-00010");
    expect(["VE2026-00010", "VE2026-00007"].sort()[0]).toBe("VE2026-00007");
  });

  it("refuse un numéro non entier ou nul", () => {
    expect(() => formaterNumeroPiece("VE-", 0)).toThrow(RangeError);
    expect(() => formaterNumeroPiece("VE-", 1.5)).toThrow(RangeError);
  });
});

describe("construireContrepassation", () => {
  it("inverse le sens de chaque ligne en conservant compte et tiers", () => {
    const contre = construireContrepassation(ACHAT.lignes);
    expect(contre).toEqual([
      { compteId: 1, tiersId: null, libelle: null, debit: 0, credit: 1000000 },
      { compteId: 2, tiersId: null, libelle: null, debit: 0, credit: 192500 },
      { compteId: 3, tiersId: 7, libelle: null, debit: 1192500, credit: 0 },
    ]);
  });

  it("produit une écriture elle-même équilibrée", () => {
    const contre = construireContrepassation(ACHAT.lignes);
    const debit = contre.reduce((s, l) => s + l.debit, 0);
    const credit = contre.reduce((s, l) => s + l.credit, 0);
    expect(debit).toBe(credit);
  });
});
