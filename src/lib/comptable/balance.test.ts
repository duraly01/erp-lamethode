import { describe, it, expect } from "vitest";
import {
  calculerBalance,
  totauxBalance,
  calculerGrandLivre,
  trancheAnciennete,
  type Mouvement,
  type MouvementDetaille,
} from "./balance";
import { parseMontant } from "./money";

/**
 * Jeu d'essai : un achat (601 / 4452 / 401) et une vente (411 / 701 / 4431),
 * tel qu'il se présente après validation des deux écritures.
 */
const MOUVEMENTS: Mouvement[] = [
  { compteId: 1, compteNumero: "601", compteLibelle: "Achats de marchandises", debit: "10000.00", credit: "0.00" },
  { compteId: 2, compteNumero: "4452", compteLibelle: "TVA récupérable", debit: "1925.00", credit: "0.00" },
  { compteId: 3, compteNumero: "401", compteLibelle: "Fournisseurs", debit: "0.00", credit: "11925.00" },
  { compteId: 4, compteNumero: "411", compteLibelle: "Clients", debit: "17925.00", credit: "0.00" },
  { compteId: 5, compteNumero: "701", compteLibelle: "Ventes de marchandises", debit: "0.00", credit: "15000.00" },
  { compteId: 6, compteNumero: "4431", compteLibelle: "TVA facturée", debit: "0.00", credit: "2925.00" },
];

describe("calculerBalance", () => {
  it("agrège les mouvements par compte", () => {
    const balance = calculerBalance([
      ...MOUVEMENTS,
      { compteId: 1, compteNumero: "601", compteLibelle: "Achats de marchandises", debit: "5000.00", credit: "0.00" },
    ]);
    const achats = balance.find((l) => l.compteNumero === "601");
    expect(achats?.totalDebit).toBe(parseMontant("15000"));
    expect(achats?.soldeDebiteur).toBe(parseMontant("15000"));
  });

  it("ne renseigne jamais les deux colonnes de solde à la fois", () => {
    for (const l of calculerBalance(MOUVEMENTS)) {
      expect(l.soldeDebiteur === 0 || l.soldeCrediteur === 0).toBe(true);
    }
  });

  it("place un compte de tiers créditeur du bon côté", () => {
    const fournisseurs = calculerBalance(MOUVEMENTS).find(
      (l) => l.compteNumero === "401",
    );
    expect(fournisseurs?.soldeCrediteur).toBe(parseMontant("11925"));
    expect(fournisseurs?.soldeDebiteur).toBe(0);
  });

  it("trie selon le numéro de compte, dans l'ordre du plan comptable", () => {
    const numeros = calculerBalance(MOUVEMENTS).map((l) => l.compteNumero);
    expect(numeros).toEqual(["401", "411", "4431", "4452", "601", "701"]);
  });

  it("rend une balance vide sur des mouvements vides", () => {
    expect(calculerBalance([])).toEqual([]);
  });
});

describe("totauxBalance", () => {
  it("constate l'équilibre d'une comptabilité saine", () => {
    const t = totauxBalance(calculerBalance(MOUVEMENTS));
    expect(t.totalDebit).toBe(parseMontant("29850"));
    expect(t.totalCredit).toBe(parseMontant("29850"));
    expect(t.totalSoldeDebiteur).toBe(t.totalSoldeCrediteur);
    expect(t.equilibree).toBe(true);
  });

  it("dénonce un déséquilibre — signe d'un défaut d'intégrité, pas de saisie", () => {
    const t = totauxBalance(
      calculerBalance([
        { compteId: 1, compteNumero: "601", compteLibelle: "Achats", debit: "100.00", credit: "0.00" },
      ]),
    );
    expect(t.equilibree).toBe(false);
  });
});

const detaille = (
  m: Partial<MouvementDetaille> & Pick<MouvementDetaille, "ligneId" | "compteId" | "dateEcriture">,
): MouvementDetaille => ({
  compteNumero: "521",
  compteLibelle: "Banque",
  ecritureId: m.ligneId,
  numeroPiece: null,
  journalCode: "BQ",
  libelle: null,
  debit: "0.00",
  credit: "0.00",
  ...m,
});

describe("calculerGrandLivre", () => {
  it("cumule le solde ligne après ligne", () => {
    const comptes = calculerGrandLivre([
      detaille({ ligneId: 1, compteId: 9, dateEcriture: "2026-01-05", debit: "1000.00" }),
      detaille({ ligneId: 2, compteId: 9, dateEcriture: "2026-01-10", credit: "400.00" }),
      detaille({ ligneId: 3, compteId: 9, dateEcriture: "2026-01-20", debit: "250.00" }),
    ]);
    expect(comptes).toHaveLength(1);
    expect(comptes[0].lignes.map((l) => l.soldeProgressif)).toEqual([
      parseMontant("1000"),
      parseMontant("600"),
      parseMontant("850"),
    ]);
    expect(comptes[0].soldeFinal).toBe(parseMontant("850"));
  });

  it("part du solde initial de la période antérieure", () => {
    const comptes = calculerGrandLivre(
      [detaille({ ligneId: 1, compteId: 9, dateEcriture: "2026-01-05", debit: "1000.00" })],
      new Map([[9, parseMontant("500")]]),
    );
    expect(comptes[0].soldeInitial).toBe(parseMontant("500"));
    expect(comptes[0].soldeFinal).toBe(parseMontant("1500"));
  });

  it("rétablit l'ordre chronologique même si la saisie ne l'a pas suivi", () => {
    const comptes = calculerGrandLivre([
      detaille({ ligneId: 1, compteId: 9, dateEcriture: "2026-03-01", debit: "300.00" }),
      detaille({ ligneId: 2, compteId: 9, dateEcriture: "2026-01-01", debit: "100.00" }),
      detaille({ ligneId: 3, compteId: 9, dateEcriture: "2026-02-01", debit: "200.00" }),
    ]);
    expect(comptes[0].lignes.map((l) => l.dateEcriture)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
  });

  it("sépare les comptes et les trie par numéro", () => {
    const comptes = calculerGrandLivre([
      detaille({ ligneId: 1, compteId: 9, compteNumero: "571", dateEcriture: "2026-01-01", debit: "100.00" }),
      detaille({ ligneId: 2, compteId: 8, compteNumero: "521", dateEcriture: "2026-01-01", credit: "100.00" }),
    ]);
    expect(comptes.map((c) => c.compteNumero)).toEqual(["521", "571"]);
  });

  it("totalise chaque compte", () => {
    const comptes = calculerGrandLivre([
      detaille({ ligneId: 1, compteId: 9, dateEcriture: "2026-01-05", debit: "1000.00" }),
      detaille({ ligneId: 2, compteId: 9, dateEcriture: "2026-01-10", credit: "400.00" }),
    ]);
    expect(comptes[0].totalDebit).toBe(parseMontant("1000"));
    expect(comptes[0].totalCredit).toBe(parseMontant("400"));
  });
});

describe("trancheAnciennete", () => {
  const aujourdhui = "2026-06-30";

  it("classe une échéance future en non échu", () => {
    expect(trancheAnciennete("2026-07-15", aujourdhui)).toBe("NON_ECHU");
  });

  it("classe l'échéance du jour en non échu", () => {
    expect(trancheAnciennete(aujourdhui, aujourdhui)).toBe("NON_ECHU");
  });

  it("répartit les retards par tranche", () => {
    expect(trancheAnciennete("2026-06-15", aujourdhui)).toBe("J1_30");
    expect(trancheAnciennete("2026-05-15", aujourdhui)).toBe("J31_60");
    expect(trancheAnciennete("2026-04-15", aujourdhui)).toBe("J61_90");
    expect(trancheAnciennete("2026-01-15", aujourdhui)).toBe("J90_PLUS");
  });

  it("place la borne des 30 jours du bon côté", () => {
    expect(trancheAnciennete("2026-05-31", aujourdhui)).toBe("J1_30");
    expect(trancheAnciennete("2026-05-30", aujourdhui)).toBe("J31_60");
  });

  it("ne présume pas d'un retard sans échéance convenue", () => {
    expect(trancheAnciennete(null, aujourdhui)).toBe("NON_ECHU");
  });
});
