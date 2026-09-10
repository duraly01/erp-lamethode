import { describe, it, expect } from "vitest";
import {
  IGS_BAREME_DEFAUT,
  IGS_CA_PLAFOND,
  classeForCa,
  classesACompleter,
  depasseSeuilIgs,
  echeanceTrimestre,
  echeancesAnnee,
  exigeDsf,
  IGS_CLASSE_MIN_DSF,
  isBaremeComplet,
  montantAnnuel,
  montantTrimestriel,
  periodeTrimestre,
  type IgsBareme,
} from "./igs";

/** Barème complet fictif, pour tester les cas nominaux sans dépendre des
 *  classes 5 à 10 que le cabinet doit encore renseigner. */
const BAREME_COMPLET: IgsBareme = [
  { classe: 1, caMin: 0, caMax: 500_000, montant: 0 },
  { classe: 2, caMin: 500_001, caMax: 1_000_000, montant: 20_000 },
  { classe: 3, caMin: 1_000_001, caMax: 2_000_000, montant: 40_000 },
  { classe: 4, caMin: 2_000_001, caMax: null, montant: 75_000 },
];

describe("classeForCa", () => {
  it("place un CA dans la bonne tranche", () => {
    expect(classeForCa(0, BAREME_COMPLET)?.classe).toBe(1);
    expect(classeForCa(500_000, BAREME_COMPLET)?.classe).toBe(1);
    expect(classeForCa(500_001, BAREME_COMPLET)?.classe).toBe(2);
    expect(classeForCa(1_000_000, BAREME_COMPLET)?.classe).toBe(2);
    expect(classeForCa(1_500_000, BAREME_COMPLET)?.classe).toBe(3);
  });

  it("range tout CA au-delà de la dernière borne dans la classe ouverte", () => {
    expect(classeForCa(9_999_999, BAREME_COMPLET)?.classe).toBe(4);
  });

  it("retourne null pour un CA absent ou négatif", () => {
    expect(classeForCa(null, BAREME_COMPLET)).toBeNull();
    expect(classeForCa(undefined, BAREME_COMPLET)).toBeNull();
    expect(classeForCa(-1, BAREME_COMPLET)).toBeNull();
  });

  it("ignore les classes non renseignées", () => {
    // Une classe laissée à zéro par le cabinet ne doit jamais capter un CA.
    const partiel: IgsBareme = [
      { classe: 1, caMin: 0, caMax: 500_000, montant: 0 },
      { classe: 2, caMin: 0, caMax: 0, montant: 0 },
    ];
    expect(classeForCa(10_000_000, partiel)).toBeNull();
  });
});

describe("barème officiel (CGI art. C40)", () => {
  it("couvre les 12 classes", () => {
    expect(IGS_BAREME_DEFAUT).toHaveLength(12);
    expect(isBaremeComplet(IGS_BAREME_DEFAUT)).toBe(true);
    expect(classesACompleter(IGS_BAREME_DEFAUT)).toEqual([]);
  });

  it("ne laisse aucun trou entre deux tranches consécutives", () => {
    for (let i = 1; i < IGS_BAREME_DEFAUT.length; i++) {
      const precedente = IGS_BAREME_DEFAUT[i - 1];
      const courante = IGS_BAREME_DEFAUT[i];
      expect(courante.caMin).toBe((precedente.caMax ?? 0) + 1);
    }
  });

  it("classe correctement les bornes du barème", () => {
    expect(classeForCa(0)?.classe).toBe(1);
    expect(classeForCa(500_000)?.classe).toBe(1); // borne comblée : exonéré
    expect(classeForCa(500_001)?.classe).toBe(2);
    expect(classeForCa(2_000_000)?.classe).toBe(3);
    expect(classeForCa(3_000_001)?.classe).toBe(5);
    expect(classeForCa(10_000_000)?.classe).toBe(7);
    expect(classeForCa(50_000_000)?.classe).toBe(12);
  });

  it("applique les montants officiels", () => {
    expect(montantAnnuel(1)).toBe(0);
    expect(montantAnnuel(2)).toBe(20_000);
    expect(montantAnnuel(5)).toBe(125_000);
    expect(montantAnnuel(8)).toBe(500_000);
    expect(montantAnnuel(12)).toBe(2_000_000);
  });

  it("exige une DSF à partir de la classe 8", () => {
    expect(exigeDsf(7)).toBe(false);
    expect(exigeDsf(8)).toBe(true);
    expect(exigeDsf(12)).toBe(true);
    expect(exigeDsf(null)).toBe(false);
    // La classe 8 démarre à 10 000 001 FCFA : c'est bien le seuil des 10 M.
    expect(classeForCa(10_000_001)?.classe).toBe(IGS_CLASSE_MIN_DSF);
  });

  it("s'arrête au seuil de sortie du régime", () => {
    // Au-delà de 50 000 000, plus aucune classe : passage obligatoire au Réel.
    expect(classeForCa(IGS_CA_PLAFOND + 1)).toBeNull();
    expect(depasseSeuilIgs(IGS_CA_PLAFOND + 1)).toBe(true);
  });
});

describe("montantAnnuel", () => {
  it("lit le montant du barème", () => {
    expect(montantAnnuel(3, BAREME_COMPLET)).toBe(40_000);
  });

  it("applique l'abattement CGA de 50 %", () => {
    expect(montantAnnuel(3, BAREME_COMPLET, true)).toBe(20_000);
  });

  it("retourne 0 pour une classe exonérée", () => {
    expect(montantAnnuel(1, BAREME_COMPLET)).toBe(0);
  });

  it("retourne null pour une classe inconnue ou à compléter", () => {
    expect(montantAnnuel(null, BAREME_COMPLET)).toBeNull();
    expect(montantAnnuel(99, BAREME_COMPLET)).toBeNull();
    expect(
      montantAnnuel(5, [
        ...BAREME_COMPLET,
        { classe: 5, caMin: 0, caMax: 0, montant: 0 },
      ]),
    ).toBeNull();
  });
});

describe("montantTrimestriel", () => {
  it("découpe le forfait annuel en quarts", () => {
    expect(montantTrimestriel(3, BAREME_COMPLET)).toBe(10_000);
    expect(montantTrimestriel(4, BAREME_COMPLET)).toBe(18_750);
  });

  it("arrondit au franc supérieur", () => {
    const bareme: IgsBareme = [
      { classe: 1, caMin: 0, caMax: null, montant: 10_001 },
    ];
    expect(montantTrimestriel(1, bareme)).toBe(2_501);
  });

  it("propage null quand le montant annuel est indéterminé", () => {
    expect(
      montantTrimestriel(5, [
        ...BAREME_COMPLET,
        { classe: 5, caMin: 0, caMax: 0, montant: 0 },
      ]),
    ).toBeNull();
  });

  it("découpe les forfaits officiels en quatre versements", () => {
    expect(montantTrimestriel(2)).toBe(5_000);
    expect(montantTrimestriel(4)).toBe(18_750);
    expect(montantTrimestriel(12)).toBe(500_000);
    expect(montantTrimestriel(12, IGS_BAREME_DEFAUT, true)).toBe(250_000);
  });
});

describe("depasseSeuilIgs", () => {
  it("détecte la sortie du régime IGS", () => {
    expect(depasseSeuilIgs(IGS_CA_PLAFOND)).toBe(false);
    expect(depasseSeuilIgs(IGS_CA_PLAFOND + 1)).toBe(true);
    expect(depasseSeuilIgs(null)).toBe(false);
  });
});

describe("complétude du barème", () => {
  it("signale les classes laissées à zéro", () => {
    const partiel: IgsBareme = [
      ...BAREME_COMPLET,
      { classe: 5, caMin: 0, caMax: 0, montant: 0 },
      { classe: 6, caMin: 0, caMax: 0, montant: 0 },
    ];
    expect(classesACompleter(partiel)).toEqual([5, 6]);
    expect(isBaremeComplet(partiel)).toBe(false);
  });

  it("reconnaît un barème entièrement renseigné", () => {
    expect(isBaremeComplet(BAREME_COMPLET)).toBe(true);
  });
});

describe("échéancier trimestriel", () => {
  it("applique les quatre échéances légales de l'année", () => {
    expect(echeanceTrimestre(2026, 1)).toBe("2026-03-15");
    expect(echeanceTrimestre(2026, 2)).toBe("2026-06-15");
    expect(echeanceTrimestre(2026, 3)).toBe("2026-09-15");
    expect(echeanceTrimestre(2026, 4)).toBe("2026-12-15");
  });

  it("refuse un trimestre hors bornes", () => {
    expect(() => echeanceTrimestre(2026, 0)).toThrow();
    expect(() => echeanceTrimestre(2026, 5)).toThrow();
  });

  it("nomme les périodes au format attendu par les déclarations", () => {
    expect(periodeTrimestre(2026, 1)).toBe("2026-T1");
    // La colonne `periode` accepte 7 caractères au maximum.
    expect(periodeTrimestre(2026, 1)).toHaveLength(7);
  });

  it("produit les quatre échéances d'une année", () => {
    const e = echeancesAnnee(2026);
    expect(e).toHaveLength(4);
    expect(e.map((x) => x.periode)).toEqual([
      "2026-T1",
      "2026-T2",
      "2026-T3",
      "2026-T4",
    ]);
  });
});
