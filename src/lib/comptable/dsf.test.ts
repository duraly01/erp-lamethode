import { describe, it, expect } from "vitest";
import { liquiderImpot, SANS_RETRAITEMENT } from "@/lib/comptable/dsf";

/** Les montants sont en centimes ; les FCFA se convertissent ici. */
const fcfa = (n: number) => n * 100;

/**
 * Barème d'essai. Les valeurs ne prétendent à rien : le module ne connaît
 * aucun taux, c'est tout son propos. Le cabinet paramètre les siens.
 */
const BAREME = { tauxImpot: "33", tauxMinimum: "2.2" };

const base = (
  chiffreAffaires: number,
  resultatComptable: number,
  acomptesVerses = 0,
) => ({
  chiffreAffaires: fcfa(chiffreAffaires),
  resultatComptable: fcfa(resultatComptable),
  acomptesVerses: fcfa(acomptesVerses),
});

describe("sans barème paramétré", () => {
  const l = liquiderImpot(base(50_000_000, 8_000_000), SANS_RETRAITEMENT, null);

  it("rend quand même ce qui se déduit des livres", () => {
    expect(l.chiffreAffaires).toBe(fcfa(50_000_000));
    expect(l.resultatComptable).toBe(fcfa(8_000_000));
    expect(l.resultatFiscal).toBe(fcfa(8_000_000));
  });

  it("laisse à null tout ce qui dépend d'un taux", () => {
    // Zéro se lirait « rien à payer ». Null dit « pas calculable », ce qui est
    // la seule chose vraie tant que le barème n'est pas renseigné.
    expect(l.impotSurResultat).toBeNull();
    expect(l.minimumPerception).toBeNull();
    expect(l.impotRetenu).toBeNull();
    expect(l.soldeAPayer).toBeNull();
    expect(l.creditImpot).toBeNull();
    expect(l.baremeManquant).toBe(true);
  });
});

describe("liquidation d'un exercice bénéficiaire", () => {
  const l = liquiderImpot(
    base(50_000_000, 8_000_000),
    SANS_RETRAITEMENT,
    BAREME,
  );

  it("applique le taux au résultat fiscal", () => {
    expect(l.impotSurResultat).toBe(fcfa(2_640_000)); // 33 % de 8 000 000
  });

  it("calcule le minimum sur le chiffre d'affaires", () => {
    expect(l.minimumPerception).toBe(fcfa(1_100_000)); // 2,2 % de 50 000 000
  });

  it("retient le plus élevé des deux", () => {
    expect(l.impotRetenu).toBe(fcfa(2_640_000));
    expect(l.minimumApplique).toBe(false);
  });

  it("laisse tout l'impôt à payer faute d'acomptes", () => {
    expect(l.soldeAPayer).toBe(fcfa(2_640_000));
    expect(l.creditImpot).toBe(0);
  });
});

describe("minimum de perception", () => {
  it("s'applique quand l'impôt sur le résultat lui est inférieur", () => {
    // Beaucoup de chiffre d'affaires, peu de résultat.
    const l = liquiderImpot(base(80_000_000, 1_000_000), SANS_RETRAITEMENT, BAREME);
    expect(l.impotSurResultat).toBe(fcfa(330_000));
    expect(l.minimumPerception).toBe(fcfa(1_760_000));
    expect(l.impotRetenu).toBe(fcfa(1_760_000));
    expect(l.minimumApplique).toBe(true);
  });

  it("reste dû sur un exercice déficitaire", () => {
    // Le point qui surprend les dirigeants : une perte n'exonère pas du
    // minimum, qui est assis sur le chiffre d'affaires et non sur le résultat.
    const l = liquiderImpot(base(40_000_000, -5_000_000), SANS_RETRAITEMENT, BAREME);
    expect(l.impotSurResultat).toBe(0);
    expect(l.impotRetenu).toBe(fcfa(880_000));
    expect(l.minimumApplique).toBe(true);
    expect(l.soldeAPayer).toBe(fcfa(880_000));
  });

  it("un déficit ne produit jamais d'impôt négatif", () => {
    const l = liquiderImpot(base(0, -5_000_000), SANS_RETRAITEMENT, BAREME);
    expect(l.impotSurResultat).toBe(0);
    expect(l.minimumPerception).toBe(0);
    expect(l.impotRetenu).toBe(0);
    expect(l.soldeAPayer).toBe(0);
  });
});

describe("retraitements fiscaux", () => {
  it("réintégrations et déductions corrigent le résultat comptable", () => {
    const l = liquiderImpot(
      base(50_000_000, 8_000_000),
      { reintegrations: fcfa(1_500_000), deductions: fcfa(500_000) },
      BAREME,
    );
    expect(l.resultatFiscal).toBe(fcfa(9_000_000));
    expect(l.impotSurResultat).toBe(fcfa(2_970_000));
  });

  it("peuvent rendre déficitaire un exercice comptablement bénéficiaire", () => {
    const l = liquiderImpot(
      base(10_000_000, 1_000_000),
      { reintegrations: 0, deductions: fcfa(3_000_000) },
      BAREME,
    );
    expect(l.resultatFiscal).toBe(fcfa(-2_000_000));
    expect(l.impotSurResultat).toBe(0);
    // Le minimum reprend la main.
    expect(l.impotRetenu).toBe(fcfa(220_000));
  });
});

describe("imputation des acomptes", () => {
  it("diminue le solde à payer", () => {
    const l = liquiderImpot(
      base(50_000_000, 8_000_000, 1_000_000),
      SANS_RETRAITEMENT,
      BAREME,
    );
    expect(l.soldeAPayer).toBe(fcfa(1_640_000));
    expect(l.creditImpot).toBe(0);
  });

  it("dégage un crédit quand les acomptes dépassent l'impôt", () => {
    const l = liquiderImpot(
      base(50_000_000, 8_000_000, 3_000_000),
      SANS_RETRAITEMENT,
      BAREME,
    );
    expect(l.soldeAPayer).toBe(0);
    expect(l.creditImpot).toBe(fcfa(360_000));
  });

  it("s'impute aussi sur le minimum de perception", () => {
    const l = liquiderImpot(
      base(40_000_000, -5_000_000, 500_000),
      SANS_RETRAITEMENT,
      BAREME,
    );
    expect(l.impotRetenu).toBe(fcfa(880_000));
    expect(l.soldeAPayer).toBe(fcfa(380_000));
  });
});

describe("exactitude du calcul", () => {
  it("arrondit au centime sans passer par le flottant", () => {
    // 2,2 % de 333 333,33 : un calcul en flottant dériverait.
    const l = liquiderImpot(
      { chiffreAffaires: 33_333_333, resultatComptable: 0, acomptesVerses: 0 },
      SANS_RETRAITEMENT,
      { tauxImpot: "33", tauxMinimum: "2.2" },
    );
    expect(Number.isSafeInteger(l.minimumPerception!)).toBe(true);
    expect(l.minimumPerception).toBe(733_333);
  });

  it("accepte un taux à quatre décimales", () => {
    const l = liquiderImpot(
      base(0, 1_000_000),
      SANS_RETRAITEMENT,
      { tauxImpot: "19.2500", tauxMinimum: "0" },
    );
    expect(l.impotSurResultat).toBe(fcfa(192_500));
  });
});
