import { describe, it, expect } from "vitest";
import { BAREME_PAIE_DEFAUT, baremeEnVigueur, verifierBareme, type BaremePaie } from "./bareme";
import { calculerBulletin, calculerIrpp, forfaitParTranche, impotProgressif, PaieInvalideError } from "./calcul";

const fcfa = (n: number) => n * 100;
const bareme = BAREME_PAIE_DEFAUT[0];

describe("barème en vigueur", () => {
  const versions: BaremePaie[] = [
    { ...bareme, valideDu: "2016-07-01" },
    { ...bareme, valideDu: "2027-01-01", cfc: { salarie: 2, employeur: 3 } },
  ];

  it("choisit la version la plus récente qui s'applique au mois", () => {
    expect(baremeEnVigueur(versions, "2026-12")?.cfc.salarie).toBe(1);
    expect(baremeEnVigueur(versions, "2027-01")?.cfc.salarie).toBe(2);
  });

  it("ne trouve rien avant la première version", () => {
    expect(baremeEnVigueur(versions, "2010-05")).toBeNull();
  });

  it("le barème livré est cohérent", () => {
    expect(verifierBareme(bareme)).toEqual([]);
  });

  it("refuse des tranches non croissantes ou une dernière tranche fermée", () => {
    const faux: BaremePaie = {
      ...bareme,
      irpp: { ...bareme.irpp, tranchesAnnuelles: [{ jusqua: 3_000_000, taux: 10 }, { jusqua: 2_000_000, taux: 15 }] },
    };
    expect(verifierBareme(faux).join(" ")).toMatch(/croissantes/);
    expect(verifierBareme(faux).join(" ")).toMatch(/dernière tranche doit être ouverte/);
  });
});

describe("briques de calcul", () => {
  it("impôt progressif : chaque tranche taxe ce qui la traverse", () => {
    const t = bareme.irpp.tranchesAnnuelles;
    expect(impotProgressif(t, fcfa(1_000_000))).toBe(fcfa(100_000));
    expect(impotProgressif(t, fcfa(2_000_000))).toBe(fcfa(200_000));
    expect(impotProgressif(t, fcfa(3_448_000))).toBe(fcfa(200_000 + 150_000 + 112_000));
    expect(impotProgressif(t, fcfa(6_000_000))).toBe(fcfa(200_000 + 150_000 + 500_000 + 350_000));
    expect(impotProgressif(t, 0)).toBe(0);
  });

  it("forfait par tranche : borne incluse, dernière ouverte", () => {
    expect(forfaitParTranche(bareme.tdl, fcfa(61_999))).toBe(0);
    expect(forfaitParTranche(bareme.tdl, fcfa(62_000))).toBe(fcfa(250));
    expect(forfaitParTranche(bareme.tdl, fcfa(75_000))).toBe(fcfa(250));
    expect(forfaitParTranche(bareme.tdl, fcfa(75_001))).toBe(fcfa(500));
    expect(forfaitParTranche(bareme.tdl, fcfa(2_000_000))).toBe(fcfa(2_500));
    expect(forfaitParTranche([], fcfa(100_000))).toBe(0);
  });

  it("IRPP : exonéré au seuil ; juste au-dessus, l'abattement annuel absorbe encore tout", () => {
    expect(calculerIrpp(fcfa(62_000), 0, bareme.irpp).irpp).toBe(0);
    // 62 001 × 70 % − 2 604 = 40 797 ; × 12 = 489 560 < 500 000 : rien.
    expect(calculerIrpp(fcfa(62_001), fcfa(2_604), bareme.irpp)).toEqual({ irpp: 0, revenuNetAnnuel: 0 });
    expect(calculerIrpp(fcfa(100_000), fcfa(4_200), bareme.irpp).irpp).toBe(fcfa(2_413));
  });
});

describe("bulletin de référence : 500 000 brut, régime général, groupe A", () => {
  const b = calculerBulletin({ salaireBase: fcfa(500_000), regimeCnps: "GENERAL", groupeRisque: "A" }, bareme);
  const ligne = (code: string) => b.lignes.find((l) => l.code === code)!;

  it("retenues salariales", () => {
    expect(ligne("PVID_SALARIE").montant).toBe(fcfa(21_000));
    // Net : 500 000 × 70 % − 21 000 = 329 000 ; annuel 3 948 000 − 500 000 = 3 448 000 ;
    // 200 000 + 150 000 + 112 000 = 462 000 par an, 38 500 par mois.
    expect(ligne("IRPP").montant).toBe(fcfa(38_500));
    expect(ligne("CAC").montant).toBe(fcfa(3_850));
    expect(ligne("CFC_SALARIE").montant).toBe(fcfa(5_000));
    expect(ligne("TDL").montant).toBe(fcfa(2_250));
    expect(ligne("RAV").montant).toBe(fcfa(5_850));
    expect(b.totaux.totalRetenues).toBe(fcfa(21_000 + 38_500 + 3_850 + 5_000 + 2_250 + 5_850));
    expect(b.totaux.netAPayer).toBe(fcfa(423_550));
  });

  it("charges patronales", () => {
    expect(ligne("PVID_EMPLOYEUR").montant).toBe(fcfa(21_000));
    expect(ligne("PRESTATIONS_FAMILIALES").montant).toBe(fcfa(35_000));
    expect(ligne("ACCIDENTS_TRAVAIL").montant).toBe(fcfa(8_750));
    expect(ligne("CFC_EMPLOYEUR").montant).toBe(fcfa(7_500));
    expect(ligne("FNE").montant).toBe(fcfa(5_000));
    expect(b.totaux.chargesEmployeur).toBe(fcfa(77_250));
    expect(b.totaux.coutTotal).toBe(fcfa(577_250));
  });

  it("les totaux se recoupent avec les lignes", () => {
    const somme = (type: string) => b.lignes.filter((l) => l.type === type && !l.enNature).reduce((s, l) => s + l.montant, 0);
    expect(somme("GAIN")).toBe(b.totaux.brut);
    expect(somme("RETENUE")).toBe(b.totaux.totalRetenues);
    expect(somme("EMPLOYEUR")).toBe(b.totaux.chargesEmployeur);
    expect(b.totaux.brut - b.totaux.totalRetenues).toBe(b.totaux.netAPayer);
  });
});

describe("plafond CNPS", () => {
  it("au-delà de 750 000, la CNPS ne monte plus mais l'IRPP si", () => {
    const b = calculerBulletin({ salaireBase: fcfa(1_200_000), regimeCnps: "GENERAL", groupeRisque: "B" }, bareme);
    const ligne = (code: string) => b.lignes.find((l) => l.code === code)!;
    expect(ligne("PVID_SALARIE").base).toBe(fcfa(750_000));
    expect(ligne("PVID_SALARIE").montant).toBe(fcfa(31_500));
    expect(ligne("PRESTATIONS_FAMILIALES").montant).toBe(fcfa(52_500));
    expect(ligne("ACCIDENTS_TRAVAIL").montant).toBe(fcfa(18_750));
    // Net : 840 000 − 31 500 = 808 500 ; annuel 9 702 000 − 500 000 = 9 202 000 ;
    // 200 000 + 150 000 + 500 000 + 35 % × 4 202 000 = 2 320 700 ; /12 = 193 391,67 → 193 392.
    expect(ligne("IRPP").montant).toBe(fcfa(193_392));
    expect(ligne("CFC_SALARIE").montant).toBe(fcfa(12_000));
    expect(ligne("RAV").montant).toBe(fcfa(13_000));
  });
});

describe("bas salaires", () => {
  it("à 60 000 : ni IRPP, ni CAC, ni TDL, mais la CNPS et le CFC", () => {
    const b = calculerBulletin({ salaireBase: fcfa(60_000), regimeCnps: "GENERAL", groupeRisque: "A" }, bareme);
    const ligne = (code: string) => b.lignes.find((l) => l.code === code)!;
    expect(ligne("PVID_SALARIE").montant).toBe(fcfa(2_520));
    expect(ligne("IRPP").montant).toBe(0);
    expect(ligne("CAC").montant).toBe(0);
    expect(ligne("TDL").montant).toBe(0);
    expect(ligne("CFC_SALARIE").montant).toBe(fcfa(600));
    expect(ligne("RAV").montant).toBe(fcfa(750));
    expect(b.totaux.netAPayer).toBe(fcfa(60_000 - 2_520 - 600 - 750));
  });

  it("à 100 000 brut, l'IRPP mensuel est de 2 413", () => {
    // 100 000 brut : net 70 000 − 4 200 = 65 800 ; annuel 789 600 − 500 000 = 289 600 → 10 % = 28 960/an = 2 413/mois.
    const b = calculerBulletin({ salaireBase: fcfa(100_000), regimeCnps: "GENERAL", groupeRisque: "A" }, bareme);
    expect(b.lignes.find((l) => l.code === "IRPP")!.montant).toBe(fcfa(2_413));
  });
});

describe("éléments du mois", () => {
  it("l'absence se retient au prorata sur le salaire de base seul, et la TDL ne bouge pas", () => {
    const b = calculerBulletin(
      {
        salaireBase: fcfa(300_000),
        regimeCnps: "GENERAL",
        groupeRisque: "A",
        joursAbsence: 3,
        rubriques: [{ libelle: "Prime de responsabilité", montant: fcfa(50_000), cotisable: true, imposable: true }],
      },
      bareme,
    );
    expect(b.lignes.find((l) => l.code === "ABSENCE")).toMatchObject({ montant: -fcfa(30_000) });
    expect(b.totaux.brut).toBe(fcfa(320_000));
    expect(b.lignes.find((l) => l.code === "TDL")!.montant).toBe(fcfa(2_000));
  });

  it("une prime non cotisable ni imposable entre dans le brut, pas dans les bases", () => {
    const sans = calculerBulletin({ salaireBase: fcfa(200_000), regimeCnps: "GENERAL", groupeRisque: "A" }, bareme);
    const avec = calculerBulletin(
      {
        salaireBase: fcfa(200_000),
        regimeCnps: "GENERAL",
        groupeRisque: "A",
        rubriques: [{ libelle: "Prime de transport", montant: fcfa(25_000), cotisable: false, imposable: false }],
      },
      bareme,
    );
    expect(avec.totaux.brut).toBe(sans.totaux.brut + fcfa(25_000));
    expect(avec.totaux.brutCotisable).toBe(sans.totaux.brutCotisable);
    expect(avec.totaux.brutImposable).toBe(sans.totaux.brutImposable);
    expect(avec.totaux.totalRetenues).toBe(sans.totaux.totalRetenues);
    expect(avec.totaux.netAPayer).toBe(sans.totaux.netAPayer + fcfa(25_000));
  });

  it("un avantage en nature gonfle les bases et l'impôt, pas le net versé", () => {
    const sans = calculerBulletin({ salaireBase: fcfa(400_000), regimeCnps: "GENERAL", groupeRisque: "A" }, bareme);
    const avec = calculerBulletin(
      { salaireBase: fcfa(400_000), regimeCnps: "GENERAL", groupeRisque: "A", avantagesNature: ["LOGEMENT", "VEHICULE"] },
      bareme,
    );
    expect(avec.totaux.avantagesNature).toBe(fcfa(60_000 + 40_000));
    expect(avec.totaux.brut).toBe(sans.totaux.brut);
    expect(avec.totaux.brutImposable).toBe(fcfa(500_000));
    expect(avec.totaux.brutCotisable).toBe(fcfa(500_000));
    expect(avec.totaux.irpp).toBeGreaterThan(sans.totaux.irpp);
    expect(avec.totaux.netAPayer).toBeLessThan(sans.totaux.netAPayer);
    // Le brut espèces moins les retenues fait bien le net.
    expect(avec.totaux.netAPayer).toBe(avec.totaux.brut - avec.totaux.totalRetenues);
  });

  it("acomptes et autres retenues viennent en moins du net", () => {
    const b = calculerBulletin(
      {
        salaireBase: fcfa(500_000),
        regimeCnps: "GENERAL",
        groupeRisque: "A",
        avances: fcfa(100_000),
        autresRetenues: [{ libelle: "Saisie-arrêt", montant: fcfa(20_000) }],
      },
      bareme,
    );
    expect(b.totaux.netAPayer).toBe(fcfa(423_550 - 120_000));
  });

  it("régime et groupe changent les seules charges patronales", () => {
    const a = calculerBulletin({ salaireBase: fcfa(500_000), regimeCnps: "GENERAL", groupeRisque: "A" }, bareme);
    const c = calculerBulletin({ salaireBase: fcfa(500_000), regimeCnps: "AGRICOLE", groupeRisque: "C" }, bareme);
    expect(c.totaux.netAPayer).toBe(a.totaux.netAPayer);
    expect(c.totaux.prestationsFamiliales).toBe(fcfa(28_250));
    expect(c.totaux.accidentsTravail).toBe(fcfa(25_000));
  });

  it("sans RAV au barème, pas de ligne RAV", () => {
    const b = calculerBulletin({ salaireBase: fcfa(500_000), regimeCnps: "GENERAL", groupeRisque: "A" }, { ...bareme, rav: [] });
    expect(b.lignes.some((l) => l.code === "RAV")).toBe(false);
    expect(b.totaux.rav).toBe(0);
  });
});

describe("refus", () => {
  it("un net négatif", () => {
    expect(() =>
      calculerBulletin({ salaireBase: fcfa(100_000), regimeCnps: "GENERAL", groupeRisque: "A", avances: fcfa(200_000) }, bareme),
    ).toThrow(PaieInvalideError);
  });

  it("des absences hors du mois", () => {
    expect(() =>
      calculerBulletin({ salaireBase: fcfa(100_000), regimeCnps: "GENERAL", groupeRisque: "A", joursAbsence: 31 }, bareme),
    ).toThrow(PaieInvalideError);
  });

  it("une rubrique négative", () => {
    expect(() =>
      calculerBulletin(
        { salaireBase: fcfa(100_000), regimeCnps: "GENERAL", groupeRisque: "A", rubriques: [{ libelle: "x", montant: -1, cotisable: true, imposable: true }] },
        bareme,
      ),
    ).toThrow(PaieInvalideError);
  });
});
