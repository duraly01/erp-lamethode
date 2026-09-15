import { describe, it, expect } from "vitest";
import { budgetADate, BudgetError, controleBudgetaire, mensualiser, moisEntames, type LigneBudget, type Realise } from "./budget";

const fcfa = (n: number) => n * 100;

describe("mensualisation", () => {
  it("répartit uniformément, au centime, l'écart au mois le plus lourd", () => {
    const mois = mensualiser(fcfa(1_200_000), 12, null);
    expect(mois).toHaveLength(12);
    expect(mois.every((m) => m === fcfa(100_000))).toBe(true);
    const cent = mensualiser(100, 12, null);
    expect(cent.reduce((t, m) => t + m, 0)).toBe(100);
  });

  it("suit des poids saisonniers", () => {
    const mois = mensualiser(fcfa(1_300_000), 12, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2]);
    expect(mois[0]).toBe(fcfa(100_000));
    expect(mois[11]).toBe(fcfa(200_000));
  });

  it("un exercice court a autant de mois que de poids", () => {
    expect(mensualiser(fcfa(600_000), 6, null)).toEqual(Array(6).fill(fcfa(100_000)));
    expect(() => mensualiser(fcfa(600_000), 6, [1, 1])).toThrow(BudgetError);
    expect(() => mensualiser(-1, 12, null)).toThrow(BudgetError);
    expect(mensualiser(0, 12, null)).toEqual(Array(12).fill(0));
  });

  it("le budget à date cumule les mois entamés", () => {
    expect(budgetADate(fcfa(1_200_000), 12, null, 3)).toBe(fcfa(300_000));
    expect(budgetADate(fcfa(1_200_000), 12, null, 0)).toBe(0);
    expect(budgetADate(fcfa(1_200_000), 12, null, 15)).toBe(fcfa(1_200_000));
    expect(moisEntames("2026-01-01", "2026-03-15")).toBe(3);
    expect(moisEntames("2026-07-01", "2027-06-30")).toBe(12);
    expect(moisEntames("2026-01-01", "2025-12-31")).toBe(0);
  });
});

describe("contrôle budgétaire", () => {
  const budget: LigneBudget[] = [
    { id: 1, compteNumero: "601", compteLibelle: "Achats", sectionId: null, montantAnnuel: fcfa(1_200_000), mensualisation: null },
    { id: 2, compteNumero: "661", compteLibelle: "Salaires", sectionId: null, montantAnnuel: fcfa(2_400_000), mensualisation: null },
    { id: 3, compteNumero: "701", compteLibelle: "Ventes", sectionId: null, montantAnnuel: fcfa(6_000_000), mensualisation: null },
  ];
  const realises: Realise[] = [
    { compteNumero: "601", compteLibelle: "Achats", sectionId: null, montant: fcfa(350_000) },
    { compteNumero: "661", compteLibelle: "Salaires", sectionId: null, montant: fcfa(600_000) },
    { compteNumero: "701", compteLibelle: "Ventes", sectionId: null, montant: fcfa(1_400_000) },
    { compteNumero: "622", compteLibelle: "Locations", sectionId: null, montant: fcfa(90_000) },
  ];

  it("écart et pourcentages à fin mars, lignes hors budget comprises", () => {
    const c = controleBudgetaire(budget, realises, 12, 3);
    expect(c.lignes.map((l) => l.compteNumero)).toEqual(["601", "622", "661", "701"]);
    const achats = c.lignes[0];
    expect(achats).toMatchObject({ budgetAnnuel: fcfa(1_200_000), budgetADate: fcfa(300_000), realise: fcfa(350_000), ecart: fcfa(50_000), ecartPct: 16.7, consommationPct: 29.2, horsBudget: false });
    const loc = c.lignes[1];
    expect(loc).toMatchObject({ budgetAnnuel: 0, budgetADate: 0, realise: fcfa(90_000), ecart: fcfa(90_000), ecartPct: null, consommationPct: null, horsBudget: true, nature: "CHARGE" });
    expect(c.lignes[2]).toMatchObject({ ecart: 0, ecartPct: 0, consommationPct: 25 });
    expect(c.lignes[3]).toMatchObject({ nature: "PRODUIT", budgetADate: fcfa(1_500_000), realise: fcfa(1_400_000), ecart: -fcfa(100_000) });
    expect(c.charges).toEqual({ budgetAnnuel: fcfa(3_600_000), budgetADate: fcfa(900_000), realise: fcfa(1_040_000), ecart: fcfa(140_000) });
    expect(c.produits).toEqual({ budgetAnnuel: fcfa(6_000_000), budgetADate: fcfa(1_500_000), realise: fcfa(1_400_000), ecart: -fcfa(100_000) });
    expect(c.resultat).toEqual({ budgetAnnuel: fcfa(2_400_000), budgetADate: fcfa(600_000), realise: fcfa(360_000), ecart: -fcfa(240_000) });
  });

  it("distingue les sections d'un même compte", () => {
    const b: LigneBudget[] = [
      { id: 1, compteNumero: "601", compteLibelle: "Achats", sectionId: 9, montantAnnuel: fcfa(1_200_000), mensualisation: null },
      { id: 2, compteNumero: "601", compteLibelle: "Achats", sectionId: 10, montantAnnuel: fcfa(600_000), mensualisation: null },
    ];
    const r: Realise[] = [
      { compteNumero: "601", compteLibelle: "Achats", sectionId: 9, montant: fcfa(100_000) },
      { compteNumero: "601", compteLibelle: "Achats", sectionId: null, montant: fcfa(40_000) },
    ];
    const c = controleBudgetaire(b, r, 12, 1);
    expect(c.lignes.map((l) => [l.sectionId, l.budgetADate, l.realise, l.horsBudget])).toEqual([
      [null, 0, fcfa(40_000), true],
      [9, fcfa(100_000), fcfa(100_000), false],
      [10, fcfa(50_000), 0, false],
    ]);
  });
});
