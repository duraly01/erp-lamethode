import { describe, it, expect } from "vitest";
import { calculerBalance, type LigneBalance } from "@/lib/comptable/balance";
import {
  calculerFluxTresorerie,
  tresorerieNette,
  LIGNES_FLUX,
  REGLES_FLUX,
} from "@/lib/comptable/flux-tresorerie";

/** Les montants attendus sont en centimes ; ceux fournis, en FCFA. */
const fcfa = (n: number) => n * 100;

/** Une écriture : des lignes (compte, débit ou crédit), en FCFA. */
type Ligne = { numero: string; libelle?: string; debit?: number; credit?: number };

/**
 * Construit la balance d'une liste d'écritures, chaque compte cumulant ses
 * débits et ses crédits — c'est cette information brute que le tableau des
 * flux exploite, pas seulement les soldes.
 */
function balance(ecritures: Ligne[][]): LigneBalance[] {
  const comptes = new Map<string, number>();
  const mouvements = ecritures.flat().map((l) => {
    if (!comptes.has(l.numero)) comptes.set(l.numero, comptes.size + 1);
    return {
      compteId: comptes.get(l.numero)!,
      compteNumero: l.numero,
      compteLibelle: l.libelle ?? l.numero,
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
    };
  });
  return calculerBalance(mouvements);
}

function ligne(flux: ReturnType<typeof calculerFluxTresorerie>, code: string) {
  const l = flux.lignes.find((x) => x.code === code);
  if (!l) throw new Error(`Ligne ${code} absente.`);
  return l.montant;
}

// ---------------------------------------------------------------------------
// Un exercice complet
// ---------------------------------------------------------------------------

/** Bilan repris : une trésorerie, un matériel amorti, un capital. */
const OUVERTURE = balance([
  [
    { numero: "5211", debit: 1_500_000 },
    { numero: "2444", debit: 2_000_000 },
    { numero: "2844", credit: 400_000 },
    { numero: "101", credit: 3_100_000 },
  ],
]);

/** Les flux de l'année, écriture par écriture. */
const MOUVEMENTS = balance([
  // Ventes au comptant.
  [{ numero: "5211", debit: 6_000_000 }, { numero: "701", credit: 6_000_000 }],
  // Achats à crédit, en partie réglés.
  [{ numero: "601", debit: 2_500_000 }, { numero: "401", credit: 2_500_000 }],
  [{ numero: "401", debit: 2_000_000 }, { numero: "5211", credit: 2_000_000 }],
  // Salaires, dont une partie reste due.
  [{ numero: "6611", debit: 1_200_000 }, { numero: "422", credit: 1_200_000 }],
  [{ numero: "422", debit: 1_100_000 }, { numero: "5211", credit: 1_100_000 }],
  // Achat d'un véhicule.
  [{ numero: "245", debit: 3_000_000 }, { numero: "5211", credit: 3_000_000 }],
  // Emprunt, puis première échéance.
  [{ numero: "5211", debit: 2_000_000 }, { numero: "162", credit: 2_000_000 }],
  [{ numero: "162", debit: 400_000 }, { numero: "5211", credit: 400_000 }],
  // Dotation aux amortissements.
  [{ numero: "6813", debit: 700_000 }, { numero: "2844", credit: 300_000 }, { numero: "2845", credit: 400_000 }],
  // Stock final constaté.
  [{ numero: "311", debit: 500_000 }, { numero: "6031", credit: 500_000 }],
]);

describe("tableau des flux — exercice complet", () => {
  const flux = calculerFluxTresorerie(OUVERTURE, MOUVEMENTS);

  it("part de la trésorerie reprise aux à-nouveaux", () => {
    expect(flux.tresorerieOuverture).toBe(fcfa(1_500_000));
    expect(ligne(flux, "ZA")).toBe(fcfa(1_500_000));
  });

  it("calcule la CAFG : résultat corrigé des dotations", () => {
    // Résultat : 6 000 000 − 2 500 000 + 500 000 − 1 200 000 − 700 000 = 2 100 000.
    // CAFG : résultat + dotations 700 000 = 2 800 000.
    expect(ligne(flux, "FA")).toBe(fcfa(2_800_000));
  });

  it("retire le besoin en fonds de roulement", () => {
    expect(ligne(flux, "FC")).toBe(fcfa(-500_000)); // stock constitué
    // Fournisseurs +500 000 et personnel +100 000 : ressource.
    expect(ligne(flux, "FE")).toBe(fcfa(600_000));
    expect(ligne(flux, "ZB")).toBe(fcfa(2_900_000));
  });

  it("lit les acquisitions au débit des comptes d'immobilisations", () => {
    expect(ligne(flux, "FG")).toBe(fcfa(-3_000_000));
    expect(ligne(flux, "ZC")).toBe(fcfa(-3_000_000));
  });

  it("distingue l'emprunt souscrit de son remboursement", () => {
    // Au bilan, l'emprunt vaut 1 600 000. Au tableau, ce sont deux flux.
    expect(ligne(flux, "FO")).toBe(fcfa(2_000_000));
    expect(ligne(flux, "FQ")).toBe(fcfa(-400_000));
    expect(ligne(flux, "ZD")).toBe(fcfa(1_600_000));
  });

  it("reconstitue la trésorerie de clôture", () => {
    // 1 500 000 + 6 000 000 − 2 000 000 − 1 100 000 − 3 000 000 + 2 000 000 − 400 000
    expect(flux.tresorerieCloture).toBe(fcfa(3_000_000));
    expect(ligne(flux, "ZE")).toBe(fcfa(1_500_000));
    expect(ligne(flux, "ZF")).toBe(fcfa(3_000_000));
    expect(flux.ecart).toBe(0);
    expect(flux.coherent).toBe(true);
    expect(flux.comptesHorsTableau).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Cas qui mettent la cohérence à l'épreuve
// ---------------------------------------------------------------------------

describe("cession d'une immobilisation", () => {
  // Véhicule de 3 000 000, amorti de 1 800 000, vendu 1 500 000 au comptant.
  const flux = calculerFluxTresorerie(
    balance([[{ numero: "245", debit: 3_000_000 }, { numero: "2845", credit: 1_800_000 }, { numero: "101", credit: 1_200_000 }]]),
    balance([
      [{ numero: "5211", debit: 1_500_000 }, { numero: "822", credit: 1_500_000 }],
      [{ numero: "812", debit: 1_200_000 }, { numero: "2845", debit: 1_800_000 }, { numero: "245", credit: 3_000_000 }],
    ]),
  );

  it("encaisse le prix en flux d'investissement, pas dans la CAFG", () => {
    expect(ligne(flux, "FI")).toBe(fcfa(1_500_000));
    // Résultat : 1 500 000 − 1 200 000 = 300 000 de plus-value.
    // CAFG : résultat + VCN 1 200 000 − prix 1 500 000 = 0. Rien d'opérationnel.
    expect(ligne(flux, "FA")).toBe(0);
  });

  it("ne compte pas la sortie du bien comme un flux", () => {
    expect(ligne(flux, "FG")).toBe(0);
  });

  it("reste cohérent", () => {
    expect(flux.tresorerieCloture).toBe(fcfa(1_500_000));
    expect(ligne(flux, "ZF")).toBe(fcfa(1_500_000));
    expect(flux.coherent).toBe(true);
  });
});

describe("affectation du résultat et dividendes", () => {
  // Résultat N-1 de 1 000 000 repris ; 600 000 en réserve, 400 000 distribués
  // et payés.
  const flux = calculerFluxTresorerie(
    balance([[{ numero: "5211", debit: 1_000_000 }, { numero: "131", credit: 1_000_000 }]]),
    balance([
      [{ numero: "131", debit: 1_000_000 }, { numero: "1068", credit: 600_000 }, { numero: "465", credit: 400_000 }],
      [{ numero: "465", debit: 400_000 }, { numero: "5211", credit: 400_000 }],
    ]),
  );

  it("l'affectation elle-même n'est pas un flux", () => {
    expect(ligne(flux, "FA")).toBe(0);
    expect(ligne(flux, "FK")).toBe(0);
  });

  it("seul le versement des dividendes décaisse", () => {
    expect(ligne(flux, "FN")).toBe(fcfa(-400_000));
    expect(ligne(flux, "ZF")).toBe(fcfa(600_000));
    expect(flux.coherent).toBe(true);
  });
});

describe("premier exercice, sans à-nouveaux", () => {
  const flux = calculerFluxTresorerie(
    [],
    balance([[{ numero: "5211", debit: 5_000_000 }, { numero: "101", credit: 5_000_000 }]]),
  );

  it("part de zéro et voit l'apport comme un financement", () => {
    expect(flux.tresorerieOuverture).toBe(0);
    expect(ligne(flux, "FK")).toBe(fcfa(5_000_000));
    expect(ligne(flux, "ZF")).toBe(fcfa(5_000_000));
    expect(flux.coherent).toBe(true);
  });
});

describe("découvert bancaire", () => {
  it("la trésorerie nette compte les concours bancaires en négatif", () => {
    expect(
      tresorerieNette(
        balance([[{ numero: "571", debit: 200_000 }, { numero: "5211", credit: 350_000 }, { numero: "101", credit: -150_000 }]]),
      ),
    ).toBe(fcfa(-150_000));
  });
});

describe("compte hors tableau", () => {
  const flux = calculerFluxTresorerie(
    [],
    balance([[{ numero: "5211", debit: 300_000 }, { numero: "999", credit: 300_000 }]]),
  );

  it("est nommé, et l'écart qu'il provoque est visible", () => {
    expect(flux.comptesHorsTableau).toEqual([
      { compteNumero: "999", compteLibelle: "999", variation: fcfa(-300_000) },
    ]);
    expect(flux.coherent).toBe(false);
    expect(flux.ecart).toBe(fcfa(-300_000));
  });
});

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe("structure du tableau", () => {
  it("tout total ne cite que des lignes déclarées avant lui", () => {
    const vus = new Set<string>();
    const enAvant: string[] = [];
    for (const l of LIGNES_FLUX) {
      for (const c of l.total ?? []) if (!vus.has(c)) enAvant.push(`${l.code} → ${c}`);
      vus.add(l.code);
    }
    expect(enAvant).toEqual([]);
  });

  it("chaque règle vise une ligne qui existe", () => {
    const codes = new Set(LIGNES_FLUX.map((l) => l.code));
    const inconnus: string[] = [];
    for (const [prefixe, r] of Object.entries(REGLES_FLUX)) {
      const vises =
        "hors" in r ? [] : "variation" in r ? [r.variation] : [r.debits, r.credits];
      for (const c of vises) if (c && !codes.has(c)) inconnus.push(`${prefixe} → ${c}`);
    }
    expect(inconnus).toEqual([]);
  });

  it("les exclusions portent chacune un motif", () => {
    for (const r of Object.values(REGLES_FLUX)) {
      if ("hors" in r) expect(r.motif.length).toBeGreaterThan(20);
    }
  });
});
