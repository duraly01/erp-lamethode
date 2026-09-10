import { describe, it, expect } from "vitest";
import {
  parseMontant,
  formatMontant,
  sommeMontants,
  montantDansLesBornes,
  appliquerTaux,
  formatMontantAffichage,
  MontantInvalideError,
  MONTANT_MAX_CENTIMES,
} from "./money";

describe("parseMontant", () => {
  it("convertit une valeur numeric de PostgreSQL", () => {
    expect(parseMontant("1234.56")).toBe(123456);
    expect(parseMontant("0.00")).toBe(0);
    expect(parseMontant("40.00")).toBe(4000);
  });

  it("accepte la virgule décimale de la saisie francophone", () => {
    expect(parseMontant("1234,56")).toBe(123456);
  });

  it("accepte les espaces de séparation des milliers", () => {
    expect(parseMontant("1 234 567,89")).toBe(123456789);
  });

  it("traite le vide comme un zéro", () => {
    expect(parseMontant(null)).toBe(0);
    expect(parseMontant(undefined)).toBe(0);
    expect(parseMontant("")).toBe(0);
  });

  it("gère les montants négatifs", () => {
    expect(parseMontant("-40.00")).toBe(-4000);
    expect(parseMontant(-40)).toBe(-4000);
  });

  it("échappe au piège du flottant", () => {
    // parseFloat("0.29") * 100 vaut 28.999999999999996 : c'est exactement
    // l'erreur que cette fonction existe pour éviter.
    expect(parseMontant("0.29")).toBe(29);
    expect(parseMontant("1.15")).toBe(115);
    expect(parseMontant("8.20")).toBe(820);
  });

  it("arrondit au centime, le demi s'éloignant de zéro", () => {
    expect(parseMontant("1.005")).toBe(101);
    expect(parseMontant("1.004")).toBe(100);
    expect(parseMontant("1.009")).toBe(101);
  });

  it("refuse ce qui n'est pas un montant", () => {
    expect(() => parseMontant("abc")).toThrow(MontantInvalideError);
    expect(() => parseMontant("12.34.56")).toThrow(MontantInvalideError);
    expect(() => parseMontant(Number.NaN)).toThrow(MontantInvalideError);
    expect(() => parseMontant(Number.POSITIVE_INFINITY)).toThrow(
      MontantInvalideError,
    );
  });
});

describe("formatMontant", () => {
  it("rend toujours deux décimales", () => {
    expect(formatMontant(123456)).toBe("1234.56");
    expect(formatMontant(0)).toBe("0.00");
    expect(formatMontant(5)).toBe("0.05");
    expect(formatMontant(4000)).toBe("40.00");
    expect(formatMontant(-4000)).toBe("-40.00");
  });

  it("fait l'aller-retour sans perte", () => {
    for (const v of ["0.00", "1234.56", "-40.05", "999999.99"]) {
      expect(formatMontant(parseMontant(v))).toBe(v);
    }
  });
});

describe("sommeMontants", () => {
  it("additionne exactement là où le flottant échoue", () => {
    // 0.1 + 0.2 vaut 0.30000000000000004 en flottant.
    const total = sommeMontants([parseMontant("0.10"), parseMontant("0.20")]);
    expect(total).toBe(parseMontant("0.30"));
    expect(formatMontant(total)).toBe("0.30");
  });

  it("rend zéro sur une liste vide", () => {
    expect(sommeMontants([])).toBe(0);
  });
});

describe("montantDansLesBornes", () => {
  it("accepte le plafond de numeric(14,2) et refuse au-delà", () => {
    expect(montantDansLesBornes(MONTANT_MAX_CENTIMES)).toBe(true);
    expect(montantDansLesBornes(-MONTANT_MAX_CENTIMES)).toBe(true);
    expect(montantDansLesBornes(MONTANT_MAX_CENTIMES + 1)).toBe(false);
  });
});

describe("appliquerTaux", () => {
  it("calcule la TVA camerounaise à 19,25 %", () => {
    // 10 000 FCFA HT donnent 1 925 FCFA de TVA.
    expect(appliquerTaux(parseMontant("10000"), "19.2500")).toBe(
      parseMontant("1925"),
    );
  });

  it("arrondit au centime le plus proche", () => {
    // 3,33 x 19,25 % = 0,641025, arrondi à 0,64.
    expect(appliquerTaux(parseMontant("3.33"), "19.2500")).toBe(64);
  });

  it("gère un taux nul et un taux à une décimale", () => {
    expect(appliquerTaux(parseMontant("10000"), "0")).toBe(0);
    expect(appliquerTaux(parseMontant("10000"), "5.5")).toBe(
      parseMontant("550"),
    );
  });

  it("accepte l'acompte AIR de 2,2 %", () => {
    expect(appliquerTaux(parseMontant("1000000"), "2.2000")).toBe(
      parseMontant("22000"),
    );
  });
});

describe("formatMontantAffichage", () => {
  // Deux séparateurs différents, tous deux insécables, conformes à la
  // typographie française : une espace fine entre les groupes de milliers, une
  // espace insécable ordinaire avant la devise. Aucun des deux ne doit laisser
  // le montant se couper en fin de ligne. Ils sont écrits ici en séquences
  // d'échappement : à l'œil, rien ne les distingue d'une espace ordinaire, et
  // un test qui échoue sans raison visible coûte cher à diagnostiquer.
  const FINE = "\u202f"; // espace fine insécable, entre les milliers
  const INSEC = "\u00a0"; // espace insécable, avant la devise

  it("groupe les milliers et omet les décimales nulles", () => {
    expect(formatMontantAffichage(parseMontant("1234567.89"))).toBe(
      `1${FINE}234${FINE}567,89${INSEC}FCFA`,
    );
    expect(formatMontantAffichage(parseMontant("10000"))).toBe(
      `10${FINE}000${INSEC}FCFA`,
    );
    expect(formatMontantAffichage(parseMontant("-4000"))).toBe(
      `-4${FINE}000${INSEC}FCFA`,
    );
    expect(formatMontantAffichage(0)).toBe(`0${INSEC}FCFA`);
  });

  it("n'emploie aucune espace ordinaire, qui autoriserait une coupure", () => {
    expect(formatMontantAffichage(parseMontant("10000"))).not.toContain(" ");
  });

  it("accepte une autre devise", () => {
    expect(formatMontantAffichage(parseMontant("1500.50"), "EUR")).toBe(
      `1${FINE}500,50${INSEC}EUR`,
    );
  });
});
