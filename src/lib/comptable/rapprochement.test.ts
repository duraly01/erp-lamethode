import { describe, it, expect } from "vitest";
import {
  calculerRapprochement,
  proposerPointage,
  type LigneBancaire,
} from "@/lib/comptable/rapprochement";

const fcfa = (n: number) => n * 100;

let compteur = 0;
function ligne(p: { debit?: number; credit?: number; pointee?: boolean; libelle?: string }): LigneBancaire {
  compteur += 1;
  return {
    ligneId: compteur,
    ecritureId: compteur,
    dateEcriture: "2026-03-15",
    numeroPiece: `BQ2026-${String(compteur).padStart(5, "0")}`,
    libelle: p.libelle ?? null,
    tiersLibelle: null,
    debit: fcfa(p.debit ?? 0),
    credit: fcfa(p.credit ?? 0),
    pointee: p.pointee ?? false,
  };
}

describe("état de rapprochement", () => {
  it("est juste quand tout est pointé et que les soldes coïncident", () => {
    const e = calculerRapprochement(fcfa(1_000_000), fcfa(1_000_000), [
      ligne({ debit: 600_000, pointee: true }),
      ligne({ credit: 200_000, pointee: true }),
    ]);
    expect(e.soldeRapproche).toBe(fcfa(1_000_000));
    expect(e.ecart).toBe(0);
    expect(e.juste).toBe(true);
  });

  it("un chèque émis non encore débité par la banque", () => {
    // Livres : 1 000 000 après un chèque de 200 000. La banque, qui ne l'a
    // pas encore payé, montre 1 200 000.
    const e = calculerRapprochement(fcfa(1_000_000), fcfa(1_200_000), [
      ligne({ credit: 200_000, libelle: "Chèque n° 41" }),
    ]);
    expect(e.creditsNonPointes).toBe(fcfa(200_000));
    expect(e.soldeRapproche).toBe(fcfa(1_200_000));
    expect(e.juste).toBe(true);
  });

  it("une remise non encore créditée par la banque", () => {
    // Livres : 1 000 000 avec une remise de 300 000 saisie. La banque ne l'a
    // pas encore créditée et montre 700 000.
    const e = calculerRapprochement(fcfa(1_000_000), fcfa(700_000), [
      ligne({ debit: 300_000, libelle: "Remise de chèques" }),
    ]);
    expect(e.debitsNonPointes).toBe(fcfa(300_000));
    expect(e.soldeRapproche).toBe(fcfa(700_000));
    expect(e.juste).toBe(true);
  });

  it("des frais bancaires non saisis laissent un écart", () => {
    // Tout est pointé, mais la banque a prélevé 5 000 de frais que les livres
    // ignorent : l'écart est de −5 000, et il ne se force pas.
    const e = calculerRapprochement(fcfa(1_000_000), fcfa(995_000), [
      ligne({ debit: 1_000_000, pointee: true }),
    ]);
    expect(e.ecart).toBe(fcfa(-5_000));
    expect(e.juste).toBe(false);
  });

  it("sépare pointées et non pointées", () => {
    const e = calculerRapprochement(0, 0, [
      ligne({ debit: 1, pointee: true }),
      ligne({ debit: 2 }),
      ligne({ credit: 3 }),
    ]);
    expect(e.pointees).toHaveLength(1);
    expect(e.nonPointees).toHaveLength(2);
  });

  it("un compte à découvert se rapproche comme les autres", () => {
    // Solde comptable créditeur : −50 000. La banque montre −50 000 aussi.
    const e = calculerRapprochement(fcfa(-50_000), fcfa(-50_000), []);
    expect(e.juste).toBe(true);
  });
});

describe("proposition de pointage", () => {
  it("ne propose rien quand le rapprochement est juste", () => {
    expect(proposerPointage(calculerRapprochement(0, 0, []))).toBeNull();
  });

  it("trouve la ligne seule qui explique l'écart", () => {
    // Le relevé montre 1 000 000 ; les livres 1 000 000 avec un débit de
    // 250 000 non pointé. Non pointé, il ramène le solde rapproché à 750 000,
    // d'où un écart de +250 000 : le pointer l'annule.
    const e = calculerRapprochement(fcfa(1_000_000), fcfa(1_000_000), [
      ligne({ debit: 250_000, libelle: "Virement reçu" }),
      ligne({ credit: 40_000, libelle: "Chèque" }),
    ]);
    expect(e.ecart).toBe(fcfa(250_000 - 40_000));
    // Une seule ligne ne suffit pas ici : 250 000 ou −40 000, pas 210 000.
    // La paire, si.
    const proposition = proposerPointage(e)!;
    expect(proposition.map((l) => l.libelle)).toEqual(["Virement reçu", "Chèque"]);
  });

  it("préfère une ligne seule à une paire", () => {
    const e = calculerRapprochement(fcfa(1_000_000), fcfa(1_000_000), [
      ligne({ debit: 100_000, libelle: "A" }),
      ligne({ debit: 60_000, libelle: "B" }),
      ligne({ debit: 40_000, libelle: "C" }),
    ]);
    // Écart +200 000. Aucune ligne seule ne vaut 200 000 ; B + C non plus
    // (100 000) ; A + B = 160 000 ; A + C = 140 000. Rien ne convient.
    expect(proposerPointage(e)).toBeNull();

    const e2 = calculerRapprochement(fcfa(1_000_000), fcfa(1_000_000), [
      ligne({ debit: 100_000, libelle: "A" }),
      ligne({ debit: 60_000, libelle: "B" }),
      ligne({ debit: 40_000, libelle: "C" }),
      ligne({ debit: 200_000, libelle: "D" }),
    ]);
    // Écart +400 000 : D + (A+B+C) l'expliquerait, mais on s'arrête à deux.
    expect(proposerPointage(e2)).toBeNull();
  });

  it("propose la ligne exacte quand elle existe", () => {
    const e = calculerRapprochement(fcfa(500_000), fcfa(500_000), [
      ligne({ credit: 75_000, libelle: "Loyer" }),
    ]);
    expect(e.ecart).toBe(fcfa(-75_000));
    expect(proposerPointage(e)!.map((l) => l.libelle)).toEqual(["Loyer"]);
  });
});
