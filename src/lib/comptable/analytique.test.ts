import { describe, it, expect } from "vitest";
import { repartirParCle, restitutionParSection, validerVentilation, VentilationError, type LigneAnalytique } from "./analytique";

const fcfa = (n: number) => n * 100;

describe("validation d'une ventilation", () => {
  it("accepte une ventilation partielle et rend le reste", () => {
    expect(validerVentilation(fcfa(100_000), [{ sectionId: 1, montant: fcfa(60_000) }])).toEqual({ reste: fcfa(40_000) });
    expect(validerVentilation(fcfa(100_000), [{ sectionId: 1, montant: fcfa(60_000) }, { sectionId: 2, montant: fcfa(40_000) }])).toEqual({ reste: 0 });
    expect(validerVentilation(fcfa(100_000), [])).toEqual({ reste: fcfa(100_000) });
  });

  it("refuse un dépassement, une part nulle, une section en double, une ligne sans montant", () => {
    expect(() => validerVentilation(fcfa(100), [{ sectionId: 1, montant: fcfa(101) }])).toThrow(VentilationError);
    expect(() => validerVentilation(fcfa(100), [{ sectionId: 1, montant: 0 }])).toThrow(VentilationError);
    expect(() => validerVentilation(fcfa(100), [{ sectionId: 1, montant: 50 }, { sectionId: 1, montant: 50 }])).toThrow(VentilationError);
    expect(() => validerVentilation(0, [])).toThrow(VentilationError);
  });
});

describe("répartition par clé", () => {
  it("répartit au centime, l'écart d'arrondi à la part la plus lourde", () => {
    const parts = repartirParCle(fcfa(100_000), [
      { sectionId: 1, poids: 50 },
      { sectionId: 2, poids: 30 },
      { sectionId: 3, poids: 20 },
    ]);
    expect(parts).toEqual([
      { sectionId: 1, montant: fcfa(50_000) },
      { sectionId: 2, montant: fcfa(30_000) },
      { sectionId: 3, montant: fcfa(20_000) },
    ]);
    const tiers = repartirParCle(100, [
      { sectionId: 1, poids: 1 },
      { sectionId: 2, poids: 1 },
      { sectionId: 3, poids: 1 },
    ]);
    expect(tiers.reduce((t, p) => t + p.montant, 0)).toBe(100);
    expect(tiers.map((p) => p.montant)).toEqual([34, 33, 33]);
  });

  it("ignore les poids nuls et refuse une clé vide", () => {
    expect(repartirParCle(100, [{ sectionId: 1, poids: 0 }, { sectionId: 2, poids: 3 }])).toEqual([{ sectionId: 2, montant: 100 }]);
    expect(() => repartirParCle(100, [{ sectionId: 1, poids: 0 }])).toThrow(VentilationError);
  });
});

describe("restitution par section", () => {
  const sections = [
    { id: 1, code: "BOUL", libelle: "Boulangerie" },
    { id: 2, code: "PAT", libelle: "Pâtisserie" },
    { id: 3, code: "ADM", libelle: "Administration" },
  ];
  const lignes: LigneAnalytique[] = [
    { compteNumero: "601", compteLibelle: "Achats de marchandises", montant: fcfa(300_000), sens: "DEBIT", sectionId: 1 },
    { compteNumero: "601", compteLibelle: "Achats de marchandises", montant: fcfa(100_000), sens: "DEBIT", sectionId: 2 },
    // Un avoir fournisseur : la charge diminue.
    { compteNumero: "601", compteLibelle: "Achats de marchandises", montant: fcfa(20_000), sens: "CREDIT", sectionId: 1 },
    { compteNumero: "661", compteLibelle: "Rémunérations", montant: fcfa(500_000), sens: "DEBIT", sectionId: null },
    { compteNumero: "701", compteLibelle: "Ventes de marchandises", montant: fcfa(900_000), sens: "CREDIT", sectionId: 1 },
    { compteNumero: "701", compteLibelle: "Ventes de marchandises", montant: fcfa(250_000), sens: "CREDIT", sectionId: 2 },
    { compteNumero: "812", compteLibelle: "VNC cessions", montant: fcfa(10_000), sens: "DEBIT", sectionId: 3 },
    { compteNumero: "822", compteLibelle: "Produits cessions", montant: fcfa(15_000), sens: "CREDIT", sectionId: 3 },
  ];

  it("charges, produits et résultat par section, détail par compte, non ventilé en dernier", () => {
    const r = restitutionParSection(lignes, sections);
    expect(r.map((x) => x.section?.code ?? null)).toEqual(["ADM", "BOUL", "PAT", null]);
    const boul = r[1];
    expect(boul).toMatchObject({ charges: fcfa(280_000), produits: fcfa(900_000), resultat: fcfa(620_000) });
    expect(boul.comptes).toEqual([
      { numero: "601", libelle: "Achats de marchandises", charges: fcfa(280_000), produits: 0 },
      { numero: "701", libelle: "Ventes de marchandises", charges: 0, produits: fcfa(900_000) },
    ]);
    expect(r[0]).toMatchObject({ charges: fcfa(10_000), produits: fcfa(15_000), resultat: fcfa(5_000) });
    expect(r[3]).toMatchObject({ section: null, charges: fcfa(500_000), produits: 0, resultat: -fcfa(500_000) });
  });

  it("une section sans mouvement figure à zéro", () => {
    const r = restitutionParSection([], sections);
    expect(r).toHaveLength(3);
    expect(r.every((x) => x.charges === 0 && x.produits === 0 && x.comptes.length === 0)).toBe(true);
  });
});
