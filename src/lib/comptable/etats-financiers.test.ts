import { describe, it, expect } from "vitest";
import { calculerBalance, type LigneBalance } from "@/lib/comptable/balance";
import {
  calculerBilan,
  calculerCompteResultat,
  calculerEtatsFinanciers,
} from "@/lib/comptable/etats-financiers";

/**
 * Les montants *attendus* sont en centimes, comme tout ce que rend le moteur
 * comptable. Les montants *fournis* à la balance, eux, sont des FCFA : c'est
 * `parseMontant` qui les convertit, exactement comme pour ce qui vient de
 * PostgreSQL.
 */
const fcfa = (n: number) => n * 100;

/**
 * Construit une balance à partir de soldes, en passant par `calculerBalance`
 * plutôt qu'en fabriquant les lignes à la main : les états financiers sont
 * ainsi testés sur exactement ce que la balance leur donne.
 */
function balance(
  soldes: { numero: string; libelle: string; debit?: number; credit?: number }[],
): LigneBalance[] {
  return calculerBalance(
    soldes.map((s, i) => ({
      compteId: i + 1,
      compteNumero: s.numero,
      compteLibelle: s.libelle,
      debit: s.debit ?? 0,
      credit: s.credit ?? 0,
    })),
  );
}

function poste(lignes: { code: string }[], code: string) {
  const l = lignes.find((x) => x.code === code);
  if (!l) throw new Error(`Poste ${code} absent de l'état.`);
  return l as never;
}

const net = (lignes: { code: string; net: number }[], code: string) =>
  (poste(lignes, code) as { net: number }).net;
const montant = (lignes: { code: string; montant: number }[], code: string) =>
  (poste(lignes, code) as { montant: number }).montant;

// ---------------------------------------------------------------------------
// Un exercice complet, vérifié poste à poste
// ---------------------------------------------------------------------------

/**
 * Petit exercice équilibré : un apport en capital, l'achat d'un matériel
 * amorti, un cycle achat/vente, des salaires. La perte vient de la dotation.
 */
const EXERCICE = balance([
  { numero: "101", libelle: "Capital social", credit: 5_000_000 },
  { numero: "521", libelle: "Banques locales", debit: 3_100_000 },
  { numero: "2444", libelle: "Matériel informatique", debit: 2_000_000 },
  { numero: "2844", libelle: "Amortissements du matériel et mobilier de bureau", credit: 400_000 },
  { numero: "411", libelle: "Clients", debit: 500_000 },
  { numero: "401", libelle: "Fournisseurs, dettes en compte", credit: 300_000 },
  { numero: "431", libelle: "Sécurité sociale (CNPS)", credit: 100_000 },
  { numero: "601", libelle: "Achats de marchandises", debit: 1_200_000 },
  { numero: "701", libelle: "Ventes de marchandises", credit: 2_000_000 },
  { numero: "6611", libelle: "Appointements, salaires et commissions", debit: 600_000 },
  { numero: "6813", libelle: "Dotations aux amortissements", debit: 400_000 },
]);

describe("compte de résultat", () => {
  const resultat = calculerCompteResultat(EXERCICE);
  const l = resultat.lignes;

  it("présente ventes et achats dans leur sens naturel, positifs", () => {
    expect(montant(l, "TA")).toBe(fcfa(2_000_000));
    expect(montant(l, "RA")).toBe(fcfa(1_200_000));
    expect(montant(l, "RK")).toBe(fcfa(600_000));
    expect(montant(l, "RL")).toBe(fcfa(400_000));
  });

  it("enchaîne les soldes intermédiaires de gestion", () => {
    expect(montant(l, "XA")).toBe(fcfa(800_000)); // marge commerciale
    expect(montant(l, "XB")).toBe(fcfa(2_000_000)); // chiffre d'affaires
    expect(montant(l, "XC")).toBe(fcfa(800_000)); // valeur ajoutée
    expect(montant(l, "XD")).toBe(fcfa(200_000)); // EBE
    expect(montant(l, "XE")).toBe(fcfa(-200_000)); // résultat d'exploitation
  });

  it("un résultat déficitaire est négatif, pas absolu", () => {
    expect(montant(l, "XI")).toBe(fcfa(-200_000));
    expect(resultat.resultatNet).toBe(fcfa(-200_000));
  });

  it("marque les soldes intermédiaires comme totaux", () => {
    expect((poste(l, "XA") as { estTotal: boolean }).estTotal).toBe(true);
    expect((poste(l, "TA") as { estTotal: boolean }).estTotal).toBe(false);
  });
});

describe("bilan", () => {
  const { bilan } = calculerEtatsFinanciers(EXERCICE);

  it("présente l'actif immobilisé en brut, amortissements et net", () => {
    const am = poste(bilan.actif, "AM") as {
      brut: number;
      amortissements: number;
      net: number;
    };
    expect(am.brut).toBe(fcfa(2_000_000));
    expect(am.amortissements).toBe(fcfa(400_000));
    expect(am.net).toBe(fcfa(1_600_000));
  });

  it("totalise les rubriques d'actif", () => {
    expect(net(bilan.actif, "AI")).toBe(fcfa(1_600_000));
    expect(net(bilan.actif, "AZ")).toBe(fcfa(1_600_000));
    expect(net(bilan.actif, "BI")).toBe(fcfa(500_000));
    expect(net(bilan.actif, "BK")).toBe(fcfa(500_000));
    expect(net(bilan.actif, "BS")).toBe(fcfa(3_100_000));
    expect(net(bilan.actif, "BZ")).toBe(fcfa(5_200_000));
  });

  it("porte le résultat de l'exercice au passif", () => {
    // Les comptes de gestion ne sont pas soldés : sans cette reprise, le
    // résultat n'existerait dans aucun compte de bilan.
    expect(net(bilan.passif, "CJ")).toBe(fcfa(-200_000));
    expect(net(bilan.passif, "CP")).toBe(fcfa(4_800_000));
  });

  it("ventile les dettes selon leur nature", () => {
    expect(net(bilan.passif, "DJ")).toBe(fcfa(300_000));
    expect(net(bilan.passif, "DK")).toBe(fcfa(100_000));
    expect(net(bilan.passif, "DP")).toBe(fcfa(400_000));
  });

  it("s'équilibre", () => {
    expect(bilan.totalActif).toBe(fcfa(5_200_000));
    expect(bilan.totalPassif).toBe(fcfa(5_200_000));
    expect(bilan.ecart).toBe(0);
    expect(bilan.equilibre).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// L'invariant qui compte
// ---------------------------------------------------------------------------

describe("équilibre du bilan", () => {
  it("tient sur une balance équilibrée quelconque", () => {
    // L'équilibre n'est pas une coïncidence arithmétique : il découle de ce que
    // chaque compte est rattaché à un poste et un seul, et que le résultat est
    // repris au passif. Ce test le vérifie sur des jeux volontairement variés.
    const jeux: LigneBalance[][] = [
      balance([
        { numero: "101", libelle: "Capital", credit: 1_000_000 },
        { numero: "571", libelle: "Caisse", debit: 1_000_000 },
      ]),
      balance([
        { numero: "101", libelle: "Capital", credit: 2_000_000 },
        { numero: "311", libelle: "Marchandises", debit: 800_000 },
        { numero: "391", libelle: "Dépréciations des stocks", credit: 50_000 },
        { numero: "521", libelle: "Banque", debit: 1_250_000 },
        { numero: "6911", libelle: "Dotations aux provisions", debit: 50_000 },
        { numero: "706", libelle: "Services vendus", credit: 50_000 },
      ]),
      balance([
        { numero: "101", libelle: "Capital", credit: 3_000_000 },
        { numero: "162", libelle: "Emprunts bancaires", credit: 1_000_000 },
        { numero: "223", libelle: "Terrains bâtis", debit: 2_500_000 },
        { numero: "231", libelle: "Bâtiments", debit: 1_800_000 },
        { numero: "2813", libelle: "Amortissements des bâtiments", credit: 300_000 },
        { numero: "521", libelle: "Banque", debit: 700_000 },
        { numero: "4111", libelle: "Clients locaux", debit: 400_000 },
        { numero: "491", libelle: "Dépréciations clients", credit: 100_000 },
        { numero: "4011", libelle: "Fournisseurs locaux", credit: 200_000 },
        { numero: "701", libelle: "Ventes", credit: 1_500_000 },
        { numero: "601", libelle: "Achats", debit: 300_000 },
        { numero: "6813", libelle: "Dotations", debit: 300_000 },
        { numero: "6594", libelle: "Charges provisionnées sur créances", debit: 100_000 },
      ]),
      balance([
        // Un exercice bénéficiaire, avec du hors activités ordinaires.
        { numero: "101", libelle: "Capital", credit: 1_000_000 },
        { numero: "521", libelle: "Banque", debit: 2_400_000 },
        { numero: "245", libelle: "Matériel de transport", debit: 600_000 },
        { numero: "2845", libelle: "Amortissements du transport", credit: 600_000 },
        { numero: "812", libelle: "Valeur comptable des cessions", debit: 0 },
        { numero: "822", libelle: "Produits des cessions", credit: 400_000 },
        { numero: "706", libelle: "Services vendus", credit: 1_500_000 },
        { numero: "6611", libelle: "Salaires", debit: 500_000 },
      ]),
    ];

    for (const [i, lignes] of jeux.entries()) {
      const { bilan, resultat, comptesNonRattaches } =
        calculerEtatsFinanciers(lignes);
      expect(comptesNonRattaches, `jeu ${i}`).toEqual([]);
      expect(
        bilan.ecart,
        `jeu ${i} : actif ${bilan.totalActif} ≠ passif ${bilan.totalPassif}, résultat ${resultat.resultatNet}`,
      ).toBe(0);
    }
  });

  it("une balance vide donne des états à zéro, équilibrés", () => {
    const { bilan, resultat } = calculerEtatsFinanciers([]);
    expect(bilan.totalActif).toBe(0);
    expect(bilan.totalPassif).toBe(0);
    expect(bilan.equilibre).toBe(true);
    expect(resultat.resultatNet).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cas particuliers
// ---------------------------------------------------------------------------

describe("comptes à double sens", () => {
  it("un compte courant d'associé débiteur va aux créances", () => {
    const { bilan } = calculerEtatsFinanciers(
      balance([
        { numero: "462", libelle: "Associés, comptes courants", debit: 300_000 },
        { numero: "521", libelle: "Banque", credit: 300_000 },
      ]),
    );
    expect(net(bilan.actif, "BJ")).toBe(fcfa(300_000));
    expect(net(bilan.passif, "DM")).toBe(0);
  });

  it("créditeur, il va aux autres dettes", () => {
    const { bilan } = calculerEtatsFinanciers(
      balance([
        { numero: "462", libelle: "Associés, comptes courants", credit: 300_000 },
        { numero: "521", libelle: "Banque", debit: 300_000 },
      ]),
    );
    expect(net(bilan.passif, "DM")).toBe(fcfa(300_000));
    expect(net(bilan.actif, "BJ")).toBe(0);
  });
});

describe("compte hors référentiel", () => {
  const lignes = balance([
    { numero: "999", libelle: "Compte maison", debit: 100_000 },
    { numero: "521", libelle: "Banque", credit: 100_000 },
  ]);

  it("est signalé plutôt qu'escamoté", () => {
    const { comptesNonRattaches } = calculerEtatsFinanciers(lignes);
    expect(comptesNonRattaches).toEqual([
      {
        compteNumero: "999",
        compteLibelle: "Compte maison",
        solde: fcfa(100_000),
      },
    ]);
  });

  it("et le déséquilibre qu'il provoque est visible", () => {
    // C'est tout l'intérêt de ne pas l'ignorer : le bilan dit lui-même qu'il
    // ne tombe pas juste, au lieu d'afficher un total faux avec aplomb.
    const { bilan } = calculerEtatsFinanciers(lignes);
    expect(bilan.equilibre).toBe(false);
    expect(bilan.ecart).toBe(fcfa(-100_000));
  });
});

describe("calculerBilan appelé seul", () => {
  it("exige qu'on lui passe le résultat", () => {
    // Sans le résultat, le bilan ne s'équilibre pas — c'est la raison d'être
    // de `calculerEtatsFinanciers`, qui câble les deux ensemble.
    const sansResultat = calculerBilan(EXERCICE, 0);
    expect(sansResultat.equilibre).toBe(false);
    expect(sansResultat.ecart).toBe(fcfa(-200_000));
  });
});
