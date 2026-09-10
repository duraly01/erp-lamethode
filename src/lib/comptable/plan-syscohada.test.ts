import { describe, it, expect } from "vitest";
import {
  PLAN_SYSCOHADA,
  JOURNAUX_PAR_DEFAUT,
  TAXES_PAR_DEFAUT,
} from "./plan-syscohada";

/**
 * Le plan de référence est saisi à la main : ces contrôles attrapent les fautes
 * de frappe avant qu'elles ne se retrouvent copiées dans le plan comptable de
 * chaque contribuable, où elles seraient bien plus coûteuses à corriger.
 */
describe("plan comptable SYSCOHADA de référence", () => {
  it("ne contient aucun numéro de compte en double", () => {
    const numeros = PLAN_SYSCOHADA.map((c) => c.numero);
    const doublons = numeros.filter((n, i) => numeros.indexOf(n) !== i);
    expect(doublons).toEqual([]);
  });

  it("fait correspondre la classe au premier chiffre du numéro", () => {
    const incoherents = PLAN_SYSCOHADA.filter(
      (c) => Number(c.numero[0]) !== c.classe,
    ).map((c) => `${c.numero} (classe ${c.classe})`);
    expect(incoherents).toEqual([]);
  });

  it("n'utilise que des classes 1 à 8", () => {
    // La classe 9 (analytique et engagements) viendra avec E5.
    const hors = PLAN_SYSCOHADA.filter((c) => c.classe < 1 || c.classe > 8);
    expect(hors).toEqual([]);
  });

  it("n'a que des numéros numériques d'au moins trois chiffres", () => {
    const invalides = PLAN_SYSCOHADA.filter(
      (c) => !/^\d{3,}$/.test(c.numero),
    ).map((c) => c.numero);
    expect(invalides).toEqual([]);
  });

  it("classe les comptes de charges en 6 ou 8 et les produits en 7 ou 8", () => {
    const incoherents = PLAN_SYSCOHADA.filter(
      (c) =>
        (c.type === "CHARGE" && c.classe !== 6 && c.classe !== 8) ||
        (c.type === "PRODUIT" && c.classe !== 7 && c.classe !== 8),
    ).map((c) => `${c.numero} ${c.type}`);
    expect(incoherents).toEqual([]);
  });

  it("ne déclare collectif ou lettrable que des comptes de tiers ou de trésorerie", () => {
    const suspects = PLAN_SYSCOHADA.filter(
      (c) => c.collectif && c.classe !== 4,
    ).map((c) => c.numero);
    expect(suspects).toEqual([]);
  });

  it("ne déclare rapprochable que des comptes de trésorerie", () => {
    const suspects = PLAN_SYSCOHADA.filter(
      (c) => c.rapprochable && c.classe !== 5,
    ).map((c) => c.numero);
    expect(suspects).toEqual([]);
  });

  it("couvre les comptes indispensables au bouclage déclaratif", () => {
    const numeros = new Set(PLAN_SYSCOHADA.map((c) => c.numero));
    // TVA collectée, TVA récupérable, TVA due, CNPS, IRPP, AIR, résultat.
    for (const requis of [
      "4431",
      "4452",
      "4441",
      "431",
      "4471",
      "4473",
      "131",
    ]) {
      expect(numeros.has(requis), `compte ${requis} manquant`).toBe(true);
    }
  });
});

describe("journaux par défaut", () => {
  it("n'a aucun code en double", () => {
    const codes = JOURNAUX_PAR_DEFAUT.map((j) => j.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("désigne des comptes de contrepartie qui existent au plan", () => {
    const numeros = new Set(PLAN_SYSCOHADA.map((c) => c.numero));
    for (const j of JOURNAUX_PAR_DEFAUT) {
      if (!j.compteContrepartie) continue;
      expect(
        numeros.has(j.compteContrepartie),
        `journal ${j.code} → compte ${j.compteContrepartie} absent du plan`,
      ).toBe(true);
    }
  });

  it("fournit exactement un journal d'à-nouveaux", () => {
    const an = JOURNAUX_PAR_DEFAUT.filter((j) => j.type === "A_NOUVEAUX");
    expect(an).toHaveLength(1);
  });
});

describe("taxes par défaut", () => {
  it("n'a aucun code en double", () => {
    const codes = TAXES_PAR_DEFAUT.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("rattache chaque taxe à un compte existant", () => {
    const numeros = new Set(PLAN_SYSCOHADA.map((c) => c.numero));
    for (const t of TAXES_PAR_DEFAUT) {
      expect(
        numeros.has(t.compte),
        `taxe ${t.code} → compte ${t.compte} absent du plan`,
      ).toBe(true);
    }
  });

  it("porte des taux positifs et une date de début de validité", () => {
    for (const t of TAXES_PAR_DEFAUT) {
      expect(Number(t.taux)).toBeGreaterThanOrEqual(0);
      expect(t.valideDu).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
