import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

/**
 * Tests d'intégration du tableau de bord de gestion mensuel (A1, docs/23).
 *
 * Handlers réels, base réelle, session simulée. Un contribuable témoin a un
 * exercice 2026 avec un achat ventilé sur deux sections, un loyer non
 * ventilé, une vente ventilée sur une seule section, et un budget validé par
 * section. On lit le tableau à fin février, pour toute l'entité puis section
 * par section.
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
const lignesRoute = await import("@/app/api/comptabilite/budgets/[id]/lignes/route");
const validerBudgetRoute = await import("@/app/api/comptabilite/budgets/[id]/valider/route");
const pilotageRoute = await import("@/app/api/comptabilite/pilotage/route");

const NOM_TEMOIN = "ZZ TEST API PILOTAGE";
const ACCES_TOTAL = [{ ressource: "*", actions: ["*"] }];
const LECTURE_SEULE = [{ ressource: "comptabilite", actions: ["read"] }];
const SANS_COMPTA = [{ ressource: "contribuables", actions: ["read"] }];

const fcfa = (n: number) => n * 100;

let adminId: number;
let contribuableId: number;
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

async function pilotage(query: string) {
  const res = await pilotageRoute.GET(get(`/api/comptabilite/pilotage?exerciceId=${exercice2026}${query}`));
  const corps = await res.json();
  return { status: res.status, corps };
}

beforeAll(async () => {
  await nettoyer();
  const [admin] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (!admin) throw new Error("Base non peuplée : lancez `npm run db:seed` d'abord.");
  adminId = admin.id;
  const [ctb] = await db.insert(schema.contribuables).values({ nom: NOM_TEMOIN, niu: "ZZPIL000000001", regimeFiscal: "REEL" }).returning();
  contribuableId = ctb.id;

  connecte();
  const res = await exercicesRoute.POST(post("", { contribuableId, libelle: "Exercice 2026", dateDebut: "2026-01-01", dateFin: "2026-12-31" }));
  const e = await res.json();
  if (res.status !== 201) throw new Error(`Ouverture refusée : ${JSON.stringify(e)}`);
  exercice2026 = e.id;

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

  // Janvier : rien. Février : 350 000 d'achats ventilés 300/50, 90 000 de loyer non ventilé, 1 400 000 de ventes tout Boulangerie. Avril : hors période.
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

  // Budget validé, uniforme : 500 000 de ventes Boulangerie par mois, 100 000 + 50 000 d'achats, 200 000 de salaires non sectionnés.
  const b = await (await budgetsRoute.POST(post("", { exerciceId: exercice2026, libelle: "Budget 2026", axeId }))).json();
  budgetId = b.id;
  await lignesRoute.PUT(
    put("", {
      lignes: [
        { compteId: comptes["701"], sectionId: sectionBoul, montantAnnuel: "6000000" },
        { compteId: comptes["601"], sectionId: sectionBoul, montantAnnuel: "1200000" },
        { compteId: comptes["601"], sectionId: sectionPat, montantAnnuel: "600000" },
        { compteId: comptes["6611"], montantAnnuel: "2400000" },
      ],
    }),
    ctx(budgetId),
  );
  await validerBudgetRoute.POST(post(""), ctx(budgetId));
});

afterAll(async () => {
  await nettoyer();
});

describe("pilotage — toute l'entité", () => {
  it("découpe l'exercice par mois jusqu'à la date et cumule", async () => {
    connecte();
    const { status, corps } = await pilotage("&jusquAu=2026-02-28");
    expect(status, JSON.stringify(corps)).toBe(200);
    expect(corps.mois.map((m: { mois: string }) => m.mois)).toEqual(["2026-01", "2026-02"]);
    expect(corps.section).toBeNull();

    const [janv, fev] = corps.mois;
    expect(janv.chiffreAffaires).toBe(0);
    expect(fev.chiffreAffaires).toBe(fcfa(1_400_000));
    expect(fev.margeCommerciale).toBe(fcfa(1_050_000));
    expect(fev.tauxMarge).toBe(75);
    expect(fev.valeurAjoutee).toBe(fcfa(960_000));
    expect(fev.resultatNet).toBe(fcfa(960_000));
    expect(corps.cumul.chiffreAffaires).toBe(fcfa(1_400_000));
    expect(corps.cumul.resultatNet).toBe(fcfa(960_000));
  });

  it("confronte au dernier budget validé, mensualisé", async () => {
    connecte();
    const { corps } = await pilotage("&jusquAu=2026-02-28");
    expect(corps.budget).toMatchObject({ id: budgetId, libelle: "Budget 2026", statut: "VALIDE" });
    expect(corps.mois[0].budgetChiffreAffaires).toBe(fcfa(500_000));
    expect(corps.mois[0].budgetResultat).toBe(fcfa(500_000 - 100_000 - 50_000 - 200_000));
    expect(corps.cumul.budgetChiffreAffaires).toBe(fcfa(1_000_000));
    expect(corps.cumul.budgetResultat).toBe(fcfa(300_000));
  });

  it("ignore un brouillon et s'arrête à la fin de l'exercice", async () => {
    connecte();
    const { corps } = await pilotage("&jusquAu=2026-12-31");
    expect(corps.mois).toHaveLength(12);
    expect(corps.mois[3].margeCommerciale).toBe(-fcfa(999_999));
  });
});

describe("pilotage — par section", () => {
  it("ne compte que la part ventilée sur la section", async () => {
    connecte();
    const boul = (await pilotage(`&jusquAu=2026-02-28&sectionId=${sectionBoul}`)).corps;
    expect(boul.section).toMatchObject({ id: sectionBoul, code: "BOUL" });
    expect(boul.cumul.chiffreAffaires).toBe(fcfa(1_400_000));
    expect(boul.cumul.margeCommerciale).toBe(fcfa(1_100_000));
    // Le loyer n'est pas ventilé : il n'appartient à aucune section.
    expect(boul.cumul.valeurAjoutee).toBe(fcfa(1_100_000));

    const pat = (await pilotage(`&jusquAu=2026-02-28&sectionId=${sectionPat}`)).corps;
    expect(pat.cumul.chiffreAffaires).toBe(0);
    expect(pat.cumul.margeCommerciale).toBe(-fcfa(50_000));
    expect(pat.cumul.tauxMarge).toBeNull();
  });

  it("réduit le budget aux lignes de la section", async () => {
    connecte();
    const boul = (await pilotage(`&jusquAu=2026-02-28&sectionId=${sectionBoul}`)).corps;
    expect(boul.mois[0].budgetChiffreAffaires).toBe(fcfa(500_000));
    expect(boul.mois[0].budgetResultat).toBe(fcfa(400_000));
    const pat = (await pilotage(`&jusquAu=2026-02-28&sectionId=${sectionPat}`)).corps;
    expect(pat.mois[0].budgetChiffreAffaires).toBe(0);
    expect(pat.mois[0].budgetResultat).toBe(-fcfa(50_000));
  });

  it("refuse une section d'un autre contribuable", async () => {
    connecte();
    const { status } = await pilotage("&sectionId=999999");
    expect(status).toBe(404);
  });
});

describe("pilotage — garde-fous", () => {
  it("refuse une date hors exercice et un budget d'un autre exercice", async () => {
    connecte();
    expect((await pilotage("&jusquAu=2027-01-15")).status).toBe(400);
    expect((await pilotage("&budgetId=999999")).status).toBe(404);
  });

  it("se lit en lecture seule, pas sans droit sur la comptabilité", async () => {
    connecte(LECTURE_SEULE);
    expect((await pilotage("")).status).toBe(200);
    connecte(SANS_COMPTA);
    expect((await pilotage("")).status).toBe(403);
  });
});
