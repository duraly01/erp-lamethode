import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

/**
 * Tests d'intégration de l'API de comptabilité analytique (E5).
 *
 * Handlers réels, base réelle, session simulée. Un contribuable témoin
 * reçoit un axe « Activité » à deux sections, une écriture d'achat et une
 * de vente validées ; on ventile, on lit la restitution.
 */

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/session", () => session);

const { db } = await import("@/db");
const schema = await import("@/db/schema");

const exercicesRoute = await import("@/app/api/comptabilite/exercices/route");
const ecrituresRoute = await import("@/app/api/comptabilite/ecritures/route");
const validerRoute = await import("@/app/api/comptabilite/ecritures/[id]/valider/route");
const axesRoute = await import("@/app/api/comptabilite/analytique/axes/route");
const axeRoute = await import("@/app/api/comptabilite/analytique/axes/[id]/route");
const sectionsRoute = await import("@/app/api/comptabilite/analytique/axes/[id]/sections/route");
const sectionRoute = await import("@/app/api/comptabilite/analytique/sections/[id]/route");
const lignesRoute = await import("@/app/api/comptabilite/analytique/lignes/route");
const ventilationRoute = await import("@/app/api/comptabilite/analytique/lignes/[id]/ventilation/route");
const restitutionRoute = await import("@/app/api/comptabilite/analytique/restitution/route");

const NOM_TEMOIN = "ZZ TEST API ANALYTIQUE";
const ACCES_TOTAL = [{ ressource: "*", actions: ["*"] }];
const LECTURE_SEULE = [{ ressource: "comptabilite", actions: ["read"] }];

let adminId: number;
let contribuableId: number;
let exerciceId: number;
let axeId: number;
let sectionBoul: number;
let sectionPat: number;
let ligneAchat: number;
let ligneVente: number;
let brouillonLigne: number;
const comptes: Record<string, number> = {};
const journaux: Record<string, number> = {};

function connecte(permissions: unknown = ACCES_TOTAL) {
  session.getSessionUser.mockResolvedValue({ id: adminId, nom: "Test", email: "test@lamethode.cm", roleNom: "ADMIN", permissions });
}

const get = (url: string) => new NextRequest(`http://localhost${url}`);
const envoi = (method: string) => (url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const post = envoi("POST");
const put = envoi("PUT");
const patch = envoi("PATCH");
const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

async function nettoyer() {
  const temoins = await db.select({ id: schema.contribuables.id }).from(schema.contribuables).where(eq(schema.contribuables.nom, NOM_TEMOIN));
  for (const { id } of temoins) {
    const exercices = await db.select({ id: schema.cptaExercices.id }).from(schema.cptaExercices).where(eq(schema.cptaExercices.contribuableId, id));
    for (const ex of exercices) {
      await db.delete(schema.cptaSequences).where(eq(schema.cptaSequences.exerciceId, ex.id));
      // Les ventilations partent avec les lignes ; les axes ensuite.
      await db.delete(schema.cptaEcritures).where(eq(schema.cptaEcritures.exerciceId, ex.id));
    }
    await db.delete(schema.cptaAxesAnalytiques).where(eq(schema.cptaAxesAnalytiques.contribuableId, id));
    await db.delete(schema.cptaExercices).where(eq(schema.cptaExercices.contribuableId, id));
    await db.delete(schema.cptaTaxes).where(eq(schema.cptaTaxes.contribuableId, id));
    await db.delete(schema.cptaJournaux).where(eq(schema.cptaJournaux.contribuableId, id));
    await db.delete(schema.cptaTiers).where(eq(schema.cptaTiers.contribuableId, id));
    await db.delete(schema.cptaComptes).where(eq(schema.cptaComptes.contribuableId, id));
    await db.delete(schema.contribuables).where(eq(schema.contribuables.id, id));
  }
}

async function ecritureValidee(journalId: number, date: string, libelle: string, lignes: { compteId: number; debit?: string; credit?: string }[]) {
  const e = await (await ecrituresRoute.POST(post("", { exerciceId, journalId, dateEcriture: date, libelle, lignes }))).json();
  const res = await validerRoute.POST(post(""), ctx(e.id));
  if (res.status !== 200) throw new Error(`Validation refusée : ${JSON.stringify(await res.json())}`);
  return db.select().from(schema.cptaLignesEcriture).where(eq(schema.cptaLignesEcriture.ecritureId, e.id)).orderBy(schema.cptaLignesEcriture.ordre);
}

beforeAll(async () => {
  await nettoyer();
  const [admin] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (!admin) throw new Error("Base non peuplée : lancez `npm run db:seed` d'abord.");
  adminId = admin.id;
  const [ctb] = await db.insert(schema.contribuables).values({ nom: NOM_TEMOIN, niu: "ZZANA000000001", regimeFiscal: "REEL" }).returning();
  contribuableId = ctb.id;

  connecte();
  const ex = await (await exercicesRoute.POST(post("", { contribuableId, libelle: "Exercice 2026", dateDebut: "2026-01-01", dateFin: "2026-12-31" }))).json();
  exerciceId = ex.id;
  for (const c of await db.select({ id: schema.cptaComptes.id, numero: schema.cptaComptes.numero }).from(schema.cptaComptes).where(eq(schema.cptaComptes.contribuableId, contribuableId))) {
    comptes[c.numero] = c.id;
  }
  for (const j of await db.select({ id: schema.cptaJournaux.id, code: schema.cptaJournaux.code }).from(schema.cptaJournaux).where(eq(schema.cptaJournaux.contribuableId, contribuableId))) {
    journaux[j.code] = j.id;
  }

  // Un achat de 400 000 payé en banque, une vente de 1 000 000 encaissée.
  const achat = await ecritureValidee(journaux["BQ"], "2026-02-10", "Farine", [
    { compteId: comptes["601"], debit: "400000" },
    { compteId: comptes["5211"], credit: "400000" },
  ]);
  ligneAchat = achat[0].id;
  const vente = await ecritureValidee(journaux["BQ"], "2026-02-20", "Ventes du jour", [
    { compteId: comptes["5211"], debit: "1000000" },
    { compteId: comptes["701"], credit: "1000000" },
  ]);
  ligneVente = vente[1].id;
  const brouillon = await (await ecrituresRoute.POST(post("", { exerciceId, journalId: journaux["BQ"], dateEcriture: "2026-03-01", libelle: "Brouillon", lignes: [{ compteId: comptes["601"], debit: "1000" }] }))).json();
  const [bl] = await db.select().from(schema.cptaLignesEcriture).where(eq(schema.cptaLignesEcriture.ecritureId, brouillon.id));
  brouillonLigne = bl.id;
});

afterAll(async () => {
  await nettoyer();
});

describe("axes et sections", () => {
  it("crée un axe et ses sections, le code en majuscules", async () => {
    connecte();
    const res = await axesRoute.POST(post("", { contribuableId, code: "act", libelle: "Activité" }));
    expect(res.status).toBe(201);
    const axe = await res.json();
    axeId = axe.id;
    expect(axe.code).toBe("ACT");
    expect(axe.sections).toEqual([]);
    const s1 = await (await sectionsRoute.POST(post("", { code: "boul", libelle: "Boulangerie" }), ctx(axeId))).json();
    const s2 = await (await sectionsRoute.POST(post("", { code: "PAT", libelle: "Pâtisserie" }), ctx(axeId))).json();
    sectionBoul = s1.id;
    sectionPat = s2.id;
    expect(s1.code).toBe("BOUL");
    const liste = await (await axesRoute.GET(get(`/api/comptabilite/analytique/axes?contribuableId=${contribuableId}`))).json();
    expect(liste).toHaveLength(1);
    expect(liste[0].sections.map((s: { code: string }) => s.code)).toEqual(["BOUL", "PAT"]);
  });

  it("refuse un code d'axe ou de section déjà pris", async () => {
    connecte();
    expect((await axesRoute.POST(post("", { contribuableId, code: "ACT", libelle: "Doublon" }))).status).toBe(409);
    expect((await sectionsRoute.POST(post("", { code: "boul", libelle: "Doublon" }), ctx(axeId))).status).toBe(409);
  });

  it("renomme et désactive, puis réactive", async () => {
    connecte();
    const r = await sectionRoute.PATCH(patch("", { libelle: "Pâtisserie fine", actif: false }), ctx(sectionPat));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ libelle: "Pâtisserie fine", actif: false });
    expect((await sectionRoute.PATCH(patch("", { actif: true }), ctx(sectionPat))).status).toBe(200);
    expect((await axeRoute.PATCH(patch("", { libelle: "Activités" }), ctx(axeId))).status).toBe(200);
  });
});

describe("ventilation", () => {
  it("liste les lignes de charges et de produits validées, toutes à ventiler", async () => {
    connecte();
    const res = await lignesRoute.GET(get(`/api/comptabilite/analytique/lignes?exerciceId=${exerciceId}&axeId=${axeId}`));
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.axe.code).toBe("ACT");
    expect(r.sections).toHaveLength(2);
    // Le brouillon n'y est pas ; la banque non plus.
    expect(r.lignes.map((l: { compteNumero: string }) => l.compteNumero).sort()).toEqual(["601", "701"]);
    const achat = r.lignes.find((l: { ligneId: number }) => l.ligneId === ligneAchat);
    expect(achat).toMatchObject({ montant: "400000.00", sens: "DEBIT", reste: "400000.00", ventilations: [] });
  });

  it("ventile l'achat 300 / 100 et la vente entièrement sur la boulangerie", async () => {
    connecte();
    const res = await ventilationRoute.PUT(
      put("", { axeId, ventilations: [{ sectionId: sectionBoul, montant: "300000" }, { sectionId: sectionPat, montant: "100000" }] }),
      ctx(ligneAchat),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reste: "0.00" });
    const partielle = await ventilationRoute.PUT(put("", { axeId, ventilations: [{ sectionId: sectionBoul, montant: "800000" }] }), ctx(ligneVente));
    expect(await partielle.json()).toMatchObject({ reste: "200000.00" });

    const r = await (await lignesRoute.GET(get(`/api/comptabilite/analytique/lignes?exerciceId=${exerciceId}&axeId=${axeId}`))).json();
    // Seule la vente reste à ventiler, pour 200 000.
    expect(r.lignes).toHaveLength(1);
    expect(r.lignes[0]).toMatchObject({ ligneId: ligneVente, reste: "200000.00" });
    const toutes = await (await lignesRoute.GET(get(`/api/comptabilite/analytique/lignes?exerciceId=${exerciceId}&axeId=${axeId}&etat=TOUTES`))).json();
    expect(toutes.lignes).toHaveLength(2);
  });

  it("refuse un dépassement, une section d'un autre axe, un brouillon", async () => {
    connecte();
    const trop = await ventilationRoute.PUT(put("", { axeId, ventilations: [{ sectionId: sectionBoul, montant: "400001" }] }), ctx(ligneAchat));
    expect(trop.status).toBe(400);
    expect((await trop.json()).error.message).toMatch(/dépasse/);
    const autre = await (await axesRoute.POST(post("", { contribuableId, code: "SITE", libelle: "Site" }))).json();
    const sAutre = await (await sectionsRoute.POST(post("", { code: "DLA", libelle: "Douala" }), ctx(autre.id))).json();
    expect((await ventilationRoute.PUT(put("", { axeId, ventilations: [{ sectionId: sAutre.id, montant: "1" }] }), ctx(ligneAchat))).status).toBe(400);
    expect((await ventilationRoute.PUT(put("", { axeId, ventilations: [{ sectionId: sectionBoul, montant: "1000" }] }), ctx(brouillonLigne))).status).toBe(409);
    // Un second axe se ventile indépendamment du premier.
    const site = await ventilationRoute.PUT(put("", { axeId: autre.id, ventilations: [{ sectionId: sAutre.id, montant: "400000" }] }), ctx(ligneAchat));
    expect(site.status).toBe(200);
    const r = await (await lignesRoute.GET(get(`/api/comptabilite/analytique/lignes?exerciceId=${exerciceId}&axeId=${axeId}&etat=TOUTES`))).json();
    expect(r.lignes.find((l: { ligneId: number }) => l.ligneId === ligneAchat).reste).toBe("0.00");
  });

  it("une section ventilée ne se supprime pas, une vide si", async () => {
    connecte();
    expect((await sectionRoute.DELETE(get(""), ctx(sectionBoul))).status).toBe(409);
    expect((await axeRoute.DELETE(get(""), ctx(axeId))).status).toBe(409);
    const vide = await (await sectionsRoute.POST(post("", { code: "TMP", libelle: "Vide" }), ctx(axeId))).json();
    expect((await sectionRoute.DELETE(get(""), ctx(vide.id))).status).toBe(204);
  });
});

describe("restitution", () => {
  it("charges, produits et résultat par section, reste non ventilé en dernier", async () => {
    connecte();
    const res = await restitutionRoute.GET(get(`/api/comptabilite/analytique/restitution?exerciceId=${exerciceId}&axeId=${axeId}`));
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.lignes.map((l: { section: { code: string } | null }) => l.section?.code ?? null)).toEqual(["BOUL", "PAT", null]);
    expect(r.lignes[0]).toMatchObject({ charges: "300000.00", produits: "800000.00", resultat: "500000.00" });
    expect(r.lignes[0].comptes).toEqual([
      { numero: "601", libelle: expect.any(String), charges: "300000.00", produits: "0.00" },
      { numero: "701", libelle: expect.any(String), charges: "0.00", produits: "800000.00" },
    ]);
    expect(r.lignes[1]).toMatchObject({ charges: "100000.00", produits: "0.00", resultat: "-100000.00" });
    expect(r.lignes[2]).toMatchObject({ section: null, charges: "0.00", produits: "200000.00" });
    expect(r.totaux).toEqual({ charges: "400000.00", produits: "1000000.00", resultat: "600000.00" });
  });

  it("retirer une ventilation remet la ligne dans le reste", async () => {
    connecte();
    expect((await ventilationRoute.PUT(put("", { axeId, ventilations: [] }), ctx(ligneVente))).status).toBe(200);
    const r = await (await restitutionRoute.GET(get(`/api/comptabilite/analytique/restitution?exerciceId=${exerciceId}&axeId=${axeId}`))).json();
    expect(r.lignes[0].produits).toBe("0.00");
    expect(r.lignes[2].produits).toBe("1000000.00");
  });

  it("refuse 403 en lecture seule sur l'écriture, pas sur la lecture", async () => {
    connecte(LECTURE_SEULE);
    expect((await restitutionRoute.GET(get(`/api/comptabilite/analytique/restitution?exerciceId=${exerciceId}&axeId=${axeId}`))).status).toBe(200);
    expect((await ventilationRoute.PUT(put("", { axeId, ventilations: [] }), ctx(ligneAchat))).status).toBe(403);
    expect((await axesRoute.POST(post("", { contribuableId, code: "X", libelle: "X" }))).status).toBe(403);
  });
});
