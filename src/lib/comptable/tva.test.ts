import { describe, it, expect } from "vitest";
import { calculerBalance, type LigneBalance } from "@/lib/comptable/balance";
import {
  calculerTva,
  creditTvaAnterieur,
  tvaAnterieureNonLiquidee,
  bornesPeriodeMensuelle,
} from "@/lib/comptable/tva";

/** Les montants attendus sont en centimes ; ceux fournis, en FCFA. */
const fcfa = (n: number) => n * 100;

function mouvements(
  soldes: { numero: string; libelle?: string; debit?: number; credit?: number }[],
): LigneBalance[] {
  return calculerBalance(
    soldes.map((s, i) => ({
      compteId: i + 1,
      compteNumero: s.numero,
      compteLibelle: s.libelle ?? s.numero,
      debit: s.debit ?? 0,
      credit: s.credit ?? 0,
    })),
  );
}

const MARS = bornesPeriodeMensuelle("2026-03");

/** Aucune période antérieure : ni crédit reporté, ni mois non liquidé. */
const RIEN_AVANT = { credit: 0, nonLiquidee: 0 };

describe("bornesPeriodeMensuelle", () => {
  it("encadre le mois", () => {
    expect(bornesPeriodeMensuelle("2026-03")).toEqual({
      code: "2026-03",
      dateDebut: "2026-03-01",
      dateFin: "2026-03-31",
    });
  });

  it("connaît la longueur des mois, années bissextiles comprises", () => {
    expect(bornesPeriodeMensuelle("2026-02").dateFin).toBe("2026-02-28");
    expect(bornesPeriodeMensuelle("2024-02").dateFin).toBe("2024-02-29");
    expect(bornesPeriodeMensuelle("2026-04").dateFin).toBe("2026-04-30");
    expect(bornesPeriodeMensuelle("2026-12").dateFin).toBe("2026-12-31");
  });

  it("refuse ce qui n'est pas une période mensuelle", () => {
    expect(() => bornesPeriodeMensuelle("2026")).toThrow(/Période invalide/);
    expect(() => bornesPeriodeMensuelle("03-2026")).toThrow(/Période invalide/);
    expect(() => bornesPeriodeMensuelle("2026-13")).toThrow(/Mois invalide/);
    expect(() => bornesPeriodeMensuelle("2026-00")).toThrow(/Mois invalide/);
  });
});

describe("calcul de la TVA", () => {
  it("oppose la TVA collectée à la TVA déductible", () => {
    const d = calculerTva(
      mouvements([
        { numero: "4431", libelle: "TVA facturée sur ventes", credit: 1_925_000 },
        { numero: "4452", libelle: "TVA récupérable sur achats", debit: 770_000 },
      ]),
      RIEN_AVANT,
      MARS,
    );

    expect(d.totalCollectee).toBe(fcfa(1_925_000));
    expect(d.totalDeductible).toBe(fcfa(770_000));
    expect(d.tvaDue).toBe(fcfa(1_155_000));
    expect(d.creditAReporter).toBe(0);
  });

  it("dégage un crédit quand la déductible l'emporte", () => {
    const d = calculerTva(
      mouvements([
        { numero: "4431", credit: 200_000 },
        { numero: "4452", debit: 950_000 },
      ]),
      RIEN_AVANT,
      MARS,
    );

    expect(d.tvaDue).toBe(0);
    expect(d.creditAReporter).toBe(fcfa(750_000));
  });

  it("impute le crédit reporté des périodes précédentes", () => {
    const base = mouvements([
      { numero: "4431", credit: 1_000_000 },
      { numero: "4452", debit: 300_000 },
    ]);

    // Sans report : 700 000 dus. Avec 250 000 de crédit : 450 000.
    expect(calculerTva(base, RIEN_AVANT, MARS).tvaDue).toBe(fcfa(700_000));
    expect(calculerTva(base, { credit: fcfa(250_000), nonLiquidee: 0 }, MARS).tvaDue).toBe(fcfa(450_000));

    // Un crédit plus gros que la TVA de la période se reporte encore.
    const d = calculerTva(base, { credit: fcfa(900_000), nonLiquidee: 0 }, MARS);
    expect(d.tvaDue).toBe(0);
    expect(d.creditAReporter).toBe(fcfa(200_000));
  });

  it("ramène chaque compte à son net : un avoir diminue la collectée", () => {
    // Une vente de 1 000 000 de TVA, puis un avoir de 150 000.
    const d = calculerTva(
      mouvements([{ numero: "4431", credit: 1_000_000, debit: 150_000 }]),
      RIEN_AVANT,
      MARS,
    );

    expect(d.totalCollectee).toBe(fcfa(850_000));
    expect(d.collectee[0].totalCredit).toBe(fcfa(1_000_000));
    expect(d.collectee[0].totalDebit).toBe(fcfa(150_000));
  });

  it("additionne tous les comptes de chaque famille", () => {
    const d = calculerTva(
      mouvements([
        { numero: "4431", credit: 500_000 },
        { numero: "4432", credit: 300_000 },
        { numero: "4451", debit: 100_000 },
        { numero: "4452", debit: 200_000 },
        { numero: "4453", debit: 50_000 },
        { numero: "4454", debit: 25_000 },
      ]),
      RIEN_AVANT,
      MARS,
    );

    expect(d.collectee).toHaveLength(2);
    expect(d.deductible).toHaveLength(4);
    expect(d.totalCollectee).toBe(fcfa(800_000));
    expect(d.totalDeductible).toBe(fcfa(375_000));
    expect(d.tvaDue).toBe(fcfa(425_000));
  });

  it("ignore les comptes qui ne sont pas des comptes de TVA", () => {
    const d = calculerTva(
      mouvements([
        { numero: "4431", credit: 500_000 },
        { numero: "701", credit: 2_600_000 },
        { numero: "411", debit: 3_100_000 },
        // 4441 porte la TVA déjà liquidée : la reprendre la déclarerait deux fois.
        { numero: "4441", credit: 400_000 },
        // 4449 est le report, traité à part comme crédit antérieur.
        { numero: "4449", debit: 120_000 },
      ]),
      RIEN_AVANT,
      MARS,
    );

    expect(d.collectee).toHaveLength(1);
    expect(d.deductible).toHaveLength(0);
    expect(d.totalCollectee).toBe(fcfa(500_000));
    expect(d.tvaDue).toBe(fcfa(500_000));
  });

  it("porte les bornes de la période déclarée", () => {
    const d = calculerTva([], RIEN_AVANT, MARS);
    expect(d.periode).toBe("2026-03");
    expect(d.dateDebut).toBe("2026-03-01");
    expect(d.dateFin).toBe("2026-03-31");
    expect(d.tvaDue).toBe(0);
    expect(d.creditAReporter).toBe(0);
  });
});

describe("crédit de TVA antérieur", () => {
  it("lit le solde débiteur du compte de report", () => {
    expect(
      creditTvaAnterieur(mouvements([{ numero: "4449", debit: 340_000 }])),
    ).toBe(fcfa(340_000));
  });

  it("est nul quand aucun crédit ne court", () => {
    expect(creditTvaAnterieur([])).toBe(0);
    expect(
      creditTvaAnterieur(mouvements([{ numero: "4452", debit: 100_000 }])),
    ).toBe(0);
  });

  it("ne réclame rien sur un solde créditeur, qui serait anormal", () => {
    // Déclarer un crédit négatif reviendrait à demander une TVA que ce compte
    // ne constate pas : on l'ignore, et l'anomalie reste visible à la balance.
    expect(
      creditTvaAnterieur(mouvements([{ numero: "4449", credit: 90_000 }])),
    ).toBe(0);
  });

  it("net les mouvements du compte de report", () => {
    expect(
      creditTvaAnterieur(
        mouvements([{ numero: "4449", debit: 500_000, credit: 200_000 }]),
      ),
    ).toBe(fcfa(300_000));
  });
});

describe("périodes antérieures non liquidées", () => {
  it("est nul quand les comptes de TVA ont été soldés", () => {
    expect(tvaAnterieureNonLiquidee([])).toBe(0);
    expect(
      tvaAnterieureNonLiquidee(
        mouvements([
          { numero: "4431", credit: 500_000, debit: 500_000 },
          { numero: "4452", debit: 200_000, credit: 200_000 },
        ]),
      ),
    ).toBe(0);
  });

  it("signale une TVA collectée jamais déclarée", () => {
    expect(
      tvaAnterieureNonLiquidee(mouvements([{ numero: "4431", credit: 300_000 }])),
    ).toBe(fcfa(300_000));
  });

  it("signale une TVA déductible jamais imputée, en négatif", () => {
    expect(
      tvaAnterieureNonLiquidee(mouvements([{ numero: "4452", debit: 180_000 }])),
    ).toBe(fcfa(-180_000));
  });

  it("accompagne la déclaration sans en modifier le montant", () => {
    // Le signalement informe ; il ne corrige pas de lui-même une TVA que
    // personne n'a liquidée. Corriger en silence masquerait le vrai problème,
    // qui est l'absence d'écriture de liquidation.
    const base = mouvements([{ numero: "4431", credit: 100_000 }]);
    const sans = calculerTva(base, RIEN_AVANT, MARS);
    const avec = calculerTva(base, { credit: 0, nonLiquidee: fcfa(50_000) }, MARS);

    expect(avec.tvaDue).toBe(sans.tvaDue);
    expect(avec.tvaAnterieureNonLiquidee).toBe(fcfa(50_000));
    expect(sans.tvaAnterieureNonLiquidee).toBe(0);
  });
});
