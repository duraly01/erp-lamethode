import { describe, it, expect } from "vitest";
import { totauxEcriture } from "@/lib/comptable/ecriture";
import { calculerBalance } from "@/lib/comptable/balance";
import { calculerEtatsFinanciers } from "@/lib/comptable/etats-financiers";
import { parseMontant } from "@/lib/comptable/money";
import {
  genererANouveaux,
  ClotureImpossibleError,
  type LigneAReprendre,
} from "@/lib/comptable/cloture";

const fcfa = (n: number) => n * 100;

const COMPTES = {
  101: { id: 101, numero: "101" },
  131: { id: 131, numero: "131" },
  139: { id: 139, numero: "139" },
  2444: { id: 2444, numero: "2444" },
  2844: { id: 2844, numero: "2844" },
  401: { id: 401, numero: "401", lettrable: true },
  411: { id: 411, numero: "411", lettrable: true },
  // Comme dans le plan livré : une banque est lettrable *et* rapprochable.
  5211: { id: 5211, numero: "5211", rapprochable: true, lettrable: true },
  601: { id: 601, numero: "601" },
  701: { id: 701, numero: "701" },
  6813: { id: 6813, numero: "6813" },
} as const;

let compteur = 0;
function l(
  compte: keyof typeof COMPTES,
  p: { debit?: number; credit?: number; tiersId?: number; lettrage?: string; pointee?: boolean; libelle?: string; echeance?: string },
): LigneAReprendre {
  const c = COMPTES[compte] as { id: number; numero: string; lettrable?: boolean; rapprochable?: boolean };
  compteur += 1;
  return {
    ligneId: compteur,
    compteId: c.id,
    compteNumero: c.numero,
    lettrable: !!c.lettrable,
    rapprochable: !!c.rapprochable,
    tiersId: p.tiersId ?? null,
    libelle: p.libelle ?? null,
    dateEcheance: p.echeance ?? null,
    debit: fcfa(p.debit ?? 0),
    credit: fcfa(p.credit ?? 0),
    lettrage: p.lettrage ?? null,
    pointee: p.pointee ?? false,
  };
}

const RESULTAT = { beneficeId: 131, perteId: 139 };

/** Un exercice : capital, matériel amorti, ventes dont une non réglée, achats, banque partiellement pointée. */
const EXERCICE: LigneAReprendre[] = [
  l(5211, { debit: 5_000_000, pointee: true, libelle: "Apport" }),
  l(101, { credit: 5_000_000 }),
  l(2444, { debit: 2_000_000 }),
  l(5211, { credit: 2_000_000, pointee: true, libelle: "Achat matériel" }),
  l(6813, { debit: 400_000 }),
  l(2844, { credit: 400_000 }),
  // Vente réglée : lettrée sous A.
  l(411, { debit: 1_200_000, tiersId: 1, lettrage: "A", libelle: "Facture V-1" }),
  l(701, { credit: 1_200_000 }),
  l(5211, { debit: 1_200_000, pointee: true, libelle: "Encaissement V-1" }),
  l(411, { credit: 1_200_000, tiersId: 1, lettrage: "A", libelle: "Encaissement V-1" }),
  // Vente non réglée, échéance en janvier.
  l(411, { debit: 800_000, tiersId: 2, libelle: "Facture V-2", echeance: "2027-01-15" }),
  l(701, { credit: 800_000 }),
  // Achat non réglé.
  l(601, { debit: 300_000 }),
  l(401, { credit: 300_000, tiersId: 9, libelle: "Facture AF-7" }),
  // Chèque émis fin décembre, pas encore débité par la banque.
  l(401, { debit: 100_000, tiersId: 9, libelle: "Chèque 41" }),
  l(5211, { credit: 100_000, libelle: "Chèque 41" }),
];

describe("génération des à-nouveaux", () => {
  const an = genererANouveaux(EXERCICE, RESULTAT);
  const parCompte = (id: number) => an.lignes.filter((x) => x.compteId === id);

  it("est équilibrée", () => {
    expect(an.totalDebit).toBe(an.totalCredit);
    expect(totauxEcriture(an.lignes).equilibree).toBe(true);
  });

  it("reprend le résultat au 131 : ventes 2 000 000 − achats 300 000 − dotation 400 000", () => {
    expect(an.resultatNet).toBe(fcfa(1_300_000));
    expect(parCompte(131)).toEqual([
      expect.objectContaining({ credit: "1300000.00" }),
    ]);
    expect(parCompte(139)).toEqual([]);
  });

  it("ne reprend aucun compte de gestion", () => {
    expect(parCompte(601)).toEqual([]);
    expect(parCompte(701)).toEqual([]);
    expect(parCompte(6813)).toEqual([]);
  });

  it("reprend les comptes ordinaires en un solde net", () => {
    expect(parCompte(101)).toEqual([expect.objectContaining({ credit: "5000000.00" })]);
    expect(parCompte(2444)).toEqual([expect.objectContaining({ debit: "2000000.00" })]);
    expect(parCompte(2844)).toEqual([expect.objectContaining({ credit: "400000.00" })]);
  });

  it("reprend un compte lettrable ligne à ligne, sans les lignes lettrées", () => {
    // La vente réglée (groupe A) ne pèse rien ; seule V-2 reste due.
    const clients = parCompte(411);
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({
      debit: "800000.00",
      tiersId: 2,
      dateEcheance: "2027-01-15",
      libelle: "Reprise à nouveau — Facture V-2",
    });
  });

  it("reprend les deux postes ouverts d'un fournisseur, sans les compenser", () => {
    // Facture non réglée et chèque émis : deux lignes, pour que chacune se
    // lettre avec ce qui la soldera.
    const fournisseurs = parCompte(401);
    expect(fournisseurs.map((x) => [x.debit, x.credit, x.tiersId])).toEqual([
      [undefined, "300000.00", 9],
      ["100000.00", undefined, 9],
    ]);
  });

  it("reprend la banque : les lignes non pointées une à une, les pointées en un solde", () => {
    const banque = parCompte(5211);
    expect(banque).toHaveLength(2);
    // 5 000 000 − 2 000 000 + 1 200 000 pointés = 4 200 000.
    expect(banque.find((x) => x.libelle?.includes("solde rapproché"))).toMatchObject({ debit: "4200000.00" });
    expect(banque.find((x) => x.libelle?.includes("Chèque 41"))).toMatchObject({ credit: "100000.00" });
  });

  it("sur une banque à la fois lettrable et rapprochable, le pointage prime", () => {
    // C'est le cas du plan livré. Traitée comme un compte lettrable, la banque
    // aurait repris chacune de ses lignes non lettrées — donc toutes — et le
    // solde rapproché n'aurait jamais existé. Le défaut a été vu sur un vrai
    // dossier : huit lignes reprises au lieu d'un solde et deux suspens.
    const banque = parCompte(5211);
    expect(banque.filter((x) => x.libelle?.includes("solde rapproché"))).toHaveLength(1);
  });

  it("compte les lignes reprises en détail", () => {
    // V-2, AF-7, chèque 41 côté 401, chèque 41 côté banque.
    expect(an.lignesDetaillees).toBe(4);
  });

  it("nomme chaque ligne comme une reprise", () => {
    for (const x of an.lignes) expect(x.libelle).toMatch(/^Reprise à nouveau/);
  });
});

describe("cohérence avec le bilan de clôture", () => {
  it("le bilan d'ouverture reconstruit des à-nouveaux est celui de la clôture", () => {
    const an = genererANouveaux(EXERCICE, RESULTAT);

    const mouvementsAN = an.lignes.map((x, i) => ({
      compteId: x.compteId,
      compteNumero: String(x.compteId),
      compteLibelle: "",
      debit: x.debit ?? 0,
      credit: x.credit ?? 0,
      _i: i,
    }));
    const mouvementsClos = EXERCICE.map((x) => ({
      compteId: x.compteId,
      compteNumero: x.compteNumero,
      compteLibelle: "",
      debit: x.debit / 100,
      credit: x.credit / 100,
    }));

    const cloture = calculerEtatsFinanciers(calculerBalance(mouvementsClos));
    const ouverture = calculerEtatsFinanciers(calculerBalance(mouvementsAN));

    // Même total de bilan, et le résultat de N est devenu un poste de bilan en N+1.
    expect(ouverture.bilan.totalActif).toBe(cloture.bilan.totalActif);
    expect(ouverture.bilan.equilibre).toBe(true);
    expect(ouverture.resultat.resultatNet).toBe(0);
    const cj = (b: typeof cloture.bilan) => b.passif.find((p) => p.code === "CJ")!.net;
    expect(cj(ouverture.bilan)).toBe(cj(cloture.bilan));
  });
});

describe("cas limites", () => {
  it("une perte va au débit du 139", () => {
    const an = genererANouveaux(
      [l(5211, { debit: 100_000 }), l(101, { credit: 500_000 }), l(601, { debit: 400_000 })],
      RESULTAT,
    );
    expect(an.resultatNet).toBe(fcfa(-400_000));
    expect(an.lignes.find((x) => x.compteId === 139)).toMatchObject({ debit: "400000.00" });
    expect(an.lignes.find((x) => x.compteId === 131)).toBeUndefined();
    expect(totauxEcriture(an.lignes).equilibree).toBe(true);
  });

  it("un résultat nul ne crée pas de ligne", () => {
    const an = genererANouveaux([l(5211, { debit: 100_000 }), l(101, { credit: 100_000 })], RESULTAT);
    expect(an.resultatNet).toBe(0);
    expect(an.lignes.some((x) => x.compteId === 131 || x.compteId === 139)).toBe(false);
  });

  it("un compte ordinaire soldé ne produit aucune ligne", () => {
    const an = genererANouveaux(
      [l(2444, { debit: 100_000 }), l(2444, { credit: 100_000 }), l(101, { credit: 0 })],
      RESULTAT,
    );
    expect(an.lignes).toEqual([]);
  });

  it("un compte de banque soldé reprend quand même ses lignes non pointées", () => {
    // Deux mouvements qui se compensent dans les livres, mais que la banque
    // n'a pas encore vus : chacun reste à retrouver sur un relevé.
    const an = genererANouveaux([l(5211, { debit: 100_000 }), l(5211, { credit: 100_000 })], RESULTAT);
    expect(an.lignes).toHaveLength(2);
    expect(totauxEcriture(an.lignes).equilibree).toBe(true);
  });

  it("refuse une balance déséquilibrée plutôt que de propager l'écart", () => {
    expect(() => genererANouveaux([l(5211, { debit: 100_000 })], RESULTAT)).toThrow(ClotureImpossibleError);
  });

  it("des montants exacts au centime, sans flottant", () => {
    const an = genererANouveaux(
      [l(5211, { debit: 0.01 }), l(101, { credit: 0.01 })].map((x) => ({ ...x })),
      RESULTAT,
    );
    // fcfa(0.01) = 1 centime exactement.
    expect(parseMontant(an.lignes[0].debit ?? an.lignes[0].credit ?? 0)).toBe(1);
  });
});
