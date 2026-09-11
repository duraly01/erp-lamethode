import { describe, it, expect } from "vitest";
import { totauxEcriture } from "@/lib/comptable/ecriture";
import { genererEcriturePaie, EcriturePaieError, type ComptesPaie, type TotauxPaie } from "./ecriture";

const fcfa = (n: number) => n * 100;

const COMPTES: ComptesPaie = {
  salaires: 6611,
  primes: 6612,
  chargesSociales: 6641,
  taxesSalaires: 6414,
  remunerationsDues: 422,
  avances: 421,
  oppositions: 423,
  cnps: 431,
  irpp: 4471,
  autresImpots: 442,
};

/** Le bulletin de référence à 500 000, plus un acompte de 100 000 et une prime de 25 000 non imposable. */
const TOTAUX: TotauxPaie = {
  salaires: fcfa(500_000),
  primes: fcfa(25_000),
  cnpsSalarie: fcfa(21_000),
  cnpsEmployeur: fcfa(21_000 + 35_000 + 8_750),
  irpp: fcfa(38_500),
  cac: fcfa(3_850),
  cfcSalarie: fcfa(5_000),
  cfcEmployeur: fcfa(7_500),
  fne: fcfa(5_000),
  tdl: fcfa(2_250),
  rav: fcfa(5_850),
  avances: fcfa(100_000),
  autresRetenues: 0,
  netAPayer: fcfa(525_000 - 21_000 - 38_500 - 3_850 - 5_000 - 2_250 - 5_850 - 100_000),
  parSalarie: [{ tiersId: 77, libelle: "S001 MBARGA Jean", netAPayer: fcfa(348_550), avances: fcfa(100_000) }],
};

describe("écriture de paie", () => {
  const lignes = genererEcriturePaie(TOTAUX, COMPTES, "juin 2026");
  const ligne = (compteId: number) => lignes.find((l) => l.compteId === compteId)!;

  it("est équilibrée", () => {
    expect(totauxEcriture(lignes).equilibree).toBe(true);
  });

  it("débite le brut, la CNPS patronale et les taxes sur salaires", () => {
    expect(ligne(6611)).toMatchObject({ debit: "500000.00" });
    expect(ligne(6612)).toMatchObject({ debit: "25000.00" });
    expect(ligne(6641)).toMatchObject({ debit: "64750.00" });
    expect(ligne(6414)).toMatchObject({ debit: "12500.00" });
  });

  it("crédite le net, les acomptes, la CNPS entière, l'IRPP avec ses centimes, les autres impôts", () => {
    expect(ligne(422)).toMatchObject({ credit: "348550.00", tiersId: 77 });
    expect(ligne(421)).toMatchObject({ credit: "100000.00", tiersId: 77 });
    expect(ligne(431)).toMatchObject({ credit: "85750.00" });
    expect(ligne(4471)).toMatchObject({ credit: "42350.00" });
    expect(ligne(442)).toMatchObject({ credit: "25600.00" });
    // Pas de retenue diverse : pas de ligne 423.
    expect(lignes.some((l) => l.compteId === 423)).toBe(false);
  });

  it("sans compte de primes, elles rejoignent les salaires", () => {
    const sans = genererEcriturePaie(TOTAUX, { ...COMPTES, primes: null }, "juin 2026");
    expect(sans.find((l) => l.compteId === 6611)).toMatchObject({ debit: "525000.00" });
    expect(sans.some((l) => l.compteId === 6612)).toBe(false);
    expect(totauxEcriture(sans).equilibree).toBe(true);
  });

  it("une ligne de net par salarié, sur son compte individuel", () => {
    const deux = genererEcriturePaie(
      {
        ...TOTAUX,
        netAPayer: fcfa(348_550 + 60_000),
        salaires: TOTAUX.salaires + fcfa(60_000),
        parSalarie: [
          { tiersId: 77, libelle: "S001", netAPayer: fcfa(348_550), avances: fcfa(100_000) },
          { tiersId: 78, libelle: "S002", netAPayer: fcfa(60_000), avances: 0 },
        ],
      },
      COMPTES,
      "juin 2026",
    );
    const nets = deux.filter((l) => l.compteId === 422);
    expect(nets.map((l) => [l.tiersId, l.credit])).toEqual([
      [77, "348550.00"],
      [78, "60000.00"],
    ]);
    // Pas d'acompte pour S002 : pas de ligne 421 pour lui.
    expect(deux.filter((l) => l.compteId === 421)).toHaveLength(1);
    expect(totauxEcriture(deux).equilibree).toBe(true);
  });

  it("refuse des totaux incohérents plutôt que d'écrire un déséquilibre", () => {
    expect(() => genererEcriturePaie({ ...TOTAUX, irpp: TOTAUX.irpp + 1 }, COMPTES, "juin 2026")).toThrow(EcriturePaieError);
    expect(() => genererEcriturePaie({ ...TOTAUX, netAPayer: TOTAUX.netAPayer + 1 }, COMPTES, "juin 2026")).toThrow(/détail par salarié/);
  });
});
