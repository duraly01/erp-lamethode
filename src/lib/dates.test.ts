import { describe, it, expect, vi, afterEach } from "vitest";
import { jourAuCameroun, ajouterJours, FUSEAU_CAMEROUN } from "@/lib/dates";

describe("jourAuCameroun", () => {
  afterEach(() => vi.useRealTimers());

  function auMomentDe(instantUtc: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instantUtc));
    return jourAuCameroun();
  }

  it("rend le jour au format « AAAA-MM-JJ »", () => {
    expect(auMomentDe("2026-09-11T09:00:00Z")).toBe("2026-09-11");
  });

  it("après 23 h UTC, on est déjà le lendemain à Douala", () => {
    // Le défaut corrigé : `toISOString()` aurait rendu « 2026-09-10 », datant
    // de la veille toute écriture saisie pendant cette heure-là.
    expect(auMomentDe("2026-09-10T23:30:00Z")).toBe("2026-09-11");
  });

  it("passe correctement un changement de mois, puis d'année", () => {
    expect(auMomentDe("2026-01-31T23:10:00Z")).toBe("2026-02-01");
    expect(auMomentDe("2026-12-31T23:10:00Z")).toBe("2027-01-01");
  });

  it("le Cameroun ne connaît pas d'heure d'été : +1 h toute l'année", () => {
    expect(auMomentDe("2026-01-15T23:30:00Z")).toBe("2026-01-16");
    expect(auMomentDe("2026-07-15T23:30:00Z")).toBe("2026-07-16");
  });

  it("accepte un instant explicite plutôt que l'heure courante", () => {
    expect(jourAuCameroun(new Date("2024-02-29T22:00:00Z"))).toBe("2024-02-29");
    expect(jourAuCameroun(new Date("2024-02-29T23:00:00Z"))).toBe("2024-03-01");
  });

  it("nomme le fuseau du cabinet", () => {
    expect(FUSEAU_CAMEROUN).toBe("Africa/Douala");
  });
});

describe("ajouterJours", () => {
  it("avance et recule d'un nombre de jours", () => {
    expect(ajouterJours("2026-09-11", 7)).toBe("2026-09-18");
    expect(ajouterJours("2026-09-11", -1)).toBe("2026-09-10");
    expect(ajouterJours("2026-09-11", 0)).toBe("2026-09-11");
  });

  it("franchit les fins de mois et les années bissextiles", () => {
    expect(ajouterJours("2026-01-31", 1)).toBe("2026-02-01");
    expect(ajouterJours("2026-12-31", 1)).toBe("2027-01-01");
    expect(ajouterJours("2024-02-28", 1)).toBe("2024-02-29");
    expect(ajouterJours("2025-02-28", 1)).toBe("2025-03-01");
  });

  it("refuse un jour illisible plutôt que de rendre « Invalid Date »", () => {
    expect(() => ajouterJours("11/09/2026", 1)).toThrow(/Jour invalide/);
  });
});
