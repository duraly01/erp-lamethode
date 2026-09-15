import { describe, it, expect } from "vitest";
import { totauxEcriture } from "./ecriture";
import {
  AmortissementError,
  coefficientDegressif,
  cumulADate,
  cumulLineaire,
  genererEcritureDotations,
  genererEcritureSortie,
  jours360,
  periodesPourPlan,
  planAmortissement,
  tableauImmobilisations,
  totauxTableau,
  type FicheAmortissable,
  type Periode,
} from "./amortissement";

const fcfa = (n: number) => n * 100;

const annee = (a: number): Periode => ({ dateDebut: `${a}-01-01`, dateFin: `${a}-12-31` });
const EXERCICES = [2025, 2026, 2027, 2028, 2029, 2030, 2031].map(annee);

/** Un véhicule à 12 000 000, mis en service le 1er avril 2026, amorti sur 5 ans. */
const VEHICULE: FicheAmortissable = {
  valeurOrigine: fcfa(12_000_000),
  valeurResiduelle: 0,
  dateMiseEnService: "2026-04-01",
  dureeMois: 60,
  mode: "LINEAIRE",
};

describe("jours en convention 30/360", () => {
  it("compte les jours inclus, le 31 comme le 30", () => {
    expect(jours360("2026-01-01", "2026-12-31")).toBe(360);
    expect(jours360("2026-04-01", "2026-12-31")).toBe(270);
    expect(jours360("2026-03-15", "2026-03-31")).toBe(16);
    expect(jours360("2026-02-10", "2026-02-28")).toBe(19);
  });
});

describe("linéaire", () => {
  it("s'étale prorata temporis en jours à partir de la mise en service", () => {
    const plan = planAmortissement(VEHICULE, EXERCICES);
    expect(plan.map((l) => l.dotation)).toEqual([
      0,
      fcfa(1_800_000), // 270/360 de 2 400 000
      fcfa(2_400_000),
      fcfa(2_400_000),
      fcfa(2_400_000),
      fcfa(2_400_000),
      fcfa(600_000), // le solde, jusqu'au 30 mars 2031
    ]);
    expect(plan[6].cumulFin).toBe(fcfa(12_000_000));
    expect(plan[6].vncFin).toBe(0);
  });

  it("ne laisse aucun centime d'arrondi derrière lui : les dotations font la base", () => {
    const f: FicheAmortissable = { ...VEHICULE, valeurOrigine: 1_000_001, dateMiseEnService: "2026-02-17", dureeMois: 37 };
    const plan = planAmortissement(f, [...EXERCICES, annee(2032)]);
    expect(plan.reduce((s, l) => s + l.dotation, 0)).toBe(1_000_001);
    expect(plan[plan.length - 1].vncFin).toBe(0);
    expect(cumulLineaire(f, "2040-01-01")).toBe(1_000_001);
  });

  it("garde la valeur résiduelle hors de la base", () => {
    const f: FicheAmortissable = { ...VEHICULE, valeurResiduelle: fcfa(2_000_000) };
    const plan = planAmortissement(f, EXERCICES);
    expect(plan[2].dotation).toBe(fcfa(2_000_000));
    expect(plan[6].vncFin).toBe(fcfa(2_000_000));
  });

  it("se fige à la sortie du bien", () => {
    const f: FicheAmortissable = { ...VEHICULE, dateSortie: "2027-06-30" };
    const plan = planAmortissement(f, EXERCICES);
    // Du 1er janvier au 30 juin 2027 : 180 jours.
    expect(plan[2].dotation).toBe(fcfa(1_200_000));
    expect(plan[3].dotation).toBe(0);
    expect(plan[3].cumulFin).toBe(fcfa(3_000_000));
  });

  it("un terrain n'a pas de plan", () => {
    expect(planAmortissement({ ...VEHICULE, dureeMois: null }, EXERCICES)).toEqual([]);
  });

  it("refuse une fiche incohérente", () => {
    expect(() => planAmortissement({ ...VEHICULE, valeurResiduelle: fcfa(12_000_000) }, EXERCICES)).toThrow(AmortissementError);
    expect(() => planAmortissement({ ...VEHICULE, dureeMois: 0 }, EXERCICES)).toThrow(AmortissementError);
    expect(() => planAmortissement({ ...VEHICULE, valeurOrigine: 0 }, EXERCICES)).toThrow(AmortissementError);
  });
});

describe("dégressif", () => {
  it("prend le coefficient de la durée", () => {
    expect(coefficientDegressif(36)).toBe(1.5);
    expect(coefficientDegressif(48)).toBe(1.5);
    expect(coefficientDegressif(60)).toBe(2);
    expect(coefficientDegressif(96)).toBe(2.5);
  });

  it("applique le taux à la valeur nette, prorata en mois la première année, puis bascule sur le linéaire", () => {
    // 10 000 000 sur 5 ans, taux 20 % × 2 = 40 %, acquis en avril : 9 mois.
    const f: FicheAmortissable = { valeurOrigine: fcfa(10_000_000), valeurResiduelle: 0, dateMiseEnService: "2026-04-15", dureeMois: 60, mode: "DEGRESSIF" };
    const plan = planAmortissement(f, EXERCICES);
    expect(plan[0].dotation).toBe(0);
    expect(plan[1].dotation).toBe(fcfa(3_000_000)); // 10 000 000 × 40 % × 9/12
    expect(plan[2].dotation).toBe(fcfa(2_800_000)); // 7 000 000 × 40 %
    expect(plan[3].dotation).toBe(fcfa(1_680_000)); // 4 200 000 × 40 %
    // Reste 2 520 000 sur 2 annuités : 50 % > 40 %, bascule.
    expect(plan[4].dotation).toBe(fcfa(1_260_000));
    expect(plan[5].dotation).toBe(fcfa(1_260_000));
    expect(plan[5].vncFin).toBe(0);
    expect(plan[6].dotation).toBe(0);
  });

  it("le cumul à une date rejoue le plan tronqué", () => {
    const f: FicheAmortissable = { valeurOrigine: fcfa(10_000_000), valeurResiduelle: 0, dateMiseEnService: "2026-04-15", dureeMois: 60, mode: "DEGRESSIF" };
    expect(cumulADate(f, EXERCICES, "2026-12-31")).toBe(fcfa(3_000_000));
    expect(cumulADate(f, EXERCICES, "2027-12-31")).toBe(fcfa(5_800_000));
    // Au 30 juin 2027 : la moitié de l'annuité 2027.
    expect(cumulADate(f, EXERCICES, "2027-06-30")).toBe(fcfa(3_000_000 + 1_400_000));
    expect(cumulADate(f, EXERCICES, "2025-12-31")).toBe(0);
  });
});

describe("écriture de dotation", () => {
  const biens = [
    { id: 1, code: "VEH-001", libelle: "Toyota Hilux", fiche: VEHICULE, comptes: { dotation: 6813, amortissement: 2845 } },
    { id: 2, code: "TER-001", libelle: "Terrain Bonabéri", fiche: { ...VEHICULE, dureeMois: null }, comptes: { dotation: 6813, amortissement: 2845 } },
    { id: 3, code: "ORD-001", libelle: "Portable", fiche: { ...VEHICULE, valeurOrigine: fcfa(600_000), dateMiseEnService: "2027-03-01", dureeMois: 36 }, comptes: { dotation: 6813, amortissement: 2844 } },
  ];

  it("une paire de lignes par bien qui s'amortit dans l'exercice, équilibrée", () => {
    const { lignes, dotations } = genererEcritureDotations(biens, EXERCICES, annee(2026), "2026");
    expect(totauxEcriture(lignes).equilibree).toBe(true);
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toMatchObject({ compteId: 6813, debit: "1800000.00", libelle: "Dotation 2026 — VEH-001 Toyota Hilux" });
    expect(lignes[1]).toMatchObject({ compteId: 2845, credit: "1800000.00" });
    expect(dotations).toEqual([{ immobilisationId: 1, montant: fcfa(1_800_000) }]);
  });

  it("l'exercice suivant prend aussi l'ordinateur", () => {
    const { dotations } = genererEcritureDotations(biens, EXERCICES, annee(2027), "2027");
    expect(dotations).toEqual([
      { immobilisationId: 1, montant: fcfa(2_400_000) },
      { immobilisationId: 3, montant: 16_666_667 }, // 600 000 × 300/1080, au centime
    ]);
  });

  it("refuse un exercice hors des périodes", () => {
    expect(() => genererEcritureDotations(biens, EXERCICES, annee(2040), "2040")).toThrow(AmortissementError);
  });
});

describe("écriture de sortie", () => {
  const comptes = { immobilisation: 245, amortissement: 2845, dotation: 6813, valeurComptable: 812, produitCession: 822, creanceCession: 485 };
  const base = { code: "VEH-001", libelle: "Toyota Hilux", fiche: VEHICULE, exercice: annee(2028), periodes: EXERCICES, comptes };

  it("cession : dotation complémentaire, cumul soldé, VNC en 812, prix en 485/822", () => {
    const r = genererEcritureSortie({ ...base, dateSortie: "2028-06-30", prixCession: fcfa(7_000_000), cumulDebutExercice: fcfa(4_200_000), dotationDejaPassee: 0 });
    expect(r.dotationComplementaire).toBe(fcfa(1_200_000));
    expect(r.cumul).toBe(fcfa(5_400_000));
    expect(r.vnc).toBe(fcfa(6_600_000));
    expect(totauxEcriture(r.lignes).equilibree).toBe(true);
    const par = (compteId: number) => r.lignes.filter((l) => l.compteId === compteId);
    expect(par(6813)[0]).toMatchObject({ debit: "1200000.00" });
    expect(par(2845).map((l) => [l.debit, l.credit])).toEqual([
      [undefined, "1200000.00"],
      ["5400000.00", undefined],
    ]);
    expect(par(812)[0]).toMatchObject({ debit: "6600000.00" });
    expect(par(245)[0]).toMatchObject({ credit: "12000000.00" });
    expect(par(485)[0]).toMatchObject({ debit: "7000000.00" });
    expect(par(822)[0]).toMatchObject({ credit: "7000000.00" });
  });

  it("mise au rebut : pas de prix, pas de créance ; dotation déjà passée non redoublée", () => {
    const r = genererEcritureSortie({ ...base, dateSortie: "2028-12-31", prixCession: 0, cumulDebutExercice: fcfa(4_200_000), dotationDejaPassee: fcfa(2_400_000) });
    expect(r.dotationComplementaire).toBe(0);
    expect(r.lignes.some((l) => l.compteId === 485 || l.compteId === 822 || l.compteId === 6813)).toBe(false);
    expect(r.lignes.find((l) => l.compteId === 812)).toMatchObject({ debit: "5400000.00" });
    expect(totauxEcriture(r.lignes).equilibree).toBe(true);
  });

  it("un terrain cédé : ni amortissement ni dotation, la VNC est la valeur d'origine", () => {
    const r = genererEcritureSortie({
      ...base,
      fiche: { ...VEHICULE, dureeMois: null },
      comptes: { ...comptes, amortissement: null, dotation: null },
      dateSortie: "2028-03-01",
      prixCession: fcfa(15_000_000),
      cumulDebutExercice: 0,
      dotationDejaPassee: 0,
    });
    expect(r.vnc).toBe(fcfa(12_000_000));
    expect(r.lignes).toHaveLength(4);
    expect(totauxEcriture(r.lignes).equilibree).toBe(true);
  });

  it("refuse une sortie avant la mise en service et un prix négatif", () => {
    expect(() => genererEcritureSortie({ ...base, dateSortie: "2026-01-01", prixCession: 0, cumulDebutExercice: 0, dotationDejaPassee: 0 })).toThrow(AmortissementError);
    expect(() => genererEcritureSortie({ ...base, dateSortie: "2028-01-01", prixCession: -1, cumulDebutExercice: 0, dotationDejaPassee: 0 })).toThrow(AmortissementError);
  });
});

describe("tableau des immobilisations", () => {
  const biens = [
    { id: 1, code: "VEH-001", libelle: "Toyota Hilux", compteNumero: "245", fiche: VEHICULE, dateAcquisition: "2026-03-28" },
    { id: 2, code: "TER-001", libelle: "Terrain", compteNumero: "222", fiche: { ...VEHICULE, valeurOrigine: fcfa(50_000_000), dureeMois: null, dateMiseEnService: "2020-01-01" }, dateAcquisition: "2020-01-01" },
    { id: 3, code: "ORD-001", libelle: "Portable", compteNumero: "2444", fiche: { ...VEHICULE, valeurOrigine: fcfa(600_000), dateMiseEnService: "2024-01-01", dureeMois: 36, dateSortie: "2026-09-30" }, dateAcquisition: "2024-01-01" },
    { id: 4, code: "FUT-001", libelle: "Pas encore là", compteNumero: "244", fiche: { ...VEHICULE, dateMiseEnService: "2027-01-01" }, dateAcquisition: "2027-01-01" },
  ];

  it("distingue ouverture, entrées, sorties et clôture, en brut et en amortissements", () => {
    const t = tableauImmobilisations(biens, EXERCICES, annee(2026));
    expect(t.map((l) => l.code)).toEqual(["VEH-001", "TER-001", "ORD-001"]);
    const [veh, ter, ord] = t;
    expect(veh).toMatchObject({ brutDebut: 0, acquisitions: fcfa(12_000_000), brutFin: fcfa(12_000_000), amortDebut: 0, dotation: fcfa(1_800_000), amortFin: fcfa(1_800_000), vncFin: fcfa(10_200_000) });
    expect(ter).toMatchObject({ brutDebut: fcfa(50_000_000), acquisitions: 0, brutFin: fcfa(50_000_000), dotation: 0, vncFin: fcfa(50_000_000) });
    // Sorti le 30 septembre : 2 ans + 270 jours sur 1 080 = 550 000 amortis.
    expect(ord).toMatchObject({ brutDebut: fcfa(600_000), sorties: fcfa(600_000), brutFin: 0, amortDebut: fcfa(400_000), dotation: fcfa(150_000), amortSorties: fcfa(550_000), amortFin: 0, vncFin: 0 });
    const tot = totauxTableau(t);
    expect(tot.brutFin).toBe(fcfa(62_000_000));
    expect(tot.brutDebut + tot.acquisitions - tot.sorties).toBe(tot.brutFin);
    expect(tot.amortDebut + tot.dotation - tot.amortSorties).toBe(tot.amortFin);
  });
});

describe("périodes du plan", () => {
  it("prolonge les exercices connus en arrière et en avant sur douze mois", () => {
    const p = periodesPourPlan([annee(2026)], { ...VEHICULE, dateMiseEnService: "2023-05-01", dureeMois: 60 });
    expect(p[0]).toEqual(annee(2023));
    expect(p[p.length - 1].dateFin >= "2029-05-01").toBe(true);
    expect(p.map((x) => x.dateDebut.slice(0, 4))).toEqual(["2023", "2024", "2025", "2026", "2027", "2028", "2029"]);
  });

  it("respecte des exercices décalés", () => {
    const p = periodesPourPlan([{ dateDebut: "2026-07-01", dateFin: "2027-06-30" }], { ...VEHICULE, dateMiseEnService: "2025-09-01", dureeMois: 24 });
    expect(p[0]).toEqual({ dateDebut: "2025-07-01", dateFin: "2026-06-30" });
    expect(p[p.length - 1].dateFin >= "2028-09-01").toBe(true);
  });
});
