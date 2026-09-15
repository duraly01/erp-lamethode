import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

/**
 * Tests d'intégration de l'API des budgets (E6).
 *
 * Handlers réels, base réelle, session simulée. Un contribuable témoin a
 * un exercice 2025 avec du réalisé, un exercice 2026 en cours ; on bâtit
 * un budget 2026 par section, on le contrôle à fin février.
 */

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/session", () => session);

const { db } = await import("@/db");
const schema = await import("@/db/schema");

const exercicesRoute = await import("@/app/api/comptabilite/exercices/route");
const ecrituresRoute = await import("@/app/api/comptabilite/ecritures/route");
const validerEcritureRoute = await import("@/app/api/comptabilite/ecritures/[id]/valider/route");
const axesRoute = await import("@/app/api/comptabilite/analytique/axes/route");
const sectionsRoute = await import("@/app/api/comptabilite/analytique/axes/[id]/sections/route");
const ventilationRoute = await import("@/app/api/comptabilite/analytique/lignes/[id]/ventilation/route");
const budgetsRoute = await import("@/app/api/comptabilite/budgets/route");
const budgetRoute = await import("@/app/api/comptabilite/budgets/[id]/route");
const lignesRoute = await import("@/app/api/comptabilite/budgets/[id]/lignes/route");
const validerRoute = await import("@/app/api/comptabilite/budgets/[id]/valider/route");
const controleRoute = await import("@/app/api/comptabilite/budgets/[id]/controle/route");
const initialiserRoute = await import("@/app/api/comptabilite/budgets/[id]/initialiser/route");

const NOM_TEMOIN = "ZZ TEST API BUDGET";
const ACCES_TOTAL = [{ ressource: "*", actions: ["*"] }];
const LECTURE_SEULE = [{ ressource: "comptabilite", actions: ["read"] }];

let adminId: number;
let contribuableId: number;
let exercice2025: number;
let exercice2026: number;
let axeId: number;
let sectionBoul: number;
let sectionPat: number;
let budgetId: number;
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
      await db.delete(schema.cptaBudgets).where(eq(schema.cptaBudgets.exerciceId, ex.id));
      await db.delete(schema.cptaSequences).where(eq(schema.cptaSequences.exerciceId, ex.id));
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

async function ecritureValidee(exerciceId: number, date: string, libelle: string, lignes: { compteId: number; debit?: string; credit?: string }[]) {
  const creation = await ecrituresRoute.POST(post("", { exerciceId, journalId: journaux["BQ"], dateEcriture: date, libelle, lignes }));
  const e = await creation.json();
  if (creation.status !== 201) throw new Error(`Création refusée : ${JSON.stringify(e)}`);
  const res = await validerEcritureRoute.POST(post(""), ctx(e.id));
  if (res.status !== 200) throw new Error(`Validation refusée : ${JSON.stringify(await res.json())}`);
  return db.select().from(schema.cptaLignesEcriture).where(eq(schema.cptaLignesEcriture.ecritureId, e.id)).orderBy(schema.cptaLignesEcriture.ordre);
}

beforeAll(async () => {
  await nettoyer();
  const [admin] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (!admin) throw new Error("Base non peuplée : lancez `npm run db:seed` d'abord.");
  adminId = admin.id;
  const [ctb] = await db.insert(schema.contribuables).values({ nom: NOM_TEMOIN, niu: "ZZBUD000000001", regimeFiscal: "REEL" }).returning();
  contribuableId = ctb.id;

  connecte();
  const ouvrir = async (libelle: string, dateDebut: string, dateFin: string) => {
    const res = await exercicesRoute.POST(post("", { contribuableId, libelle, dateDebut, dateFin }));
    const e = await res.json();
    if (res.status !== 201) throw new Error(`Ouverture refusée : ${JSON.stringify(e)}`);
    return e.id as number;
  };
  exercice2025 = await ouvrir("Exercice 2025", "2025-01-01", "2025-12-31");
  exercice2026 = await ouvrir("Exercice 2026", "2026-01-01", "2026-12-31");
  for (const c of await db.select({ id: schema.cptaComptes.id, numero: schema.cptaComptes.numero }).from(schema.cptaComptes).where(eq(schema.cptaComptes.contribuableId, contribuableId))) {
    comptes[c.numero] = c.id;
  }
  for (const j of await db.select({ id: schema.cptaJournaux.id, code: schema.cptaJournaux.code }).from(schema.cptaJournaux).where(eq(schema.cptaJournaux.contribuableId, contribuableId))) {
    journaux[j.code] = j.id;
  }
  const axe = await (await axesRoute.POST(post("", { contribuableId, code: "ACT", libelle: "Activité" }))).json();
  axeId = axe.id;
  sectionBoul = (await (await sectionsRoute.POST(post("", { code: "BOUL", libelle: "Boulangerie" }), ctx(axeId))).json()).id;
  sectionPat = (await (await sectionsRoute.POST(post("", { code: "PAT", libelle: "Pâtisserie" }), ctx(axeId))).json()).id;

  // 2025 : 1 200 000 d'achats, 6 000 000 de ventes.
  await ecritureValidee(exercice2025, "2025-06-30", "Achats 2025", [
    { compteId: comptes["601"], debit: "1200000" },
    { compteId: comptes["5211"], credit: "1200000" },
  ]);
  await ecritureValidee(exercice2025, "2025-06-30", "Ventes 2025", [
    { compteId: comptes["5211"], debit: "6000000" },
    { compteId: comptes["701"], credit: "6000000" },
  ]);
  // 2026 : en février, 350 000 d'achats ventilés 300/50, 90 000 de loyer non prévu, 1 400 000 de ventes ; en avril, hors contrôle à fin février.
  const achat = await ecritureValidee(exercice2026, "2026-02-10", "Farine", [
    { compteId: comptes["601"], debit: "350000" },
    { compteId: comptes["5211"], credit: "350000" },
  ]);
  await ventilationRoute.PUT(put("", { axeId, ventilations: [{ sectionId: sectionBoul, montant: "300000" }, { sectionId: sectionPat, montant: "50000" }] }), ctx(achat[0].id));
  await ecritureValidee(exercice2026, "2026-02-15", "Loyer", [
    { compteId: comptes["6222"], debit: "90000" },
    { compteId: comptes["5211"], credit: "90000" },
  ]);
  const vente = await ecritureValidee(exercice2026, "2026-02-20", "Ventes", [
    { compteId: comptes["5211"], debit: "1400000" },
    { compteId: comptes["701"], credit: "1400000" },
  ]);
  await ventilationRoute.PUT(put("", { axeId, ventilations: [{ sectionId: sectionBoul, montant: "1400000" }] }), ctx(vente[1].id));
  await ecritureValidee(exercice2026, "2026-04-05", "Trop tard", [
    { compteId: comptes["601"], debit: "999999" },
    { compteId: comptes["5211"], credit: "999999" },
  ]);
});

afterAll(async () => {
  await nettoyer();
});

describe("budget", () => {
  it("se crée sur un exercice, adossé à un axe", async () => {
    connecte();
    const res = await budgetsRoute.POST(post("", { exerciceId: exercice2026, libelle: "Budget initial 2026", axeId }));
    expect(res.status).toBe(201);
    const b = await res.json();
    budgetId = b.id;
    expect(b.statut).toBe("BROUILLON");
    expect(b.exercice.nbMois).toBe(12);
    expect(b.lignes).toEqual([]);
    const liste = await (await budgetsRoute.GET(get(`/api/comptabilite/budgets?exerciceId=${exercice2026}`))).json();
    expect(liste).toHaveLength(1);
    expect(liste[0].axeCode).toBe("ACT");
  });

  it("reçoit ses lignes, totaux compris", async () => {
    connecte();
    const res = await lignesRoute.PUT(
      put("", {
        lignes: [
          { compteId: comptes["601"], sectionId: sectionBoul, montantAnnuel: "1200000" },
          { compteId: comptes["601"], sectionId: sectionPat, montantAnnuel: "600000" },
          { compteId: comptes["6611"], montantAnnuel: "2400000" },
          { compteId: comptes["701"], sectionId: sectionBoul, montantAnnuel: "6000000", mensualisation: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2] },
        ],
      }),
      ctx(budgetId),
    );
    const b = await res.json();
    expect(res.status, JSON.stringify(b)).toBe(200);
    expect(b.lignes).toHaveLength(4);
    expect(b.lignes[0]).toMatchObject({ compteNumero: "601", sectionCode: "BOUL", montantAnnuel: "1200000.00" });
    expect(b.totaux).toEqual({ charges: "4200000.00", produits: "6000000.00", resultat: "1800000.00" });
  });

  it("refuse un compte de bilan, une section d'un autre axe, un doublon, une mensualisation bancale", async () => {
    connecte();
    const bilan = await lignesRoute.PUT(put("", { lignes: [{ compteId: comptes["5211"], montantAnnuel: "1" }] }), ctx(budgetId));
    expect(bilan.status).toBe(400);
    expect((await bilan.json()).error.message).toMatch(/classes 6, 7 et 8/);
    expect((await lignesRoute.PUT(put("", { lignes: [{ compteId: comptes["601"], sectionId: 999999, montantAnnuel: "1" }] }), ctx(budgetId))).status).toBe(400);
    expect(
      (
        await lignesRoute.PUT(
          put("", {
            lignes: [
              { compteId: comptes["601"], sectionId: sectionBoul, montantAnnuel: "1" },
              { compteId: comptes["601"], sectionId: sectionBoul, montantAnnuel: "2" },
            ],
          }),
          ctx(budgetId),
        )
      ).status,
    ).toBe(400);
    expect((await lignesRoute.PUT(put("", { lignes: [{ compteId: comptes["601"], montantAnnuel: "1", mensualisation: [1, 2] }] }), ctx(budgetId))).status).toBe(400);
    // Les lignes précédentes sont intactes : un refus n'écrit rien.
    expect((await (await budgetRoute.GET(get(""), ctx(budgetId))).json()).lignes).toHaveLength(4);
  });

  it("se contrôle à fin février : budget à date, réalisé par section, hors budget, écarts", async () => {
    connecte();
    const res = await controleRoute.GET(get(`/api/comptabilite/budgets/${budgetId}/controle?jusquAu=2026-02-28`), ctx(budgetId));
    expect(res.status).toBe(200);
    const c = await res.json();
    expect(c.moisEcoules).toBe(2);
    expect(c.sections.map((s: { code: string }) => s.code)).toEqual(["BOUL", "PAT"]);
    const ligne = (numero: string, sectionId: number | null) => c.lignes.find((l: { compteNumero: string; sectionId: number | null }) => l.compteNumero === numero && l.sectionId === sectionId);
    expect(ligne("601", sectionBoul)).toMatchObject({ budgetAnnuel: "1200000.00", budgetADate: "200000.00", realise: "300000.00", ecart: "100000.00", ecartPct: 50, consommationPct: 25, horsBudget: false });
    expect(ligne("601", sectionPat)).toMatchObject({ budgetADate: "100000.00", realise: "50000.00", ecart: "-50000.00" });
    expect(ligne("6222", null)).toMatchObject({ budgetAnnuel: "0.00", realise: "90000.00", horsBudget: true });
    expect(ligne("6611", null)).toMatchObject({ budgetADate: "400000.00", realise: "0.00", ecart: "-400000.00" });
    // Décembre pèse double : 6 000 000 / 13 par mois ordinaire, 2 mois.
    const ventes = ligne("701", sectionBoul);
    expect(ventes.budgetADate).toBe("923076.92");
    expect(ventes.realise).toBe("1400000.00");
    expect(c.charges).toMatchObject({ budgetADate: "700000.00", realise: "440000.00" });
    expect(c.produits).toMatchObject({ budgetADate: "923076.92", realise: "1400000.00" });
    expect(c.resultat.realise).toBe("960000.00");
    // L'achat d'avril n'y est pas.
    expect(c.lignes.every((l: { realise: string }) => l.realise !== "999999.00")).toBe(true);
  });

  it("refuse une date hors exercice", async () => {
    connecte();
    expect((await controleRoute.GET(get(`/api/comptabilite/budgets/${budgetId}/controle?jusquAu=2027-01-31`), ctx(budgetId))).status).toBe(400);
  });

  it("s'initialise depuis le réalisé de l'exercice précédent, avec un coefficient", async () => {
    connecte();
    const revise = await (await budgetsRoute.POST(post("", { exerciceId: exercice2026, libelle: "Comme 2025 + 5 %" }))).json();
    const res = await initialiserRoute.POST(post("", { exerciceSourceId: exercice2025, coefficientPct: 105 }), ctx(revise.id));
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.lignes.map((l: { compteNumero: string; montantAnnuel: string }) => [l.compteNumero, l.montantAnnuel])).toEqual([
      ["601", "1260000.00"],
      ["701", "6300000.00"],
    ]);
    expect((await budgetRoute.DELETE(get(""), ctx(revise.id))).status).toBe(204);
  });

  it("validé, il ne bouge plus ; vide, il ne se valide pas", async () => {
    connecte();
    const vide = await (await budgetsRoute.POST(post("", { exerciceId: exercice2026, libelle: "Vide" }))).json();
    expect((await validerRoute.POST(post(""), ctx(vide.id))).status).toBe(400);
    expect((await budgetRoute.DELETE(get(""), ctx(vide.id))).status).toBe(204);

    const res = await validerRoute.POST(post(""), ctx(budgetId));
    expect(res.status).toBe(200);
    expect((await res.json()).statut).toBe("VALIDE");
    expect((await lignesRoute.PUT(put("", { lignes: [] }), ctx(budgetId))).status).toBe(409);
    expect((await budgetRoute.PATCH(patch("", { libelle: "X" }), ctx(budgetId))).status).toBe(409);
    expect((await budgetRoute.DELETE(get(""), ctx(budgetId))).status).toBe(409);
    // Le contrôle, lui, reste ouvert.
    expect((await controleRoute.GET(get(`/api/comptabilite/budgets/${budgetId}/controle`), ctx(budgetId))).status).toBe(200);
  });

  it("refuse 403 en lecture seule sur l'écriture", async () => {
    connecte(LECTURE_SEULE);
    expect((await budgetRoute.GET(get(""), ctx(budgetId))).status).toBe(200);
    expect((await budgetsRoute.POST(post("", { exerciceId: exercice2026, libelle: "Non" }))).status).toBe(403);
    expect((await lignesRoute.PUT(put("", { lignes: [] }), ctx(budgetId))).status).toBe(403);
  });
});
