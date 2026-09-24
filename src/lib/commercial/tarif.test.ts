import { describe, it, expect } from "vitest";
import {
  couvre,
  planifierChangement,
  prixADate,
  seChevauchent,
  TarifError,
  verifierCoherence,
  type PeriodePrix,
} from "@/lib/commercial/tarif";

const fcfa = (n: number) => n * 100;

/** Un article vendu 500, passé à 400 en mars, puis 450 en juillet. */
const HISTORIQUE: PeriodePrix[] = [
  { id: 1, valideDu: "2026-01-01", valideAu: "2026-02-28", prixHt: fcfa(500) },
  { id: 2, valideDu: "2026-03-01", valideAu: "2026-06-30", prixHt: fcfa(400) },
  { id: 3, valideDu: "2026-07-01", valideAu: null, prixHt: fcfa(450) },
];

describe("couverture d'une période", () => {
  it("inclut ses deux bornes", () => {
    const p = { valideDu: "2026-03-01", valideAu: "2026-06-30" };
    expect(couvre(p, "2026-03-01")).toBe(true);
    expect(couvre(p, "2026-06-30")).toBe(true);
    expect(couvre(p, "2026-02-28")).toBe(false);
    expect(couvre(p, "2026-07-01")).toBe(false);
  });

  it("une période ouverte court indéfiniment", () => {
    const p = { valideDu: "2026-07-01", valideAu: null };
    expect(couvre(p, "2026-07-01")).toBe(true);
    expect(couvre(p, "2099-01-01")).toBe(true);
    expect(couvre(p, "2026-06-30")).toBe(false);
  });
});

describe("prix en vigueur à une date", () => {
  it("rend le prix de la période qui couvre la date", () => {
    expect(prixADate(HISTORIQUE, "2026-01-15")?.prixHt).toBe(fcfa(500));
    expect(prixADate(HISTORIQUE, "2026-04-10")?.prixHt).toBe(fcfa(400));
    expect(prixADate(HISTORIQUE, "2026-12-31")?.prixHt).toBe(fcfa(450));
  });

  it("relit une vente passée au prix de l'époque", () => {
    // C'est ce que le système actuel ne sait pas faire : après un changement,
    // l'ancien prix est perdu et la marge d'alors n'est plus vérifiable.
    expect(prixADate(HISTORIQUE, "2026-02-20")?.prixHt).toBe(fcfa(500));
  });

  it("rend null hors de toute période, plutôt que de deviner", () => {
    expect(prixADate(HISTORIQUE, "2025-12-31")).toBeNull();
    expect(prixADate([], "2026-04-10")).toBeNull();
  });
});

describe("chevauchement", () => {
  it("détecte un recouvrement, fût-il d'un seul jour", () => {
    expect(seChevauchent({ valideDu: "2026-01-01", valideAu: "2026-03-01" }, { valideDu: "2026-03-01", valideAu: null })).toBe(true);
    expect(seChevauchent({ valideDu: "2026-01-01", valideAu: "2026-02-28" }, { valideDu: "2026-03-01", valideAu: null })).toBe(false);
  });

  it("deux périodes ouvertes se chevauchent toujours", () => {
    expect(seChevauchent({ valideDu: "2026-01-01", valideAu: null }, { valideDu: "2030-01-01", valideAu: null })).toBe(true);
  });

  it("accepte un historique cohérent et refuse un historique bancal", () => {
    expect(() => verifierCoherence(HISTORIQUE)).not.toThrow();
    const bancal = [...HISTORIQUE, { id: 4, valideDu: "2026-05-01", valideAu: null, prixHt: fcfa(999) }];
    expect(() => verifierCoherence(bancal)).toThrow(TarifError);
  });

  it("ne dépend pas de l'ordre des périodes fournies", () => {
    expect(() => verifierCoherence([...HISTORIQUE].reverse())).not.toThrow();
  });
});

describe("changement de prix", () => {
  it("clôt la période en cours la veille et en ouvre une nouvelle", () => {
    const c = planifierChangement(HISTORIQUE, "2026-09-01", fcfa(480));
    expect(c.aClore).toEqual([{ id: 3, valideAu: "2026-08-31" }]);
    expect(c.aOuvrir).toEqual({ valideDu: "2026-09-01", valideAu: null, prixHt: fcfa(480) });
  });

  it("le résultat reste cohérent une fois appliqué", () => {
    const c = planifierChangement(HISTORIQUE, "2026-09-01", fcfa(480));
    const apres: PeriodePrix[] = [
      ...HISTORIQUE.map((p) => {
        const clos = c.aClore.find((x) => x.id === p.id);
        return clos ? { ...p, valideAu: clos.valideAu } : p;
      }),
      { id: 99, ...c.aOuvrir },
    ];
    expect(() => verifierCoherence(apres)).not.toThrow();
    expect(prixADate(apres, "2026-08-31")?.prixHt).toBe(fcfa(450));
    expect(prixADate(apres, "2026-09-01")?.prixHt).toBe(fcfa(480));
  });

  it("s'intercale entre deux périodes sans en déborder", () => {
    const c = planifierChangement(HISTORIQUE, "2026-05-01", fcfa(420));
    expect(c.aClore).toEqual([{ id: 2, valideAu: "2026-04-30" }]);
    // La période 3 commence le 01/07 : la nouvelle s'arrête la veille.
    expect(c.aOuvrir.valideAu).toBe("2026-06-30");
  });

  it("gère le passage de mois et d'année", () => {
    expect(planifierChangement(HISTORIQUE, "2027-01-01", fcfa(500)).aClore).toEqual([{ id: 3, valideAu: "2026-12-31" }]);
    expect(planifierChangement([], "2026-03-01", fcfa(1)).aOuvrir.valideDu).toBe("2026-03-01");
  });

  it("ouvre la première période d'un article sans prix", () => {
    const c = planifierChangement([], "2026-01-01", fcfa(500));
    expect(c.aClore).toEqual([]);
    expect(c.aOuvrir).toEqual({ valideDu: "2026-01-01", valideAu: null, prixHt: fcfa(500) });
  });

  it("refuse un doublon de date et un prix négatif", () => {
    expect(() => planifierChangement(HISTORIQUE, "2026-03-01", fcfa(1))).toThrow(/commence déjà/);
    expect(() => planifierChangement(HISTORIQUE, "2026-09-01", -1)).toThrow(TarifError);
  });

  it("accepte la gratuité", () => {
    expect(planifierChangement([], "2026-01-01", 0).aOuvrir.prixHt).toBe(0);
  });
});
