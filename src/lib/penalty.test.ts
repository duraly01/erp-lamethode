import { describe, it, expect } from "vitest";
import { computePenalty } from "@/lib/penalty";

describe("computePenalty", () => {
  it("forfait fixe : montant constant, quel que soit le dû", () => {
    expect(computePenalty({ type: "fixe", valeur: 100000 }, 5_000_000)).toBe(
      100000,
    );
    expect(computePenalty({ type: "fixe", valeur: 100000 }, null)).toBe(100000);
  });

  it("pourcentage au-dessus du minimum", () => {
    expect(
      computePenalty({ type: "pct", valeur: 0.1, minimum: 50000 }, 1_000_000),
    ).toBe(100000);
  });

  it("pourcentage sous le minimum → minimum plancher", () => {
    expect(
      computePenalty({ type: "pct", valeur: 0.1, minimum: 50000 }, 100000),
    ).toBe(50000);
  });

  it("montant nul ou vide → minimum", () => {
    expect(
      computePenalty({ type: "pct", valeur: 0.1, minimum: 50000 }, null),
    ).toBe(50000);
    expect(
      computePenalty({ type: "pct", valeur: 0.1, minimum: 50000 }, ""),
    ).toBe(50000);
  });

  it("montant fourni en chaîne (numeric Postgres)", () => {
    expect(
      computePenalty({ type: "pct", valeur: 0.1, minimum: 50000 }, "2000000"),
    ).toBe(200000);
  });

  it("sans minimum défini → 0 possible", () => {
    expect(computePenalty({ type: "pct", valeur: 0.05 }, 0)).toBe(0);
  });
});
