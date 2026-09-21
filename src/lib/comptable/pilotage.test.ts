import { describe, it, expect } from "vitest";
import { calculerPilotage, listerMois, moisDe, type MouvementDate } from "@/lib/comptable/pilotage";

const fcfa = (n: number) => n * 100;

const EXERCICE = { dateDebut: "2026-01-01", dateFin: "2026-12-31" };

let prochainId = 1;
function mv(dateEcriture: string, numero: string, debit = 0, credit = 0): MouvementDate {
  return { compteId: prochainId++, compteNumero: numero, compteLibelle: numero, debit, credit, dateEcriture };
}

/** Une boutique : ventes de marchandises, achats, un salaire, un peu de loyer. */
const MOUVEMENTS: MouvementDate[] = [
  // Janvier : 1 000 000 de ventes, 700 000 d'achats → marge 30 %
  mv("2026-01-05", "701", 0, 600_000),
  mv("2026-01-20", "701", 0, 400_000),
  mv("2026-01-10", "601", 700_000),
  mv("2026-01-31", "661", 150_000),
  mv("2026-01-31", "622", 50_000),
  // Février : 800 000 de ventes, 600 000 d'achats → marge 25 %
  mv("2026-02-14", "701", 0, 800_000),
  mv("2026-02-03", "601", 600_000),
  mv("2026-02-28", "661", 150_000),
  // Mars : rien vendu, un avoir sur achat
  mv("2026-03-15", "601", 0, 20_000),
  // Avril : hors période demandée
  mv("2026-04-02", "701", 0, 999_999),
];

describe("découpage en mois", () => {
  it("liste les mois d'un exercice civil", () => {
    expect(listerMois("2026-01-01", "2026-12-31")).toHaveLength(12);
    expect(listerMois("2026-01-01", "2026-03-31")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("passe l'année pour un exercice décalé", () => {
    expect(listerMois("2025-10-01", "2026-02-28")).toEqual(["2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("lit le mois d'une date", () => {
    expect(moisDe("2026-09-21")).toBe("2026-09");
  });
});

describe("tableau de bord mensuel", () => {
  const p = calculerPilotage(EXERCICE, MOUVEMENTS, "2026-03-31");

  it("n'affiche que les mois jusqu'à la date demandée", () => {
    expect(p.mois.map((m) => m.mois)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("calcule le chiffre d'affaires et la marge de chaque mois", () => {
    const [janv, fev, mars] = p.mois;
    expect(janv.chiffreAffaires).toBe(fcfa(1_000_000));
    expect(janv.margeCommerciale).toBe(fcfa(300_000));
    expect(janv.tauxMarge).toBe(30);
    expect(fev.chiffreAffaires).toBe(fcfa(800_000));
    expect(fev.margeCommerciale).toBe(fcfa(200_000));
    expect(fev.tauxMarge).toBe(25);
    // Un avoir sans vente : marge positive, taux indéfini.
    expect(mars.chiffreAffaires).toBe(0);
    expect(mars.margeCommerciale).toBe(fcfa(20_000));
    expect(mars.tauxMarge).toBeNull();
  });

  it("descend jusqu'au résultat, par les mêmes postes que le compte de résultat", () => {
    const [janv] = p.mois;
    // VA = marge − services extérieurs ; EBE = VA − personnel
    expect(janv.valeurAjoutee).toBe(fcfa(250_000));
    expect(janv.chargesPersonnel).toBe(fcfa(150_000));
    expect(janv.ebe).toBe(fcfa(100_000));
    expect(janv.resultatExploitation).toBe(fcfa(100_000));
    expect(janv.resultatNet).toBe(fcfa(100_000));
  });

  it("cumule les mois affichés et recalcule le taux sur le cumul", () => {
    expect(p.cumul.chiffreAffaires).toBe(fcfa(1_800_000));
    expect(p.cumul.margeCommerciale).toBe(fcfa(520_000));
    // 520 000 / 1 800 000
    expect(p.cumul.tauxMarge).toBe(28.9);
    expect(p.cumul.resultatNet).toBe(fcfa(100_000 + 50_000 + 20_000));
  });

  it("ne porte pas de budget quand on n'en donne pas", () => {
    expect(p.mois[0].budgetChiffreAffaires).toBeNull();
    expect(p.cumul.budgetResultat).toBeNull();
  });

  it("ne dépasse jamais la fin de l'exercice", () => {
    const q = calculerPilotage(EXERCICE, MOUVEMENTS, "2027-06-30");
    expect(q.mois).toHaveLength(12);
    expect(q.mois[3].chiffreAffaires).toBe(fcfa(999_999));
  });

  it("ignore un mouvement d'avant l'exercice", () => {
    const q = calculerPilotage(EXERCICE, [mv("2025-12-31", "701", 0, 5_000), ...MOUVEMENTS], "2026-01-31");
    expect(q.cumul.chiffreAffaires).toBe(fcfa(1_000_000));
  });
});

describe("avec un budget", () => {
  const budget = {
    nbMois: 12,
    lignes: [
      { compteNumero: "701", montantAnnuel: fcfa(12_000_000), mensualisation: null },
      { compteNumero: "601", montantAnnuel: fcfa(8_400_000), mensualisation: null },
      { compteNumero: "661", montantAnnuel: fcfa(1_200_000), mensualisation: null },
    ],
  };
  const p = calculerPilotage(EXERCICE, MOUVEMENTS, "2026-02-28", budget);

  it("mensualise le chiffre d'affaires et le résultat prévus", () => {
    expect(p.mois[0].budgetChiffreAffaires).toBe(fcfa(1_000_000));
    expect(p.mois[0].budgetResultat).toBe(fcfa(1_000_000 - 700_000 - 100_000));
    expect(p.cumul.budgetChiffreAffaires).toBe(fcfa(2_000_000));
    expect(p.cumul.budgetResultat).toBe(fcfa(400_000));
  });

  it("respecte une mensualisation pondérée", () => {
    const poids = [3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const q = calculerPilotage(
      EXERCICE,
      [],
      "2026-02-28",
      { nbMois: 12, lignes: [{ compteNumero: "701", montantAnnuel: fcfa(1_400_000), mensualisation: poids }] },
    );
    expect(q.mois[0].budgetChiffreAffaires).toBe(fcfa(300_000));
    expect(q.mois[1].budgetChiffreAffaires).toBe(fcfa(100_000));
  });
});
