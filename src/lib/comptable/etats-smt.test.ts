import { describe, it, expect } from "vitest";
import { calculerBalance, type LigneBalance } from "@/lib/comptable/balance";
import { calculerEtatsFinanciers } from "@/lib/comptable/etats-financiers";
import {
  POSTES_BILAN_ACTIF,
  POSTES_BILAN_PASSIF,
  POSTES_RESULTAT,
} from "@/lib/comptable/postes-syscohada";
import {
  calculerEtatsSmt,
  regrouperEnSmt,
  SMT_BILAN_ACTIF,
  SMT_BILAN_PASSIF,
  SMT_RECETTES,
  SMT_DEPENSES,
} from "@/lib/comptable/etats-smt";

const fcfa = (n: number) => n * 100;

function balance(
  soldes: { numero: string; debit?: number; credit?: number }[],
): LigneBalance[] {
  return calculerBalance(
    soldes.map((s, i) => ({
      compteId: i + 1,
      compteNumero: s.numero,
      compteLibelle: s.numero,
      debit: s.debit ?? 0,
      credit: s.credit ?? 0,
    })),
  );
}

const EXERCICE = balance([
  { numero: "101", credit: 5_000_000 },
  { numero: "162", credit: 1_000_000 },
  { numero: "5211", debit: 3_500_000 },
  { numero: "2444", debit: 2_000_000 },
  { numero: "2844", credit: 400_000 },
  { numero: "311", debit: 600_000 },
  { numero: "411", debit: 500_000 },
  { numero: "401", credit: 300_000 },
  { numero: "431", credit: 100_000 },
  { numero: "601", debit: 1_200_000 },
  { numero: "701", credit: 2_000_000 },
  { numero: "6611", debit: 600_000 },
  { numero: "6813", debit: 400_000 },
]);

const ligne = (s: { code: string; montant: number }[], code: string) =>
  s.find((l) => l.code === code)!.montant;

describe("bilan SMT", () => {
  const smt = calculerEtatsSmt(EXERCICE);

  it("présente les immobilisations en valeur nette", () => {
    expect(ligne(smt.actif, "IA")).toBe(fcfa(1_600_000));
  });

  it("regroupe l'actif en quatre lignes", () => {
    expect(ligne(smt.actif, "IB")).toBe(fcfa(600_000));
    expect(ligne(smt.actif, "IC")).toBe(fcfa(500_000));
    expect(ligne(smt.actif, "ID")).toBe(fcfa(3_500_000));
    expect(smt.totalActif).toBe(fcfa(6_200_000));
  });

  it("regroupe le passif, résultat compris", () => {
    expect(ligne(smt.passif, "PA")).toBe(fcfa(5_000_000));
    expect(ligne(smt.passif, "PB")).toBe(fcfa(-200_000));
    expect(ligne(smt.passif, "PC")).toBe(fcfa(1_000_000));
    expect(ligne(smt.passif, "PD")).toBe(fcfa(400_000));
    expect(smt.totalPassif).toBe(fcfa(6_200_000));
  });

  it("s'équilibre", () => {
    expect(smt.equilibre).toBe(true);
  });
});

describe("recettes et dépenses SMT", () => {
  const smt = calculerEtatsSmt(EXERCICE);

  it("totalisent recettes et dépenses", () => {
    expect(ligne(smt.recettes, "R1")).toBe(fcfa(2_000_000));
    expect(ligne(smt.recettes, "RZ")).toBe(fcfa(2_000_000));
    expect(ligne(smt.depenses, "D1")).toBe(fcfa(1_200_000));
    expect(ligne(smt.depenses, "D2")).toBe(fcfa(600_000));
    expect(ligne(smt.depenses, "D5")).toBe(fcfa(400_000));
    expect(ligne(smt.depenses, "DZ")).toBe(fcfa(2_200_000));
  });

  it("donnent le même résultat que le système normal", () => {
    // C'est la garantie du regroupement : les deux présentations partent des
    // mêmes postes, elles ne peuvent pas dire deux résultats différents.
    const normal = calculerEtatsFinanciers(EXERCICE);
    expect(smt.resultatNet).toBe(normal.resultat.resultatNet);
    expect(smt.resultatNet).toBe(fcfa(-200_000));
    expect(ligne(smt.passif, "PB")).toBe(smt.resultatNet);
  });

  it("retrouvent les totaux du bilan normal", () => {
    const normal = calculerEtatsFinanciers(EXERCICE);
    expect(smt.totalActif).toBe(normal.bilan.totalActif);
    expect(smt.totalPassif).toBe(normal.bilan.totalPassif);
  });
});

describe("couverture du système normal par le SMT", () => {
  const feuillesBilan = [
    ...POSTES_BILAN_ACTIF.filter((p) => !p.total),
    ...POSTES_BILAN_PASSIF.filter((p) => !p.total),
  ].map((p) => p.code);
  const feuillesResultat = POSTES_RESULTAT.filter((p) => !p.composition).map((p) => p.code);

  /** Développe une ligne SMT jusqu'aux postes feuilles du système normal. */
  function feuillesDe(
    codes: string[],
    normal: { code: string; total?: string[] }[],
    smt: { code: string; postes: string[] }[],
  ): string[] {
    return codes.flatMap((c) => {
      const lSmt = smt.find((l) => l.code === c);
      if (lSmt) return feuillesDe(lSmt.postes, normal, smt);
      const p = normal.find((l) => l.code === c);
      if (p?.total) return feuillesDe(p.total, normal, smt);
      return [c];
    });
  }

  it("chaque poste du bilan normal est repris une fois et une seule", () => {
    const normal = [...POSTES_BILAN_ACTIF, ...POSTES_BILAN_PASSIF];
    const smt = [...SMT_BILAN_ACTIF, ...SMT_BILAN_PASSIF];
    const repris = feuillesDe(["IZ", "PZ"], normal, smt);
    const comptage = new Map<string, number>();
    for (const c of repris) comptage.set(c, (comptage.get(c) ?? 0) + 1);

    expect(feuillesBilan.filter((c) => !comptage.has(c))).toEqual([]);
    expect(feuillesBilan.filter((c) => comptage.get(c)! > 1)).toEqual([]);
  });

  it("chaque poste du compte de résultat normal est repris une fois et une seule", () => {
    const repris = feuillesDe(["RZ", "DZ"], POSTES_RESULTAT as { code: string }[], [
      ...SMT_RECETTES,
      ...SMT_DEPENSES,
    ]);
    const comptage = new Map<string, number>();
    for (const c of repris) comptage.set(c, (comptage.get(c) ?? 0) + 1);

    expect(feuillesResultat.filter((c) => !comptage.has(c))).toEqual([]);
    expect(feuillesResultat.filter((c) => comptage.get(c)! > 1)).toEqual([]);
  });

  it("une balance vide donne un SMT à zéro, équilibré", () => {
    const smt = regrouperEnSmt(calculerEtatsFinanciers([]));
    expect(smt.totalActif).toBe(0);
    expect(smt.equilibre).toBe(true);
    expect(smt.resultatNet).toBe(0);
  });
});
