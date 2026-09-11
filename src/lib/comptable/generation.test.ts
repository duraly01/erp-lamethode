import { describe, it, expect } from "vitest";
import { totauxEcriture } from "@/lib/comptable/ecriture";
import {
  genererFactureVente,
  genererFactureAchat,
  genererReglement,
  genererLiquidationTva,
  PieceInvalideError,
  type EcritureGeneree,
} from "@/lib/comptable/generation";
import type { DeclarationTva } from "@/lib/comptable/tva";

const fcfa = (n: number) => n * 100;

const TVA = { id: 1, taux: "19.2500", compteId: 4431 };
const TVA_DEDUCTIBLE = { id: 2, taux: "19.2500", compteId: 4452 };
const CLIENT = { id: 10, compteId: 411, raisonSociale: "Client Test" };
const FOURNISSEUR = { id: 20, compteId: 401, raisonSociale: "Fournisseur Test" };

/** Toute écriture générée doit être équilibrée : c'est la promesse du module. */
function equilibree(e: EcritureGeneree) {
  const t = totauxEcriture(e.lignes);
  expect(t.equilibree, `Σ débit = Σ crédit (écart ${t.ecart})`).toBe(true);
  return t;
}

const ligne = (e: EcritureGeneree, compteId: number) =>
  e.lignes.find((l) => l.compteId === compteId)!;

describe("facture de vente", () => {
  const e = genererFactureVente({
    client: CLIENT,
    reference: "V-2026-012",
    dateEcheance: "2026-10-15",
    lignes: [
      { compteId: 701, montantHt: fcfa(1_000_000), taxe: TVA },
      { compteId: 706, montantHt: fcfa(200_000), taxe: TVA, libelle: "Livraison" },
    ],
  });

  it("débite le client du TTC et crédite produits et TVA", () => {
    equilibree(e);
    expect(ligne(e, 411).debit).toBe("1431000.00");
    expect(ligne(e, 411).tiersId).toBe(10);
    expect(ligne(e, 701).credit).toBe("1000000.00");
    expect(ligne(e, 706).credit).toBe("200000.00");
    expect(ligne(e, 4431).credit).toBe("231000.00");
  });

  it("calcule la TVA sur la base cumulée par taux, pas ligne par ligne", () => {
    // 19,25 % de 1 200 000 = 231 000 exactement ; ligne par ligne on aurait pu
    // dériver d'un centime sur des bases moins rondes.
    expect(e.totalHt).toBe(fcfa(1_200_000));
    expect(e.totalTva).toBe(fcfa(231_000));
    expect(e.totalTtc).toBe(fcfa(1_431_000));
    expect(e.lignes.filter((l) => l.compteId === 4431)).toHaveLength(1);
  });

  it("porte l'échéance sur la ligne du client, pour la balance âgée", () => {
    expect(ligne(e, 411).dateEcheance).toBe("2026-10-15");
    expect(ligne(e, 701).dateEcheance).toBeUndefined();
  });

  it("nomme la pièce", () => {
    expect(e.libelle).toBe("Facture V-2026-012 — Client Test");
    expect(ligne(e, 706).libelle).toBe("Livraison");
    expect(ligne(e, 701).libelle).toBe(e.libelle);
  });
});

describe("facture de vente sans TVA", () => {
  it("n'émet aucune ligne de TVA", () => {
    const e = genererFactureVente({
      client: CLIENT,
      lignes: [{ compteId: 706, montantHt: fcfa(50_000), taxe: null }],
    });
    equilibree(e);
    expect(e.lignes).toHaveLength(2);
    expect(e.totalTva).toBe(0);
    expect(e.totalTtc).toBe(fcfa(50_000));
  });

  it("une taxe à taux zéro ne produit pas de ligne à zéro", () => {
    const e = genererFactureVente({
      client: CLIENT,
      lignes: [{ compteId: 706, montantHt: fcfa(50_000), taxe: { id: 3, taux: "0", compteId: 4431 } }],
    });
    expect(e.lignes.find((l) => l.compteId === 4431)).toBeUndefined();
  });
});

describe("facture d'achat", () => {
  const e = genererFactureAchat({
    fournisseur: FOURNISSEUR,
    reference: "AF-77",
    lignes: [
      { compteId: 601, montantHt: fcfa(400_000), taxe: TVA_DEDUCTIBLE },
      { compteId: 6055, montantHt: fcfa(25_000), taxe: null },
    ],
  });

  it("débite charges et TVA déductible, crédite le fournisseur du TTC", () => {
    equilibree(e);
    expect(ligne(e, 601).debit).toBe("400000.00");
    expect(ligne(e, 6055).debit).toBe("25000.00");
    expect(ligne(e, 4452).debit).toBe("77000.00");
    expect(ligne(e, 401).credit).toBe("502000.00");
    expect(ligne(e, 401).tiersId).toBe(20);
  });

  it("mélange lignes taxées et non taxées", () => {
    expect(e.totalHt).toBe(fcfa(425_000));
    expect(e.totalTva).toBe(fcfa(77_000));
  });
});

describe("arrondi de la TVA", () => {
  it("s'arrête au centime, sans flottant", () => {
    const e = genererFactureVente({
      client: CLIENT,
      lignes: [{ compteId: 701, montantHt: 333_333, taxe: TVA }], // 3 333,33 FCFA
    });
    // 19,25 % de 333 333 centimes = 64 166,6025 → 64 167 au centime.
    expect(ligne(e, 4431).credit).toBe("641.67");
    equilibree(e);
  });
});

describe("règlement", () => {
  it("un encaissement client débite la trésorerie", () => {
    const e = genererReglement({
      tiers: CLIENT,
      compteTresorerieId: 5211,
      montant: fcfa(1_431_000),
      sens: "ENCAISSEMENT",
      reference: "VIR-88",
    });
    equilibree(e);
    expect(ligne(e, 5211).debit).toBe("1431000.00");
    expect(ligne(e, 411).credit).toBe("1431000.00");
    expect(ligne(e, 411).tiersId).toBe(10);
    expect(e.libelle).toBe("Encaissement VIR-88 — Client Test");
  });

  it("un décaissement fournisseur crédite la trésorerie", () => {
    const e = genererReglement({
      tiers: FOURNISSEUR,
      compteTresorerieId: 571,
      montant: fcfa(502_000),
      sens: "DECAISSEMENT",
    });
    equilibree(e);
    expect(ligne(e, 401).debit).toBe("502000.00");
    expect(ligne(e, 571).credit).toBe("502000.00");
    expect(e.libelle).toBe("Règlement — Fournisseur Test");
  });
});

describe("refus des pièces invalides", () => {
  it("une pièce sans ligne", () => {
    expect(() => genererFactureVente({ client: CLIENT, lignes: [] })).toThrow(PieceInvalideError);
  });

  it("un montant nul ou négatif", () => {
    expect(() =>
      genererFactureAchat({ fournisseur: FOURNISSEUR, lignes: [{ compteId: 601, montantHt: 0 }] }),
    ).toThrow(/strictement positif/);
    expect(() =>
      genererReglement({ tiers: CLIENT, compteTresorerieId: 5211, montant: -1, sens: "ENCAISSEMENT" }),
    ).toThrow(PieceInvalideError);
  });
});

// ---------------------------------------------------------------------------

const COMPTES = {
  parNumero: (n: string) => ({ "4431": 4431, "4432": 4432, "4452": 4452, "4451": 4451 })[n]!,
  tvaDueId: 4441,
  creditAReporterId: 4449,
};

function declaration(p: Partial<DeclarationTva>): DeclarationTva {
  return {
    periode: "2026-03",
    dateDebut: "2026-03-01",
    dateFin: "2026-03-31",
    collectee: [],
    deductible: [],
    totalCollectee: 0,
    totalDeductible: 0,
    creditAnterieur: 0,
    tvaAnterieureNonLiquidee: 0,
    tvaDue: 0,
    creditAReporter: 0,
    ...p,
  };
}

const lTva = (numero: string, montant: number) => ({
  compteNumero: numero,
  compteLibelle: numero,
  montant,
  totalDebit: 0,
  totalCredit: 0,
});

describe("liquidation de la TVA", () => {
  it("solde collectée et déductible et constate la TVA due", () => {
    const e = genererLiquidationTva(
      declaration({
        collectee: [lTva("4431", fcfa(385_000))],
        deductible: [lTva("4452", fcfa(154_000))],
        totalCollectee: fcfa(385_000),
        totalDeductible: fcfa(154_000),
        tvaDue: fcfa(231_000),
      }),
      COMPTES,
    );
    equilibree(e);
    expect(ligne(e, 4431).debit).toBe("385000.00");
    expect(ligne(e, 4452).credit).toBe("154000.00");
    expect(ligne(e, 4441).credit).toBe("231000.00");
    expect(e.lignes.find((l) => l.compteId === 4449)).toBeUndefined();
  });

  it("constate un crédit à reporter quand la déductible l'emporte", () => {
    const e = genererLiquidationTva(
      declaration({
        collectee: [lTva("4431", fcfa(100_000))],
        deductible: [lTva("4452", fcfa(340_000))],
        creditAReporter: fcfa(240_000),
      }),
      COMPTES,
    );
    equilibree(e);
    expect(ligne(e, 4449).debit).toBe("240000.00");
    expect(e.lignes.find((l) => l.compteId === 4441)).toBeUndefined();
  });

  it("impute le crédit antérieur en le créditant", () => {
    // C'est l'écriture que le calcul attend : le crédit reporté est lu sur
    // 4449, qui doit donc être débité quand il naît et crédité quand il sert.
    const e = genererLiquidationTva(
      declaration({
        collectee: [lTva("4431", fcfa(500_000))],
        deductible: [lTva("4452", fcfa(100_000))],
        creditAnterieur: fcfa(150_000),
        tvaDue: fcfa(250_000),
      }),
      COMPTES,
    );
    equilibree(e);
    expect(ligne(e, 4449).credit).toBe("150000.00");
    expect(ligne(e, 4441).credit).toBe("250000.00");
  });

  it("un crédit antérieur plus grand que la TVA du mois se reporte encore", () => {
    const e = genererLiquidationTva(
      declaration({
        collectee: [lTva("4431", fcfa(100_000))],
        creditAnterieur: fcfa(300_000),
        creditAReporter: fcfa(200_000),
      }),
      COMPTES,
    );
    equilibree(e);
    // L'ancien crédit est imputé en entier, et un nouveau est constaté.
    const l4449 = e.lignes.filter((l) => l.compteId === 4449);
    expect(l4449.map((l) => [l.debit, l.credit])).toEqual([
      [undefined, "300000.00"],
      ["200000.00", undefined],
    ]);
  });

  it("solde une collectée nette négative au crédit", () => {
    // Un mois d'avoirs : la collectée nette est négative, la déductible aussi
    // absente ; la période dégage un crédit.
    const e = genererLiquidationTva(
      declaration({
        collectee: [lTva("4431", fcfa(-40_000))],
        creditAReporter: fcfa(40_000),
      }),
      COMPTES,
    );
    equilibree(e);
    expect(ligne(e, 4431).credit).toBe("40000.00");
    expect(ligne(e, 4449).debit).toBe("40000.00");
  });

  it("refuse une période sans mouvement", () => {
    expect(() => genererLiquidationTva(declaration({}), COMPTES)).toThrow(/Rien à liquider/);
  });
});
