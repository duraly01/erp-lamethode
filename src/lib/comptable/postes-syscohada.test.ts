import { describe, it, expect } from "vitest";
import { PLAN_SYSCOHADA } from "@/lib/comptable/plan-syscohada";
import {
  POSTES_BILAN_ACTIF,
  POSTES_BILAN_PASSIF,
  POSTES_RESULTAT,
  POSTES_PAR_CODE,
  RATTACHEMENTS,
  RATTACHEMENTS_A_CONFIRMER,
  posteDuCompte,
  rattachementDuCompte,
} from "@/lib/comptable/postes-syscohada";

const DEBITEUR = 1_000_00;
const CREDITEUR = -1_000_00;

describe("rattachement des comptes aux postes", () => {
  it("chaque compte du plan de référence trouve un poste", () => {
    const orphelins = PLAN_SYSCOHADA.filter(
      (c) => rattachementDuCompte(c.numero) === null,
    ).map((c) => `${c.numero} ${c.libelle}`);

    // Un compte sans poste disparaîtrait des états sans rien signaler : le
    // bilan resterait équilibré et le total serait faux.
    expect(orphelins).toEqual([]);
  });

  it("chaque poste désigné par un rattachement existe", () => {
    const codes = new Set(POSTES_PAR_CODE.keys());
    const inconnus: string[] = [];

    for (const [prefixe, r] of Object.entries(RATTACHEMENTS)) {
      const vises = "poste" in r ? [r.poste] : [r.debiteur, r.crediteur];
      for (const code of vises) {
        if (!codes.has(code)) inconnus.push(`${prefixe} → ${code}`);
      }
    }

    expect(inconnus).toEqual([]);
  });

  it("le préfixe le plus long l'emporte", () => {
    // 40 → fournisseurs (passif), mais 4091 est une avance versée (actif).
    expect(posteDuCompte("401", CREDITEUR)).toBe("DJ");
    expect(posteDuCompte("4091", DEBITEUR)).toBe("BH");
    // 41 → clients, 4191 → avances reçues.
    expect(posteDuCompte("4111", DEBITEUR)).toBe("BI");
    expect(posteDuCompte("4191", CREDITEUR)).toBe("DI");
    // 24 → matériel et mobilier, 245 → matériel de transport.
    expect(posteDuCompte("244", DEBITEUR)).toBe("AM");
    expect(posteDuCompte("245", DEBITEUR)).toBe("AN");
  });

  it("les comptes à double sens suivent leur solde", () => {
    expect(posteDuCompte("462", DEBITEUR)).toBe("BJ");
    expect(posteDuCompte("462", CREDITEUR)).toBe("DM");
    expect(posteDuCompte("471", DEBITEUR)).toBe("BJ");
    expect(posteDuCompte("471", CREDITEUR)).toBe("DM");
    expect(posteDuCompte("449", DEBITEUR)).toBe("BJ");
    expect(posteDuCompte("449", CREDITEUR)).toBe("DK");
  });

  it("un solde nul se présente du côté débiteur", () => {
    // Choix arbitraire mais qui doit être stable : un poste à zéro ne change
    // aucun total, mais il ne doit pas sauter d'un côté à l'autre d'un calcul
    // à l'autre.
    expect(posteDuCompte("462", 0)).toBe("BJ");
  });

  it("les amortissements se rattachent au poste du bien qu'ils amortissent", () => {
    expect(rattachementDuCompte("2845")).toEqual({
      poste: "AN",
      role: "AMORTISSEMENT",
    });
    expect(rattachementDuCompte("2813")).toEqual({
      poste: "AK",
      role: "AMORTISSEMENT",
    });
    expect(rattachementDuCompte("491")).toEqual({
      poste: "BI",
      role: "AMORTISSEMENT",
    });
    expect(rattachementDuCompte("391")).toEqual({
      poste: "BB",
      role: "AMORTISSEMENT",
    });
  });

  it("un compte inconnu du plan est signalé, pas rattaché au hasard", () => {
    expect(rattachementDuCompte("999")).toBeNull();
    expect(posteDuCompte("999", DEBITEUR)).toBeNull();
  });
});

describe("structure des postes", () => {
  const tous = [
    ...POSTES_BILAN_ACTIF,
    ...POSTES_BILAN_PASSIF,
    ...POSTES_RESULTAT,
  ];

  it("les codes de postes sont uniques", () => {
    const vus = new Set<string>();
    const doublons: string[] = [];
    for (const p of tous) {
      if (vus.has(p.code)) doublons.push(p.code);
      vus.add(p.code);
    }
    expect(doublons).toEqual([]);
  });

  it("tout poste cité dans un total ou une composition existe", () => {
    const codes = new Set(tous.map((p) => p.code));
    const manquants: string[] = [];

    for (const p of POSTES_BILAN_ACTIF.concat(POSTES_BILAN_PASSIF)) {
      for (const c of p.total ?? []) {
        if (!codes.has(c)) manquants.push(`${p.code} → ${c}`);
      }
    }
    for (const p of POSTES_RESULTAT) {
      const { plus = [], moins = [] } = p.composition ?? {};
      for (const c of [...plus, ...moins]) {
        if (!codes.has(c)) manquants.push(`${p.code} → ${c}`);
      }
    }

    expect(manquants).toEqual([]);
  });

  it("un poste porte soit des comptes, soit un total, jamais les deux", () => {
    const confus = tous
      .filter((p) => {
        const estTotal =
          ("total" in p && p.total) || ("composition" in p && p.composition);
        const porteDesComptes = Object.values(RATTACHEMENTS).some((r) =>
          "poste" in r ? r.poste === p.code : r.debiteur === p.code || r.crediteur === p.code,
        );
        return estTotal && porteDesComptes;
      })
      .map((p) => p.code);

    expect(confus).toEqual([]);
  });

  it("un solde intermédiaire ne cite que des postes déjà déclarés", () => {
    // Le compte de résultat se calcule en une passe, dans l'ordre de la liste :
    // une référence en avant donnerait zéro sans rien signaler. Le bilan, lui,
    // résout ses dépendances — mais l'ordre reste celui de la présentation, et
    // cette contrainte doit être tenue par un test plutôt que par l'attention.
    const vus = new Set<string>();
    const enAvant: string[] = [];

    for (const p of POSTES_RESULTAT) {
      const { plus = [], moins = [] } = p.composition ?? {};
      for (const c of [...plus, ...moins]) {
        if (!vus.has(c)) enAvant.push(`${p.code} → ${c}`);
      }
      vus.add(p.code);
    }

    expect(enAvant).toEqual([]);
  });

  it("aucun total ne se référence lui-même, directement ou en cascade", () => {
    const dependances = new Map<string, string[]>();
    for (const p of POSTES_BILAN_ACTIF.concat(POSTES_BILAN_PASSIF)) {
      if (p.total) dependances.set(p.code, p.total);
    }
    for (const p of POSTES_RESULTAT) {
      if (p.composition) {
        dependances.set(p.code, [...p.composition.plus, ...p.composition.moins]);
      }
    }

    const enCours = new Set<string>();
    const faits = new Set<string>();
    const cycles: string[] = [];

    function visiter(code: string, chemin: string[]) {
      if (faits.has(code)) return;
      if (enCours.has(code)) {
        cycles.push([...chemin, code].join(" → "));
        return;
      }
      enCours.add(code);
      for (const suivant of dependances.get(code) ?? []) {
        visiter(suivant, [...chemin, code]);
      }
      enCours.delete(code);
      faits.add(code);
    }

    for (const code of dependances.keys()) visiter(code, []);
    expect(cycles).toEqual([]);
  });
});

describe("rattachements à confirmer", () => {
  it("décrivent des règles réellement en vigueur", () => {
    // Sans cela la liste dériverait : on signalerait une incertitude sur un
    // rattachement qui a été changé depuis, ou l'inverse.
    for (const { prefixe, poste } of RATTACHEMENTS_A_CONFIRMER) {
      const r = RATTACHEMENTS[prefixe];
      expect(r, `préfixe ${prefixe} absent des rattachements`).toBeDefined();
      expect("poste" in r && r.poste).toBe(poste);
    }
  });

  it("portent chacun un motif explicite", () => {
    for (const r of RATTACHEMENTS_A_CONFIRMER) {
      expect(r.motif.length).toBeGreaterThan(30);
    }
  });
});
