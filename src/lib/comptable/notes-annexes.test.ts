import { describe, it, expect } from "vitest";
import { calculerBalance, type LigneBalance } from "@/lib/comptable/balance";
import { calculerEtatsFinanciers } from "@/lib/comptable/etats-financiers";
import {
  POSTES_BILAN_ACTIF,
  POSTES_BILAN_PASSIF,
  POSTES_RESULTAT,
} from "@/lib/comptable/postes-syscohada";
import {
  calculerNotesAnnexes,
  NOTES,
  NOTES_A_REDIGER,
  type Note,
} from "@/lib/comptable/notes-annexes";

const fcfa = (n: number) => n * 100;

type Ligne = { numero: string; libelle?: string; debit?: number; credit?: number };

function balance(ecritures: Ligne[][]): LigneBalance[] {
  const ids = new Map<string, number>();
  return calculerBalance(
    ecritures.flat().map((l) => {
      if (!ids.has(l.numero)) ids.set(l.numero, ids.size + 1);
      return {
        compteId: ids.get(l.numero)!,
        compteNumero: l.numero,
        compteLibelle: l.libelle ?? l.numero,
        debit: l.debit ?? 0,
        credit: l.credit ?? 0,
      };
    }),
  );
}

function note(notes: Note[], code: string) {
  const n = notes.find((x) => x.definition.code === code);
  if (!n) throw new Error(`Note ${code} absente.`);
  return n;
}

// ---------------------------------------------------------------------------

const OUVERTURE_ECRITURES: Ligne[][] = [
  [
    { numero: "5211", libelle: "Banque", debit: 1_500_000 },
    { numero: "2444", libelle: "Matériel informatique", debit: 2_000_000 },
    { numero: "2844", libelle: "Amort. matériel de bureau", credit: 400_000 },
    { numero: "311", libelle: "Marchandises", debit: 300_000 },
    { numero: "401", libelle: "Fournisseurs", credit: 200_000 },
    { numero: "162", libelle: "Emprunts bancaires", credit: 1_000_000 },
    { numero: "101", libelle: "Capital", credit: 2_200_000 },
  ],
];

const MOUVEMENTS_ECRITURES: Ligne[][] = [
  [{ numero: "5211", debit: 4_000_000 }, { numero: "701", libelle: "Ventes", credit: 4_000_000 }],
  [{ numero: "601", libelle: "Achats", debit: 1_500_000 }, { numero: "401", credit: 1_500_000 }],
  [{ numero: "401", debit: 1_200_000 }, { numero: "5211", credit: 1_200_000 }],
  [{ numero: "245", libelle: "Véhicule", debit: 3_000_000 }, { numero: "5211", credit: 3_000_000 }],
  [{ numero: "6813", libelle: "Dotations", debit: 700_000 }, { numero: "2844", credit: 300_000 }, { numero: "2845", libelle: "Amort. transport", credit: 400_000 }],
  [{ numero: "162", debit: 250_000 }, { numero: "5211", credit: 250_000 }],
  [{ numero: "5211", debit: 500_000 }, { numero: "162", credit: 500_000 }],
  // Un compte qui bouge et revient à zéro : une avance versée puis imputée.
  [{ numero: "4091", libelle: "Avances fournisseurs", debit: 100_000 }, { numero: "5211", credit: 100_000 }],
  [{ numero: "401", debit: 100_000 }, { numero: "4091", credit: 100_000 }],
];

const OUVERTURE = balance(OUVERTURE_ECRITURES);
const MOUVEMENTS = balance(MOUVEMENTS_ECRITURES);
const { notes } = calculerNotesAnnexes(OUVERTURE, MOUVEMENTS);

describe("note des immobilisations brutes (3A)", () => {
  const n = note(notes, "IMMO_BRUT");
  if (n.forme !== "MOUVEMENTS") throw new Error();

  it("montre le départ, les acquisitions et l'arrivée", () => {
    const vehicule = n.lignes.find((l) => l.compteNumero === "245")!;
    expect(vehicule.debut).toBe(0);
    expect(vehicule.augmentations).toBe(fcfa(3_000_000));
    expect(vehicule.fin).toBe(fcfa(3_000_000));

    const materiel = n.lignes.find((l) => l.compteNumero === "2444")!;
    expect(materiel.debut).toBe(fcfa(2_000_000));
    expect(materiel.augmentations).toBe(0);
    expect(materiel.fin).toBe(fcfa(2_000_000));
  });

  it("n'y mêle pas les amortissements", () => {
    expect(n.lignes.map((l) => l.compteNumero)).toEqual(["2444", "245"]);
  });

  it("totalise", () => {
    expect(n.total.debut).toBe(fcfa(2_000_000));
    expect(n.total.augmentations).toBe(fcfa(3_000_000));
    expect(n.total.fin).toBe(fcfa(5_000_000));
  });
});

describe("note des amortissements (3C)", () => {
  const n = note(notes, "IMMO_AMORT");
  if (n.forme !== "MOUVEMENTS") throw new Error();

  it("présente les amortissements en positif, croissant au crédit", () => {
    const bureau = n.lignes.find((l) => l.compteNumero === "2844")!;
    expect(bureau.debut).toBe(fcfa(400_000));
    expect(bureau.augmentations).toBe(fcfa(300_000));
    expect(bureau.fin).toBe(fcfa(700_000));
    expect(n.total.fin).toBe(fcfa(1_100_000));
  });
});

describe("note des dettes financières (16A)", () => {
  const n = note(notes, "DETTES_FINANCIERES");
  if (n.forme !== "MOUVEMENTS") throw new Error();

  it("distingue emprunts contractés et remboursements", () => {
    const emprunt = n.lignes.find((l) => l.compteNumero === "162")!;
    expect(emprunt.debut).toBe(fcfa(1_000_000));
    expect(emprunt.augmentations).toBe(fcfa(500_000));
    expect(emprunt.diminutions).toBe(fcfa(250_000));
    expect(emprunt.fin).toBe(fcfa(1_250_000));
  });
});

describe("notes de soldes", () => {
  it("présentent les dettes en positif", () => {
    const n = note(notes, "FOURNISSEURS");
    if (n.forme !== "SOLDES") throw new Error();
    const f = n.lignes.find((l) => l.compteNumero === "401")!;
    expect(f.debut).toBe(fcfa(200_000));
    expect(f.fin).toBe(fcfa(400_000)); // 200 000 + 1 500 000 − 1 200 000 − 100 000
    expect(f.variation).toBe(fcfa(200_000));
  });

  it("présentent la trésorerie", () => {
    const n = note(notes, "TRESORERIE_ACTIF");
    if (n.forme !== "SOLDES") throw new Error();
    expect(n.total.fin).toBe(fcfa(1_450_000));
  });

  it("ne présentent une banque que du côté où son solde la place", () => {
    // Une banque créditrice est un découvert : elle figure en trésorerie-passif,
    // et nulle part ailleurs — pas des deux côtés à la fois.
    const { notes: n2 } = calculerNotesAnnexes(
      [],
      balance([[{ numero: "5211", libelle: "Banque", credit: 250_000 }, { numero: "601", debit: 250_000 }]]),
    );
    const actif = note(n2, "TRESORERIE_ACTIF");
    const passif = note(n2, "TRESORERIE_PASSIF");
    if (actif.forme !== "SOLDES" || passif.forme !== "SOLDES") throw new Error();
    expect(actif.lignes).toEqual([]);
    expect(passif.lignes.map((l) => [l.compteNumero, l.fin])).toEqual([["5211", fcfa(250_000)]]);
  });

  it("omettent un compte revenu à zéro qui n'a jamais rien porté au bilan", () => {
    // 4091 a bougé dans l'année mais ne figure ni à l'ouverture ni à la
    // clôture : une note de soldes n'a rien à en dire.
    const n = note(notes, "AUTRES_CREANCES");
    if (n.forme !== "SOLDES") throw new Error();
    expect(n.lignes.find((l) => l.compteNumero === "4091")).toBeUndefined();
  });
});

describe("notes du compte de résultat", () => {
  it("présentent produits et charges en positif, chacun dans sa note", () => {
    const ca = note(notes, "CHIFFRE_AFFAIRES");
    if (ca.forme !== "CHARGES_PRODUITS") throw new Error();
    expect(ca.lignes).toEqual([{ compteNumero: "701", compteLibelle: "Ventes", montant: fcfa(4_000_000) }]);
    expect(ca.total).toBe(fcfa(4_000_000));

    const achats = note(notes, "ACHATS");
    if (achats.forme !== "CHARGES_PRODUITS") throw new Error();
    expect(achats.total).toBe(fcfa(1_500_000));

    const dot = note(notes, "DOTATIONS");
    if (dot.forme !== "CHARGES_PRODUITS") throw new Error();
    expect(dot.total).toBe(fcfa(700_000));
  });
});

// ---------------------------------------------------------------------------
// Cohérence avec les états
// ---------------------------------------------------------------------------

describe("cohérence des notes avec le bilan", () => {
  const cloture = balance([...OUVERTURE_ECRITURES, ...MOUVEMENTS_ECRITURES]);
  const { bilan, resultat } = calculerEtatsFinanciers(cloture);
  const poste = (s: { code: string; net: number; brut: number; amortissements: number }[], c: string) =>
    s.find((l) => l.code === c)!;

  it("les immobilisations brutes retrouvent la colonne brut du bilan", () => {
    const n = note(notes, "IMMO_BRUT");
    if (n.forme !== "MOUVEMENTS") throw new Error();
    expect(n.total.fin).toBe(poste(bilan.actif, "AZ").brut);
  });

  it("les amortissements retrouvent la colonne du bilan", () => {
    const n = note(notes, "IMMO_AMORT");
    if (n.forme !== "MOUVEMENTS") throw new Error();
    expect(n.total.fin).toBe(poste(bilan.actif, "AZ").amortissements);
  });

  it("les dettes financières retrouvent le passif", () => {
    const n = note(notes, "DETTES_FINANCIERES");
    if (n.forme !== "MOUVEMENTS") throw new Error();
    expect(n.total.fin).toBe(poste(bilan.passif, "DD").net);
  });

  it("le chiffre d'affaires retrouve le compte de résultat", () => {
    const n = note(notes, "CHIFFRE_AFFAIRES");
    if (n.forme !== "CHARGES_PRODUITS") throw new Error();
    // Cette note couvre aussi TE à TI, nuls ici : le total est le XB.
    expect(n.total).toBe(resultat.lignes.find((l) => l.code === "XB")!.montant);
  });
});

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe("couverture des postes par les notes", () => {
  it("chaque poste de détail est repris par une note et une seule", () => {
    const feuilles = [
      ...POSTES_BILAN_ACTIF.filter((p) => !p.total),
      ...POSTES_BILAN_PASSIF.filter((p) => !p.total),
      ...POSTES_RESULTAT.filter((p) => !p.composition),
    ].map((p) => p.code);

    // Le résultat de l'exercice est le compte de résultat lui-même, pas une
    // note ; c'est la seule exception attendue.
    const sansNote = ["CJ"];

    const couverture = new Map<string, number>();
    for (const n of NOTES) for (const p of n.postes) couverture.set(p, (couverture.get(p) ?? 0) + 1);

    const manquants = feuilles.filter((p) => !sansNote.includes(p) && !couverture.has(p));
    const doublons = feuilles.filter((p) => (couverture.get(p) ?? 0) > 1);
    // Les immobilisations sont détaillées deux fois — brut et amortissements —
    // et c'est voulu : ce sont deux tableaux distincts du même poste.
    const immobilisations = ["AE", "AF", "AG", "AJ", "AK", "AL", "AM", "AN", "AR", "AS"];

    expect(manquants).toEqual([]);
    expect(doublons.filter((p) => !immobilisations.includes(p))).toEqual([]);
  });

  it("chaque note cite des postes qui existent", () => {
    const codes = new Set([
      ...POSTES_BILAN_ACTIF.map((p) => p.code),
      ...POSTES_BILAN_PASSIF.map((p) => p.code),
      ...POSTES_RESULTAT.map((p) => p.code),
    ]);
    const inconnus = NOTES.flatMap((n) => n.postes.filter((p) => !codes.has(p)).map((p) => `${n.code} → ${p}`));
    expect(inconnus).toEqual([]);
  });

  it("une note de mouvements sait dans quel sens ses comptes grossissent", () => {
    for (const n of NOTES) {
      if (n.forme === "MOUVEMENTS") expect(n.sensCroissance).toBeDefined();
    }
  });

  it("les notes à rédiger ne recouvrent aucune note calculée", () => {
    const calculees = new Set(NOTES.map((n) => n.numero));
    for (const n of NOTES_A_REDIGER) expect(calculees.has(n.numero)).toBe(false);
  });
});
