import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

/**
 * Tests d'intégration de l'API des immobilisations (E5).
 *
 * Même procédé que la comptabilité : handlers réels, base réelle, session
 * simulée. Un contribuable témoin ouvre deux exercices, reçoit des fiches,
 * passe ses dotations, cède un bien.
 */

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/session", () => session);

const { db } = await import("@/db");
const schema = await import("@/db/schema");

const exercicesRoute = await import("@/app/api/comptabilite/exercices/route");
const immosRoute = await import("@/app/api/comptabilite/immobilisations/route");
const immoRoute = await import("@/app/api/comptabilite/immobilisations/[id]/route");
const sortieRoute = await import("@/app/api/comptabilite/immobilisations/[id]/sortie/route");
const dotationsRoute = await import("@/app/api/comptabilite/immobilisations/dotations/route");
const tableauRoute = await import("@/app/api/comptabilite/immobilisations/tableau/route");
const clotureRoute = await import("@/app/api/comptabilite/exercices/[id]/cloture/route");

const NOM_TEMOIN = "ZZ TEST API IMMOBILISATIONS";
const ACCES_TOTAL = [{ ressource: "*", actions: ["*"] }];
const LECTURE_SEULE = [{ ressource: "comptabilite", actions: ["read"] }];

let adminId: number;
let contribuableId: number;
let exercice2026: number;
let exercice2027: number;
let vehiculeId: number;
let terrainId: number;
let ordinateurId: number;
const comptes: Record<string, number> = {};

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
const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

async function nettoyer() {
  const temoins = await db.select({ id: schema.contribuables.id }).from(schema.contribuables).where(eq(schema.contribuables.nom, NOM_TEMOIN));
  for (const { id } of temoins) {
    await db.delete(schema.cptaImmobilisations).where(eq(schema.cptaImmobilisations.contribuableId, id));
    const exercices = await db.select({ id: schema.cptaExercices.id }).from(schema.cptaExercices).where(eq(schema.cptaExercices.contribuableId, id));
    for (const ex of exercices) {
      await db.delete(schema.cptaSequences).where(eq(schema.cptaSequences.exerciceId, ex.id));
      await db.delete(schema.cptaEcritures).where(eq(schema.cptaEcritures.exerciceId, ex.id));
    }
    await db.delete(schema.cptaExercices).where(eq(schema.cptaExercices.contribuableId, id));
    await db.delete(schema.cptaTaxes).where(eq(schema.cptaTaxes.contribuableId, id));
    await db.delete(schema.cptaJournaux).where(eq(schema.cptaJournaux.contribuableId, id));
    await db.delete(schema.cptaTiers).where(eq(schema.cptaTiers.contribuableId, id));
    await db.delete(schema.cptaComptes).where(eq(schema.cptaComptes.contribuableId, id));
    await db.delete(schema.contribuables).where(eq(schema.contribuables.id, id));
  }
}

async function lignesDe(ecritureId: number) {
  return db
    .select({ numero: schema.cptaComptes.numero, debit: schema.cptaLignesEcriture.debit, credit: schema.cptaLignesEcriture.credit, libelle: schema.cptaLignesEcriture.libelle })
    .from(schema.cptaLignesEcriture)
    .innerJoin(schema.cptaComptes, eq(schema.cptaLignesEcriture.compteId, schema.cptaComptes.id))
    .where(eq(schema.cptaLignesEcriture.ecritureId, ecritureId))
    .orderBy(schema.cptaLignesEcriture.ordre);
}

beforeAll(async () => {
  await nettoyer();
  const [admin] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (!admin) throw new Error("Base non peuplée : lancez `npm run db:seed` d'abord.");
  adminId = admin.id;
  const [ctb] = await db.insert(schema.contribuables).values({ nom: NOM_TEMOIN, niu: "ZZIMMO00000001", regimeFiscal: "REEL" }).returning();
  contribuableId = ctb.id;

  connecte();
  const e26 = await (await exercicesRoute.POST(post("", { contribuableId, libelle: "Exercice 2026", dateDebut: "2026-01-01", dateFin: "2026-12-31" }))).json();
  exercice2026 = e26.id;
  const e27 = await (await exercicesRoute.POST(post("", { contribuableId, libelle: "Exercice 2027", dateDebut: "2027-01-01", dateFin: "2027-12-31" }))).json();
  exercice2027 = e27.id;
  const rows = await db.select({ id: schema.cptaComptes.id, numero: schema.cptaComptes.numero }).from(schema.cptaComptes).where(eq(schema.cptaComptes.contribuableId, contribuableId));
  for (const r of rows) comptes[r.numero] = r.id;
});

afterAll(async () => {
  await nettoyer();
});

const VEHICULE = {
  code: "VEH-001",
  libelle: "Toyota Hilux",
  compteId: () => comptes["245"],
  compteAmortissementId: () => comptes["2845"],
  compteDotationId: () => comptes["6813"],
  dateAcquisition: "2026-03-28",
  dateMiseEnService: "2026-04-01",
  valeurOrigine: "12000000",
  mode: "LINEAIRE",
  dureeMois: 60,
};
const fiche = (v: typeof VEHICULE, extra: Record<string, unknown> = {}) => ({
  ...v,
  compteId: v.compteId(),
  compteAmortissementId: v.compteAmortissementId(),
  compteDotationId: v.compteDotationId(),
  contribuableId,
  ...extra,
});

describe("fiches", () => {
  it("crée un véhicule amortissable, avec son plan calé sur les exercices", async () => {
    connecte();
    const res = await immosRoute.POST(post("", fiche(VEHICULE)));
    expect(res.status).toBe(201);
    const i = await res.json();
    vehiculeId = i.id;
    expect(i.statut).toBe("EN_SERVICE");
    expect(i.compteNumero).toBe("245");
    expect(i.modifiable).toBe(true);
    const l2026 = i.plan.find((l: { dateDebut: string }) => l.dateDebut === "2026-01-01");
    expect(l2026.dotation).toBe("1800000.00");
    expect(l2026.exercice.libelle).toBe("Exercice 2026");
    expect(l2026.passee).toBeNull();
    // 2028 n'est pas encore ouvert : la ligne existe, sans exercice.
    const l2028 = i.plan.find((l: { dateDebut: string }) => l.dateDebut === "2028-01-01");
    expect(l2028.dotation).toBe("2400000.00");
    expect(l2028.exercice).toBeNull();
    expect(i.plan[i.plan.length - 1].vncFin).toBe("0.00");
  });

  it("crée un terrain, sans plan", async () => {
    connecte();
    const res = await immosRoute.POST(
      post("", { contribuableId, code: "TER-001", libelle: "Terrain Bonabéri", compteId: comptes["222"], dateAcquisition: "2020-01-01", dateMiseEnService: "2020-01-01", valeurOrigine: "50000000", mode: "LINEAIRE", dureeMois: null }),
    );
    expect(res.status).toBe(201);
    const i = await res.json();
    terrainId = i.id;
    expect(i.dureeMois).toBeNull();
    expect(i.plan).toEqual([]);
  });

  it("refuse un code pris, un mauvais compte, un bien amortissable sans comptes", async () => {
    connecte();
    expect((await immosRoute.POST(post("", fiche(VEHICULE)))).status).toBe(409);
    const mauvais = await immosRoute.POST(post("", fiche(VEHICULE, { code: "X", compteId: comptes["2845"] })));
    expect(mauvais.status).toBe(400);
    expect((await mauvais.json()).error.message).toMatch(/n'est pas un compte d'immobilisation/);
    const sans = await immosRoute.POST(post("", fiche(VEHICULE, { code: "Y", compteAmortissementId: null, compteDotationId: null })));
    expect(sans.status).toBe(422);
    const avant = await immosRoute.POST(post("", fiche(VEHICULE, { code: "Z", dateMiseEnService: "2026-01-01" })));
    expect(avant.status).toBe(400);
  });

  it("le registre porte l'amorti et la valeur nette à la clôture de l'exercice", async () => {
    connecte();
    const res = await immosRoute.GET(get(`/api/comptabilite/immobilisations?contribuableId=${contribuableId}&exerciceId=${exercice2026}`));
    expect(res.status).toBe(200);
    const liste = await res.json();
    expect(liste.map((i: { code: string }) => i.code)).toEqual(["TER-001", "VEH-001"]);
    const veh = liste.find((i: { code: string }) => i.code === "VEH-001");
    expect(veh.cumulAmortissements).toBe("1800000.00");
    expect(veh.valeurNette).toBe("10200000.00");
    expect(veh.doteeDansExercice).toBe(false);
  });
});

describe("dotations", () => {
  it("prévisualise ce qui est dû pour l'exercice", async () => {
    connecte();
    const res = await dotationsRoute.GET(get(`/api/comptabilite/immobilisations/dotations?exerciceId=${exercice2026}`));
    expect(res.status).toBe(200);
    const p = await res.json();
    expect(p.lignes).toEqual([{ id: vehiculeId, code: "VEH-001", libelle: "Toyota Hilux", dotation: "1800000.00" }]);
  });

  it("la clôture est bloquée tant que la dotation manque", async () => {
    connecte();
    const c = await (await clotureRoute.GET(get(""), ctx(exercice2026))).json();
    expect(c.immobilisationsSansDotation).toEqual(["VEH-001"]);
    expect(c.obstacles.join(" ")).toMatch(/sans dotation/);
  });

  it("passe l'écriture de dotations : OD au dernier jour, 6813 contre 2845", async () => {
    connecte();
    const res = await dotationsRoute.POST(post("", { exerciceId: exercice2026 }));
    expect(res.status).toBe(201);
    const r = await res.json();
    expect(r.ecriture.statut).toBe("VALIDEE");
    expect(r.ecriture.origine).toBe("AMORTISSEMENT");
    expect(r.ecriture.origineId).toBe(exercice2026);
    expect(r.ecriture.dateEcriture).toBe("2026-12-31");
    expect(r.ecriture.numeroPiece).toMatch(/^OD2026-/);
    expect(r.dotations).toEqual([{ immobilisationId: vehiculeId, montant: "1800000.00" }]);
    const lignes = await lignesDe(r.ecriture.id);
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toMatchObject({ numero: "6813", debit: "1800000.00", libelle: "Dotation Exercice 2026 — VEH-001 Toyota Hilux" });
    expect(lignes[1]).toMatchObject({ numero: "2845", credit: "1800000.00" });

    const i = await (await immoRoute.GET(get(""), ctx(vehiculeId))).json();
    const l2026 = i.plan.find((l: { dateDebut: string }) => l.dateDebut === "2026-01-01");
    expect(l2026.passee).toMatchObject({ montant: "1800000.00", ecritureId: r.ecriture.id });
    expect(i.modifiable).toBe(false);

    const c = await (await clotureRoute.GET(get(""), ctx(exercice2026))).json();
    expect(c.immobilisationsSansDotation).toEqual([]);
  });

  it("ne dote pas deux fois", async () => {
    connecte();
    const res = await dotationsRoute.POST(post("", { exerciceId: exercice2026 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/Rien à doter/);
  });

  it("une fiche dotée garde ses paramètres, mais se renomme", async () => {
    connecte();
    const bloque = await immoRoute.PUT(put("", fiche(VEHICULE, { dureeMois: 48 })), ctx(vehiculeId));
    expect(bloque.status).toBe(409);
    const ok = await immoRoute.PUT(put("", fiche(VEHICULE, { libelle: "Toyota Hilux double cabine", notes: "Immatriculée LT 1234 A" })), ctx(vehiculeId));
    expect(ok.status).toBe(200);
    expect((await ok.json()).libelle).toBe("Toyota Hilux double cabine");
  });

  it("un bien ajouté après coup reçoit sa dotation à la relance, sans reprendre les autres", async () => {
    connecte();
    const res = await immosRoute.POST(
      post("", { contribuableId, code: "ORD-001", libelle: "Portable", compteId: comptes["2444"], compteAmortissementId: comptes["2844"], compteDotationId: comptes["6813"], dateAcquisition: "2026-10-01", dateMiseEnService: "2026-10-01", valeurOrigine: "600000", mode: "LINEAIRE", dureeMois: 36 }),
    );
    expect(res.status).toBe(201);
    ordinateurId = (await res.json()).id;
    const c = await (await clotureRoute.GET(get(""), ctx(exercice2026))).json();
    expect(c.immobilisationsSansDotation).toEqual(["ORD-001"]);

    const r = await (await dotationsRoute.POST(post("", { exerciceId: exercice2026 }))).json();
    // 600 000 × 90/1080 = 50 000.
    expect(r.dotations).toEqual([{ immobilisationId: ordinateurId, montant: "50000.00" }]);
  });
});

describe("tableau des immobilisations", () => {
  it("brut et amortissements de l'ouverture à la clôture, avec totaux", async () => {
    connecte();
    const res = await tableauRoute.GET(get(`/api/comptabilite/immobilisations/tableau?exerciceId=${exercice2026}`));
    expect(res.status).toBe(200);
    const t = await res.json();
    expect(t.exercice.libelle).toBe("Exercice 2026");
    const par = (code: string) => t.lignes.find((l: { code: string }) => l.code === code);
    expect(par("TER-001")).toMatchObject({ brutDebut: "50000000.00", acquisitions: "0.00", brutFin: "50000000.00", dotation: "0.00", vncFin: "50000000.00", dotee: false });
    expect(par("VEH-001")).toMatchObject({ brutDebut: "0.00", acquisitions: "12000000.00", amortFin: "1800000.00", vncFin: "10200000.00", dotee: true });
    expect(par("ORD-001")).toMatchObject({ acquisitions: "600000.00", dotation: "50000.00", dotee: true });
    expect(t.totaux.brutFin).toBe("62600000.00");
    expect(t.totaux.amortFin).toBe("1850000.00");
    expect(t.totaux.vncFin).toBe("60750000.00");
  });
});

describe("sortie", () => {
  it("cède le véhicule en 2027 : dotation complémentaire, comptes soldés, VNC et prix", async () => {
    connecte();
    const res = await sortieRoute.POST(post("", { dateSortie: "2027-06-30", prixCession: "7000000" }), ctx(vehiculeId));
    expect(res.status).toBe(201);
    const r = await res.json();
    expect(r.statut).toBe("CEDEE");
    expect(r.dateSortie).toBe("2027-06-30");
    expect(r.prixCession).toBe("7000000.00");
    expect(r.dotationComplementaire).toBe("1200000.00");
    expect(r.vnc).toBe("9000000.00");
    expect(r.ecriture.origine).toBe("CESSION");
    expect(r.ecriture.origineId).toBe(vehiculeId);
    expect(r.ecriture.dateEcriture).toBe("2027-06-30");
    expect(r.ecritureSortie.numeroPiece).toBe(r.ecriture.numeroPiece);

    const lignes = await lignesDe(r.ecriture.id);
    const par = (numero: string) => lignes.filter((l) => l.numero === numero);
    expect(par("6813")[0]).toMatchObject({ debit: "1200000.00" });
    expect(par("2845").map((l) => [l.debit, l.credit])).toEqual([
      ["0.00", "1200000.00"],
      ["3000000.00", "0.00"],
    ]);
    expect(par("812")[0]).toMatchObject({ debit: "9000000.00" });
    expect(par("245")[0]).toMatchObject({ credit: "12000000.00" });
    expect(par("485")[0]).toMatchObject({ debit: "7000000.00" });
    expect(par("822")[0]).toMatchObject({ credit: "7000000.00" });
    const debit = lignes.reduce((s, l) => s + Number(l.debit), 0);
    const credit = lignes.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBe(credit);

    // La dotation complémentaire vaut dotation 2027, et le plan s'arrête là.
    const [d] = await db
      .select()
      .from(schema.cptaDotations)
      .where(and(eq(schema.cptaDotations.immobilisationId, vehiculeId), eq(schema.cptaDotations.exerciceId, exercice2027)));
    expect(d.montant).toBe("1200000.00");
    expect(d.ecritureId).toBe(r.ecriture.id);
    const l2028 = r.plan.find((l: { dateDebut: string }) => l.dateDebut === "2028-01-01");
    expect(l2028.dotation).toBe("0.00");
    expect(l2028.cumulFin).toBe("3000000.00");
  });

  it("le tableau 2027 montre la sortie", async () => {
    connecte();
    const t = await (await tableauRoute.GET(get(`/api/comptabilite/immobilisations/tableau?exerciceId=${exercice2027}`))).json();
    const veh = t.lignes.find((l: { code: string }) => l.code === "VEH-001");
    expect(veh).toMatchObject({ brutDebut: "12000000.00", sorties: "12000000.00", brutFin: "0.00", amortDebut: "1800000.00", dotation: "1200000.00", amortSorties: "3000000.00", amortFin: "0.00", vncFin: "0.00" });
    // Les dotations 2027 ne reprennent plus le véhicule.
    const p = await (await dotationsRoute.GET(get(`/api/comptabilite/immobilisations/dotations?exerciceId=${exercice2027}`))).json();
    expect(p.lignes.map((l: { code: string }) => l.code)).toEqual(["ORD-001"]);
  });

  it("un bien sorti ne se ressort pas, ne se modifie plus, ne se supprime pas", async () => {
    connecte();
    expect((await sortieRoute.POST(post("", { dateSortie: "2027-07-01" }), ctx(vehiculeId))).status).toBe(409);
    expect((await immoRoute.PUT(put("", fiche(VEHICULE)), ctx(vehiculeId))).status).toBe(409);
    expect((await immoRoute.DELETE(post(""), ctx(vehiculeId))).status).toBe(409);
  });

  it("met un terrain au rebut : ni amortissement ni produit, la valeur d'origine part en charge", async () => {
    connecte();
    const res = await sortieRoute.POST(post("", { dateSortie: "2027-03-01" }), ctx(terrainId));
    expect(res.status).toBe(201);
    const r = await res.json();
    expect(r.statut).toBe("REBUT");
    const lignes = await lignesDe(r.ecriture.id);
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toMatchObject({ numero: "812", debit: "50000000.00" });
    expect(lignes[1]).toMatchObject({ numero: "222", credit: "50000000.00" });
  });

  it("refuse une sortie hors exercice ouvert", async () => {
    connecte();
    const res = await sortieRoute.POST(post("", { dateSortie: "2031-01-01" }), ctx(ordinateurId));
    expect(res.status).toBe(400);
  });

  it("une fiche sans écriture se jette", async () => {
    connecte();
    const i = await (await immosRoute.POST(post("", fiche(VEHICULE, { code: "TMP-001" })))).json();
    expect((await immoRoute.DELETE(post(""), ctx(i.id))).status).toBe(204);
    expect((await immoRoute.GET(get(""), ctx(i.id))).status).toBe(404);
  });

  it("refuse 403 en lecture seule", async () => {
    connecte(LECTURE_SEULE);
    expect((await immosRoute.GET(get(`/api/comptabilite/immobilisations?contribuableId=${contribuableId}`))).status).toBe(200);
    expect((await immosRoute.POST(post("", fiche(VEHICULE, { code: "NO" })))).status).toBe(403);
    expect((await dotationsRoute.POST(post("", { exerciceId: exercice2027 }))).status).toBe(403);
    expect((await sortieRoute.POST(post("", { dateSortie: "2027-07-01" }), ctx(ordinateurId))).status).toBe(403);
  });
});
