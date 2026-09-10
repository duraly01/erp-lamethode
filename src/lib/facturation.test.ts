import { describe, it, expect } from "vitest";
import {
  TVA_TAUX_DEFAUT,
  calculeTotaux,
  formatNumeroFacture,
  libellePeriode,
  montantEnLettres,
  nombreEnLettres,
  resteAPayer,
  sequenceDepuisNumero,
  statutCalcule,
  tauxTvaParDefaut,
} from "./facturation";

describe("tauxTvaParDefaut", () => {
  it("ne taxe que les honoraires", () => {
    expect(tauxTvaParDefaut("HONORAIRES")).toBe(TVA_TAUX_DEFAUT);
    expect(tauxTvaParDefaut("IMPOT_TRESOR")).toBe(0);
    expect(tauxTvaParDefaut("CNPS")).toBe(0);
    expect(tauxTvaParDefaut("FRAIS")).toBe(0);
  });
});

describe("calculeTotaux", () => {
  it("additionne des lignes sans TVA", () => {
    expect(
      calculeTotaux([
        { montantHt: 7540, tauxTva: 0 },
        { montantHt: 6600, tauxTva: 0 },
        { montantHt: 2000, tauxTva: 0 },
      ]),
    ).toEqual({ totalHt: 16140, totalTva: 0, totalTtc: 16140 });
  });

  it("applique la TVA aux seuls honoraires", () => {
    // Reprise du prototype : 41 140 F de débours + 25 000 F d'honoraires.
    const t = calculeTotaux([
      { montantHt: 7540, tauxTva: 0 },
      { montantHt: 6600, tauxTva: 0 },
      { montantHt: 2000, tauxTva: 0 },
      { montantHt: 25000, tauxTva: TVA_TAUX_DEFAUT },
    ]);
    expect(t.totalHt).toBe(41140);
    expect(t.totalTva).toBe(4812.5);
    expect(t.totalTtc).toBe(45952.5);
  });

  it("ne dérive pas sur les centimes", () => {
    const t = calculeTotaux(
      Array.from({ length: 10 }, () => ({ montantHt: 0.1, tauxTva: 0 })),
    );
    expect(t.totalHt).toBe(1);
  });

  it("gère une facture vide", () => {
    expect(calculeTotaux([])).toEqual({
      totalHt: 0,
      totalTva: 0,
      totalTtc: 0,
    });
  });
});

describe("resteAPayer", () => {
  it("soustrait les règlements", () => {
    expect(resteAPayer(45952.5, 20000)).toBe(25952.5);
  });

  it("ne descend jamais sous zéro en cas de trop-perçu", () => {
    expect(resteAPayer(10000, 12000)).toBe(0);
  });
});

describe("statutCalcule", () => {
  const base = {
    totalTtc: 50000,
    montantRegle: 0,
    dateEcheance: "2026-01-31",
    // Midi UTC : même jour calendaire dans tous les fuseaux, le test ne dépend
    // donc pas de la machine qui l'exécute.
    aujourdHui: new Date("2026-02-10T12:00:00Z"),
  };

  it("laisse un brouillon et une facture annulée intacts", () => {
    expect(statutCalcule({ ...base, statut: "BROUILLON" })).toBe("BROUILLON");
    expect(statutCalcule({ ...base, statut: "ANNULEE" })).toBe("ANNULEE");
  });

  it("passe en retard après l'échéance", () => {
    expect(statutCalcule({ ...base, statut: "ENVOYEE" })).toBe("EN_RETARD");
  });

  it("reste envoyée avant l'échéance", () => {
    expect(
      statutCalcule({
        ...base,
        statut: "ENVOYEE",
        aujourdHui: new Date("2026-01-15T12:00:00Z"),
      }),
    ).toBe("ENVOYEE");
  });

  it("le jour de l'échéance n'est pas un retard", () => {
    expect(
      statutCalcule({
        ...base,
        statut: "ENVOYEE",
        aujourdHui: new Date("2026-01-31T12:00:00Z"),
      }),
    ).toBe("ENVOYEE");
  });

  it("le règlement prime sur le retard", () => {
    expect(
      statutCalcule({ ...base, statut: "EN_RETARD", montantRegle: 50000 }),
    ).toBe("PAYEE");
    expect(
      statutCalcule({ ...base, statut: "EN_RETARD", montantRegle: 20000 }),
    ).toBe("PARTIELLE");
  });

  it("une facture à zéro ne devient pas payée par accident", () => {
    expect(
      statutCalcule({
        ...base,
        statut: "ENVOYEE",
        totalTtc: 0,
        montantRegle: 0,
      }),
    ).toBe("EN_RETARD");
  });
});

describe("numérotation", () => {
  it("formate le numéro sur quatre chiffres", () => {
    expect(formatNumeroFacture("FA", 2026, 7)).toBe("FA-2026-0007");
    expect(formatNumeroFacture("FA", 2026, 1234)).toBe("FA-2026-1234");
  });

  it("relit la séquence d'un numéro", () => {
    expect(sequenceDepuisNumero("FA-2026-0007", "FA", 2026)).toBe(7);
  });

  it("ignore un numéro d'une autre année ou d'un autre préfixe", () => {
    expect(sequenceDepuisNumero("FA-2025-0007", "FA", 2026)).toBe(0);
    expect(sequenceDepuisNumero("PRO-2026-0007", "FA", 2026)).toBe(0);
    expect(sequenceDepuisNumero("n'importe quoi", "FA", 2026)).toBe(0);
  });
});

describe("nombreEnLettres", () => {
  it("écrit les petits nombres", () => {
    expect(nombreEnLettres(0)).toBe("zéro");
    expect(nombreEnLettres(7)).toBe("sept");
    expect(nombreEnLettres(16)).toBe("seize");
    expect(nombreEnLettres(17)).toBe("dix-sept");
  });

  it("respecte les accords des dizaines", () => {
    expect(nombreEnLettres(21)).toBe("vingt et un");
    expect(nombreEnLettres(22)).toBe("vingt-deux");
    expect(nombreEnLettres(71)).toBe("soixante et onze");
    expect(nombreEnLettres(76)).toBe("soixante-seize");
    expect(nombreEnLettres(80)).toBe("quatre-vingts");
    expect(nombreEnLettres(81)).toBe("quatre-vingt-un");
    expect(nombreEnLettres(91)).toBe("quatre-vingt-onze");
    expect(nombreEnLettres(99)).toBe("quatre-vingt-dix-neuf");
  });

  it("respecte les accords des centaines", () => {
    expect(nombreEnLettres(100)).toBe("cent");
    expect(nombreEnLettres(101)).toBe("cent un");
    expect(nombreEnLettres(200)).toBe("deux cents");
    expect(nombreEnLettres(201)).toBe("deux cent un");
    expect(nombreEnLettres(980)).toBe("neuf cent quatre-vingts");
  });

  it("laisse « mille » invariable", () => {
    expect(nombreEnLettres(1000)).toBe("mille");
    expect(nombreEnLettres(2000)).toBe("deux mille");
    expect(nombreEnLettres(1001)).toBe("mille un");
  });

  it("accorde millions et milliards", () => {
    expect(nombreEnLettres(1_000_000)).toBe("un million");
    expect(nombreEnLettres(2_000_000)).toBe("deux millions");
    expect(nombreEnLettres(1_000_000_000)).toBe("un milliard");
  });

  it("reproduit le montant du prototype de facture", () => {
    // « (quarante et un mille cent quarante francs CFA) »
    expect(montantEnLettres(41140)).toBe(
      "quarante et un mille cent quarante francs CFA",
    );
  });

  it("écrit un montant composite", () => {
    expect(nombreEnLettres(1_234_567)).toBe(
      "un million deux cent trente-quatre mille cinq cent soixante-sept",
    );
  });

  it("arrondit le montant avant de l'écrire", () => {
    expect(montantEnLettres(45952.5)).toBe(
      "quarante-cinq mille neuf cent cinquante-trois francs CFA",
    );
  });
});

describe("libellePeriode", () => {
  it("traduit une période mensuelle", () => {
    expect(libellePeriode("2026-01")).toBe("janvier 2026");
    expect(libellePeriode("2026-12")).toBe("décembre 2026");
  });

  it("laisse passer une période non mensuelle", () => {
    expect(libellePeriode("2026")).toBe("2026");
    expect(libellePeriode("2026-13")).toBe("2026-13");
  });
});
