import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  isEnRetard,
  defaultEcheanceMensuelle,
  defaultEcheanceAnnuelle,
  echeanceAnnuelle,
  obligationsPourRegime,
} from "@/lib/constants";

describe("obligations par régime", () => {
  it("le Réel garde ses déclarations classiques", () => {
    const o = obligationsPourRegime("REEL");
    expect(o.annuelles).toEqual(["DSF", "BEF", "PATENTE"]);
    expect(o.mensuelles).toEqual(["TVA", "IRPP", "ACOMPTE_IS", "CNPS"]);
    expect(o.trimestrielles).toEqual([]);
  });

  it("l'IGS est libératoire : aucune obligation mensuelle", () => {
    const o = obligationsPourRegime("IGS", 3);
    expect(o.mensuelles).toEqual([]);
    expect(o.trimestrielles).toEqual(["IGS"]);
    expect(o.annuelles).toEqual(["IGS_ANNUELLE"]);
  });

  it("l'IGS ajoute la DSF à partir de la classe 8", () => {
    expect(obligationsPourRegime("IGS", 7).annuelles).toEqual(["IGS_ANNUELLE"]);
    expect(obligationsPourRegime("IGS", 8).annuelles).toEqual([
      "IGS_ANNUELLE",
      "DSF",
    ]);
  });

  it("une classe non renseignée n'entraîne pas de DSF", () => {
    expect(obligationsPourRegime("IGS", null).annuelles).toEqual([
      "IGS_ANNUELLE",
    ]);
  });
});

describe("echeanceAnnuelle", () => {
  it("DSF au Réel : 15 mars N+1", () => {
    expect(echeanceAnnuelle("DSF", 2026, "REEL")).toBe("2027-03-15");
  });

  it("déclaration annuelle IGS : 15 avril N+1", () => {
    expect(echeanceAnnuelle("IGS_ANNUELLE", 2026, "IGS")).toBe("2027-04-15");
  });

  it("DSF d'un dossier IGS : 15 mai N+1", () => {
    expect(echeanceAnnuelle("DSF", 2026, "IGS")).toBe("2027-05-15");
  });

  it("les autres obligations annuelles restent au 15 mars", () => {
    expect(echeanceAnnuelle("PATENTE", 2026, "REEL")).toBe("2027-03-15");
    expect(echeanceAnnuelle("BEF", 2026, "REEL")).toBe("2027-03-15");
  });
});

describe("échéances légales", () => {
  it("mensuelle : 15 du mois suivant la période", () => {
    expect(defaultEcheanceMensuelle(2026, 1)).toBe("2026-02-15"); // janvier -> 15 fév
    expect(defaultEcheanceMensuelle(2026, 6)).toBe("2026-07-15"); // juin -> 15 juil
  });

  it("mensuelle : décembre bascule sur janvier N+1", () => {
    expect(defaultEcheanceMensuelle(2026, 12)).toBe("2027-01-15");
  });

  it("annuelle : 15 mars de l'année suivante (DSF Cameroun)", () => {
    expect(defaultEcheanceAnnuelle(2026)).toBe("2027-03-15");
  });
});

describe("isEnRetard", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T10:00:00Z"));
  });
  afterAll(() => vi.useRealTimers());

  it("échéance passée + A_FAIRE → en retard", () => {
    expect(isEnRetard("2026-06-15", "A_FAIRE")).toBe(true);
  });

  it("échéance future + A_FAIRE → pas en retard", () => {
    expect(isEnRetard("2026-12-15", "A_FAIRE")).toBe(false);
  });

  it("échéance du jour → pas en retard", () => {
    expect(isEnRetard("2026-07-22", "A_FAIRE")).toBe(false);
  });

  it("déjà traitée (payée / déposée / exonérée) → jamais en retard", () => {
    expect(isEnRetard("2020-01-01", "PAYEE")).toBe(false);
    expect(isEnRetard("2020-01-01", "DEPOSEE")).toBe(false);
    expect(isEnRetard("2020-01-01", "EXONERE")).toBe(false);
  });
});

describe("isEnRetard — le jour se juge à l'heure de Douala", () => {
  afterAll(() => vi.useRealTimers());

  it("à 23 h 30 UTC on est déjà le lendemain : l'échéance de la veille est dépassée", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T23:30:00Z")); // 00 h 30 le 23 à Douala
    expect(isEnRetard("2026-07-22", "A_FAIRE")).toBe(true);
    expect(isEnRetard("2026-07-23", "A_FAIRE")).toBe(false);
  });
});
