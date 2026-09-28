import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";

/**
 * Tests d'intégration des services du référentiel commercial (S1, docs/23).
 *
 * Les services sont appelés directement, sans passer par une route : S1
 * n'expose pas encore d'API. Base réelle, contribuable témoin créé et détruit
 * par le test.
 */

const { db } = await import("@/db");
const schema = await import("@/db/schema");

const depots = await import("@/lib/services/commercial/depots");
const familles = await import("@/lib/services/commercial/familles");
const articles = await import("@/lib/services/commercial/articles");
const tarifs = await import("@/lib/services/commercial/tarifs");

const NOM_TEMOIN = "ZZ TEST SERVICES COMMERCIAL";

let contribuableId: number;
let autreContribuableId: number;
let adminId: number;
let compteVente: number;
let autreCompteVente: number;

async function nettoyer() {
  const temoins = await db
    .select({ id: schema.contribuables.id })
    .from(schema.contribuables)
    .where(inArray(schema.contribuables.nom, [NOM_TEMOIN, `${NOM_TEMOIN} BIS`]));
  for (const { id } of temoins) {
    const arts = await db.select({ id: schema.gcArticles.id }).from(schema.gcArticles).where(eq(schema.gcArticles.contribuableId, id));
    if (arts.length > 0) {
      await db.delete(schema.gcTarifPrix).where(inArray(schema.gcTarifPrix.articleId, arts.map((a) => a.id)));
    }
    await db.delete(schema.gcTarifs).where(eq(schema.gcTarifs.contribuableId, id));
    await db.delete(schema.gcArticleCodes).where(eq(schema.gcArticleCodes.contribuableId, id));
    await db.delete(schema.gcArticles).where(eq(schema.gcArticles.contribuableId, id));
    await db.delete(schema.gcDepots).where(eq(schema.gcDepots.contribuableId, id));
    await db.delete(schema.gcFamilles).where(eq(schema.gcFamilles.contribuableId, id));
    await db.delete(schema.cptaComptes).where(eq(schema.cptaComptes.contribuableId, id));
    await db.delete(schema.contribuables).where(eq(schema.contribuables.id, id));
  }
}

beforeAll(async () => {
  await nettoyer();
  const [admin] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (!admin) throw new Error("Base non peuplée : lancez `npm run db:seed` d'abord.");
  adminId = admin.id;

  const [ctb] = await db.insert(schema.contribuables).values({ nom: NOM_TEMOIN, niu: "ZZCOM000000001", regimeFiscal: "REEL" }).returning();
  contribuableId = ctb.id;
  const [autre] = await db.insert(schema.contribuables).values({ nom: `${NOM_TEMOIN} BIS`, niu: "ZZCOM000000002", regimeFiscal: "REEL" }).returning();
  autreContribuableId = autre.id;

  // Un compte de vente pour chacun : le plan comptable est propre au contribuable.
  const [c1] = await db
    .insert(schema.cptaComptes)
    .values({ contribuableId, numero: "701", libelle: "Ventes de marchandises", classe: 7, type: "PRODUIT" })
    .returning();
  compteVente = c1.id;
  const [c2] = await db
    .insert(schema.cptaComptes)
    .values({ contribuableId: autreContribuableId, numero: "701", libelle: "Ventes de marchandises", classe: 7, type: "PRODUIT" })
    .returning();
  autreCompteVente = c2.id;
});

afterAll(async () => {
  await nettoyer();
});

describe("dépôts", () => {
  it("se créent avec un responsable nommé et se listent", async () => {
    const entrepot = await depots.creerDepot({
      contribuableId,
      code: "MAG",
      libelle: "Magasin central",
      type: "ENTREPOT",
      responsableUserId: adminId,
    });
    expect(entrepot.code).toBe("MAG");
    expect(entrepot.responsableNom).toBeTruthy();
    expect(entrepot.politiqueNegatif).toBe("REFUSE");

    await depots.creerDepot({ contribuableId, code: "BOUT1", libelle: "Boutique Akwa", type: "BOUTIQUE" });
    const liste = await depots.listerDepots(contribuableId);
    expect(liste.map((d) => d.code)).toEqual(["BOUT1", "MAG"]);
  });

  it("refuse un code déjà pris chez le même contribuable", async () => {
    await expect(depots.creerDepot({ contribuableId, code: "MAG", libelle: "Doublon", type: "ENTREPOT" })).rejects.toThrow(/désigne déjà/);
  });

  it("refuse une section analytique d'un autre contribuable", async () => {
    await expect(
      depots.creerDepot({ contribuableId, code: "X", libelle: "X", type: "BOUTIQUE", sectionId: 999999 }),
    ).rejects.toThrow(/introuvable/);
  });

  it("se désactive au lieu d'être supprimé, et sort alors de la liste", async () => {
    const liste = await depots.listerDepots(contribuableId);
    const boutique = liste.find((d) => d.code === "BOUT1")!;
    const apres = await depots.desactiverDepot(boutique.id);
    expect(apres.actif).toBe(false);
    expect((await depots.listerDepots(contribuableId)).map((d) => d.code)).toEqual(["MAG"]);
    expect((await depots.listerDepots(contribuableId, true)).map((d) => d.code)).toEqual(["BOUT1", "MAG"]);
  });
});

describe("familles", () => {
  let boissons: number;

  it("portent les comptes par défaut et s'emboîtent", async () => {
    const f = await familles.creerFamille({ contribuableId, code: "BOI", libelle: "Boissons", compteVenteId: compteVente });
    boissons = f.id;
    const enfant = await familles.creerFamille({ contribuableId, code: "BOI-GAZ", libelle: "Boissons gazeuses", parentId: boissons });
    expect(enfant.parentId).toBe(boissons);
  });

  it("refusent un cycle", async () => {
    const liste = await familles.listerFamilles(contribuableId);
    const enfant = liste.find((f) => f.code === "BOI-GAZ")!;
    await expect(familles.modifierFamille(boissons, { parentId: enfant.id })).rejects.toThrow(/propre descendante/);
  });

  it("refusent un parent d'un autre contribuable", async () => {
    const etranger = await familles.creerFamille({ contribuableId: autreContribuableId, code: "ETR", libelle: "Étranger" });
    await expect(familles.creerFamille({ contribuableId, code: "Y", libelle: "Y", parentId: etranger.id })).rejects.toThrow(/autre contribuable/);
  });
});

describe("articles", () => {
  let biscuit500: number;

  it("reçoivent un code interne attribué par l'ERP, séquentiel", async () => {
    const a = await articles.creerArticle({ contribuableId, libelle: "Biscuit Petit Beurre 500 g", variante: "500 g" });
    biscuit500 = a.id;
    expect(a.code).toBe("ART-000001");
    const b = await articles.creerArticle({ contribuableId, libelle: "Biscuit Petit Beurre 1 kg", variante: "1 kg" });
    expect(b.code).toBe("ART-000002");
    // La numérotation est propre à chaque contribuable.
    const c = await articles.creerArticle({ contribuableId: autreContribuableId, libelle: "Autre" });
    expect(c.code).toBe("ART-000001");
  });

  it("acceptent un code imposé et refusent un doublon", async () => {
    const a = await articles.creerArticle({ contribuableId, code: "SUCRE-1KG", libelle: "Sucre en poudre 1 kg" });
    expect(a.code).toBe("SUCRE-1KG");
    await expect(articles.creerArticle({ contribuableId, code: "SUCRE-1KG", libelle: "Doublon" })).rejects.toThrow(/désigne déjà/);
  });

  it("le code attribué suit le plus grand, pas le nombre d'articles", async () => {
    // ART-000001 et ART-000002 existent, plus SUCRE-1KG hors série.
    expect(await articles.prochainCodeArticle(contribuableId)).toBe("ART-000003");
  });

  it("refusent un compte d'un autre contribuable", async () => {
    await expect(
      articles.creerArticle({ contribuableId, libelle: "Mal imputé", compteVenteId: autreCompteVente }),
    ).rejects.toThrow(/autre contribuable/);
  });

  it("portent plusieurs codes alternatifs, uniques sur tout le catalogue", async () => {
    const a = await articles.ajouterCode(biscuit500, { type: "EAN", code: "3017620422003" });
    expect(a.codes).toHaveLength(1);
    await articles.ajouterCode(biscuit500, { type: "INTERNE_ANCIEN", code: "BIS500" });
    expect((await articles.getArticle(biscuit500)).codes).toHaveLength(2);

    const autre = await articles.creerArticle({ contribuableId, libelle: "Autre biscuit" });
    await expect(articles.ajouterCode(autre.id, { type: "EAN", code: "3017620422003" })).rejects.toThrow(/désigne déjà ART-000001/);
  });

  it("se retrouvent par n'importe lequel de leurs codes", async () => {
    expect((await articles.chercherParCode(contribuableId, "3017620422003")).id).toBe(biscuit500);
    expect((await articles.chercherParCode(contribuableId, "BIS500")).id).toBe(biscuit500);
    expect((await articles.chercherParCode(contribuableId, "ART-000001")).id).toBe(biscuit500);
    await expect(articles.chercherParCode(contribuableId, "INCONNU")).rejects.toThrow(/Aucun article/);
  });

  it("se cherchent par libellé comme par code alternatif", async () => {
    const parLibelle = await articles.listerArticles({ contribuableId, q: "Petit Beurre", page: 1, pageSize: 50 });
    expect(parLibelle.total).toBe(2);
    const parEan = await articles.listerArticles({ contribuableId, q: "3017620422003", page: 1, pageSize: 50 });
    expect(parEan.total).toBe(1);
    expect(parEan.items[0].id).toBe(biscuit500);
  });

  it("héritent des comptes de leur famille, l'article primant", async () => {
    const liste = await familles.listerFamilles(contribuableId);
    const boissons = liste.find((f) => f.code === "BOI")!;
    const gazeuses = liste.find((f) => f.code === "BOI-GAZ")!;

    const heritier = await articles.creerArticle({ contribuableId, libelle: "Limonade", familleId: gazeuses.id });
    // La famille enfant n'a pas de compte : il vient du parent.
    expect((await familles.comptesEffectifs(heritier.id)).compteVenteId).toBe(boissons.compteVenteId);

    await articles.modifierArticle(heritier.id, { compteVenteId: compteVente });
    expect((await familles.comptesEffectifs(heritier.id)).compteVenteId).toBe(compteVente);
  });
});

describe("tarifs et prix datés", () => {
  let tarifPublic: number;
  let article: number;

  beforeAll(async () => {
    const t = await tarifs.creerTarif({ contribuableId, code: "PUBLIC", libelle: "Tarif public", typeDepotDefaut: "BOUTIQUE" });
    tarifPublic = t.id;
    const a = await articles.chercherParCode(contribuableId, "ART-000001");
    article = a.id;
  });

  it("ouvre le premier prix d'un article", async () => {
    const r = await tarifs.changerPrix(tarifPublic, { articleId: article, aPartirDu: "2026-01-01", prixHt: "500" }, adminId);
    expect(r.periodes).toHaveLength(1);
    expect(r.periodes[0]).toMatchObject({ valideDu: "2026-01-01", valideAu: null, prixHt: "500.00" });
  });

  it("clôt la période courante la veille au lieu de l'écraser", async () => {
    const r = await tarifs.changerPrix(tarifPublic, { articleId: article, aPartirDu: "2026-03-01", prixHt: "400" }, adminId);
    expect(r.periodes).toHaveLength(2);
    const [recente, ancienne] = r.periodes;
    expect(recente).toMatchObject({ valideDu: "2026-03-01", valideAu: null, prixHt: "400.00" });
    expect(ancienne).toMatchObject({ valideDu: "2026-01-01", valideAu: "2026-02-28", prixHt: "500.00" });
  });

  it("relit une vente passée au prix de l'époque", async () => {
    const fevrier = await tarifs.listerPrix(tarifPublic, { articleId: article, aDate: "2026-02-15" });
    expect(fevrier.enVigueur).toBe(50_000);
    const avril = await tarifs.listerPrix(tarifPublic, { articleId: article, aDate: "2026-04-15" });
    expect(avril.enVigueur).toBe(40_000);
  });

  it("s'intercale entre deux périodes sans déborder", async () => {
    const r = await tarifs.changerPrix(tarifPublic, { articleId: article, aPartirDu: "2026-02-01", prixHt: "450" }, adminId);
    const intercalee = r.periodes.find((p) => p.valideDu === "2026-02-01")!;
    expect(intercalee.valideAu).toBe("2026-02-28");
    const premiere = r.periodes.find((p) => p.valideDu === "2026-01-01")!;
    expect(premiere.valideAu).toBe("2026-01-31");
  });

  it("refuse deux prix ouverts le même jour et un article d'un autre contribuable", async () => {
    await expect(
      tarifs.changerPrix(tarifPublic, { articleId: article, aPartirDu: "2026-03-01", prixHt: "1" }, adminId),
    ).rejects.toThrow(/commence déjà/);

    const etranger = await articles.chercherParCode(autreContribuableId, "ART-000001");
    await expect(
      tarifs.changerPrix(tarifPublic, { articleId: etranger.id, aPartirDu: "2026-06-01", prixHt: "1" }, adminId),
    ).rejects.toThrow(/autre contribuable/);
  });

  it("rend la grille à une date, un prix par article", async () => {
    const grille = await tarifs.listerPrix(tarifPublic, { aDate: "2026-02-15" });
    expect(grille.lignes).toHaveLength(1);
    expect(grille.lignes[0]).toMatchObject({ articleCode: "ART-000001", prixHt: "450.00" });
  });

  it("un tarif garni se désactive, un tarif vide se supprime", async () => {
    const vide = await tarifs.creerTarif({ contribuableId, code: "GROS", libelle: "Tarif gros" });
    expect((await tarifs.supprimerTarif(vide.id)).supprime).toBe(true);

    const r = await tarifs.supprimerTarif(tarifPublic);
    expect(r.supprime).toBe(false);
    expect(r.tarif?.actif).toBe(false);
  });
});
