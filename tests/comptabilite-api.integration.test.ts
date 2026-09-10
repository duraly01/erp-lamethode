import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { and, eq, ne } from "drizzle-orm";

/**
 * Tests d'intégration de l'API de comptabilité générale.
 *
 * Les handlers de route sont appelés tels quels, contre la vraie base : Zod,
 * RBAC, services, transactions et contraintes PostgreSQL sont tous exercés.
 * Seule la session est simulée — c'est la seule pièce qui exige un navigateur.
 *
 * Prérequis : `docker compose up -d --wait db` puis `npm run db:migrate:local`.
 */

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/session", () => session);

const { db } = await import("@/db");
const schema = await import("@/db/schema");

const exercicesRoute = await import("@/app/api/comptabilite/exercices/route");
const comptesRoute = await import("@/app/api/comptabilite/comptes/route");
const journauxRoute = await import("@/app/api/comptabilite/journaux/route");
const ecrituresRoute = await import("@/app/api/comptabilite/ecritures/route");
const ecritureRoute = await import("@/app/api/comptabilite/ecritures/[id]/route");
const validerRoute = await import(
  "@/app/api/comptabilite/ecritures/[id]/valider/route"
);
const contrepasserRoute = await import(
  "@/app/api/comptabilite/ecritures/[id]/contrepasser/route"
);
const lettragesRoute = await import(
  "@/app/api/comptabilite/comptes/[id]/lettrages/route"
);
const balanceRoute = await import("@/app/api/comptabilite/balance/route");

const NOM_TEMOIN = "ZZ TEST API COMPTABILITE";

const ACCES_TOTAL = [{ ressource: "*", actions: ["*"] }];
const SANS_COMPTA = [{ ressource: "contribuables", actions: ["read"] }];
const LECTURE_SEULE = [{ ressource: "comptabilite", actions: ["read"] }];

let adminId: number;
let contribuableId: number;
let exerciceId: number;
let journalAchatId: number;
let compte601 = 0;
let compte4452 = 0;
let compte401 = 0;
let compte521 = 0;
let tiersId: number;

function connecte(permissions: unknown = ACCES_TOTAL) {
  session.getSessionUser.mockResolvedValue({
    id: adminId,
    nom: "Test",
    email: "test@lamethode.cm",
    roleNom: "ADMIN",
    permissions,
  });
}

function deconnecte() {
  session.getSessionUser.mockResolvedValue(null);
}

const get = (url: string) => new NextRequest(`http://localhost${url}`);

const post = (url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const patch = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

async function nettoyer() {
  const temoins = await db
    .select({ id: schema.contribuables.id })
    .from(schema.contribuables)
    .where(eq(schema.contribuables.nom, NOM_TEMOIN));

  for (const { id } of temoins) {
    const exercices = await db
      .select({ id: schema.cptaExercices.id })
      .from(schema.cptaExercices)
      .where(eq(schema.cptaExercices.contribuableId, id));

    for (const ex of exercices) {
      await db
        .delete(schema.cptaSequences)
        .where(eq(schema.cptaSequences.exerciceId, ex.id));
      await db
        .update(schema.cptaEcritures)
        .set({ contrepasseEcritureId: null })
        .where(eq(schema.cptaEcritures.exerciceId, ex.id));
      await db
        .delete(schema.cptaEcritures)
        .where(eq(schema.cptaEcritures.exerciceId, ex.id));
    }

    const comptes = await db
      .select({ id: schema.cptaComptes.id })
      .from(schema.cptaComptes)
      .where(eq(schema.cptaComptes.contribuableId, id));
    for (const c of comptes) {
      await db
        .delete(schema.cptaLettrages)
        .where(eq(schema.cptaLettrages.compteId, c.id));
    }

    await db
      .delete(schema.cptaExercices)
      .where(eq(schema.cptaExercices.contribuableId, id));
    await db
      .delete(schema.cptaTaxes)
      .where(eq(schema.cptaTaxes.contribuableId, id));
    await db
      .delete(schema.cptaJournaux)
      .where(eq(schema.cptaJournaux.contribuableId, id));
    await db
      .delete(schema.cptaTiers)
      .where(eq(schema.cptaTiers.contribuableId, id));
    await db
      .delete(schema.cptaComptes)
      .where(eq(schema.cptaComptes.contribuableId, id));
    await db.delete(schema.contribuables).where(eq(schema.contribuables.id, id));
  }
}

beforeAll(async () => {
  await nettoyer();

  const [admin] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .limit(1);
  if (!admin) {
    throw new Error("Base non peuplée : lancez `npm run db:seed` d'abord.");
  }
  adminId = admin.id;

  const [ctb] = await db
    .insert(schema.contribuables)
    .values({ nom: NOM_TEMOIN, niu: "ZZAPI000000001", regimeFiscal: "REEL" })
    .returning();
  contribuableId = ctb.id;
});

afterAll(async () => {
  await nettoyer();
});

// ---------------------------------------------------------------------------

describe("garde d'autorisation", () => {
  it("refuse 401 sans session", async () => {
    deconnecte();
    const res = await exercicesRoute.GET(
      get(`/api/comptabilite/exercices?contribuableId=${contribuableId}`),
    );
    expect(res.status).toBe(401);
  });

  it("refuse 403 sans la permission comptabilite", async () => {
    connecte(SANS_COMPTA);
    const res = await exercicesRoute.GET(
      get(`/api/comptabilite/exercices?contribuableId=${contribuableId}`),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("forbidden");
  });

  it("refuse 403 en lecture seule sur une création", async () => {
    connecte(LECTURE_SEULE);
    const res = await exercicesRoute.POST(
      post("/api/comptabilite/exercices", {
        contribuableId,
        libelle: "Exercice 2026",
        dateDebut: "2026-01-01",
        dateFin: "2026-12-31",
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("validation des entrées", () => {
  it("refuse 422 quand un paramètre obligatoire manque", async () => {
    connecte();
    const res = await exercicesRoute.GET(get("/api/comptabilite/exercices"));
    expect(res.status).toBe(422);
  });

  it("refuse 422 sur une date mal formée", async () => {
    connecte();
    const res = await exercicesRoute.POST(
      post("/api/comptabilite/exercices", {
        contribuableId,
        libelle: "Exercice",
        dateDebut: "01/01/2026",
        dateFin: "2026-12-31",
      }),
    );
    expect(res.status).toBe(422);
  });
});

describe("ouverture d'exercice", () => {
  it("ouvre l'exercice et dépose le référentiel", async () => {
    connecte();
    const res = await exercicesRoute.POST(
      post("/api/comptabilite/exercices", {
        contribuableId,
        libelle: "Exercice 2026",
        dateDebut: "2026-01-01",
        dateFin: "2026-12-31",
      }),
    );
    expect(res.status).toBe(201);
    const exercice = await res.json();
    exerciceId = exercice.id;
    expect(exercice.statut).toBe("OUVERT");
  });

  it("expose le plan comptable SYSCOHADA", async () => {
    connecte();
    const res = await comptesRoute.GET(
      get(`/api/comptabilite/comptes?contribuableId=${contribuableId}`),
    );
    expect(res.status).toBe(200);
    const comptes = await res.json();
    expect(comptes).toHaveLength(181);

    const parNumero = new Map<string, number>(
      comptes.map((c: { numero: string; id: number }) => [c.numero, c.id]),
    );
    compte601 = parNumero.get("601")!;
    compte4452 = parNumero.get("4452")!;
    compte401 = parNumero.get("401")!;
    compte521 = parNumero.get("5211")!;
    expect(compte601).toBeTruthy();
  });

  it("expose les journaux", async () => {
    connecte();
    const res = await journauxRoute.GET(
      get(`/api/comptabilite/journaux?contribuableId=${contribuableId}`),
    );
    const journaux = await res.json();
    expect(journaux).toHaveLength(6);
    journalAchatId = journaux.find(
      (j: { code: string }) => j.code === "AC",
    ).id;
  });

  it("refuse 409 un exercice qui chevauche", async () => {
    connecte();
    const res = await exercicesRoute.POST(
      post("/api/comptabilite/exercices", {
        contribuableId,
        libelle: "Chevauche",
        dateDebut: "2026-06-01",
        dateFin: "2027-05-31",
      }),
    );
    expect(res.status).toBe(409);
  });
});

describe("écritures", () => {
  let brouillonId = 0;

  const achat = () => ({
    exerciceId,
    journalId: journalAchatId,
    dateEcriture: "2026-03-15",
    libelle: "Facture fournisseur AF-2026-041",
    lignes: [
      { compteId: compte601, debit: "10000.00" },
      { compteId: compte4452, debit: "1925.00" },
      { compteId: compte401, tiersId, credit: "11925.00" },
    ],
  });

  beforeAll(async () => {
    const [t] = await db
      .insert(schema.cptaTiers)
      .values({
        contribuableId,
        code: "F001",
        raisonSociale: "Fournisseur test",
        types: ["FOURNISSEUR"],
        compteId: compte401,
      })
      .returning();
    tiersId = t.id;
  });

  it("refuse 422 un montant illisible", async () => {
    connecte();
    const res = await ecrituresRoute.POST(
      post("/api/comptabilite/ecritures", {
        exerciceId,
        journalId: journalAchatId,
        dateEcriture: "2026-03-15",
        libelle: "Montant fautif",
        lignes: [{ compteId: compte601, debit: "dix mille" }],
      }),
    );
    expect(res.status).toBe(422);
  });

  it("crée un brouillon", async () => {
    connecte();
    const res = await ecrituresRoute.POST(
      post("/api/comptabilite/ecritures", achat()),
    );
    expect(res.status).toBe(201);
    const ecriture = await res.json();
    brouillonId = ecriture.id;
    expect(ecriture.statut).toBe("BROUILLON");
    expect(ecriture.numeroPiece).toBeNull();
  });

  it("rend l'écriture avec ses lignes", async () => {
    connecte();
    const res = await ecritureRoute.GET(
      get(`/api/comptabilite/ecritures/${brouillonId}`),
      ctx(brouillonId),
    );
    const ecriture = await res.json();
    expect(ecriture.lignes).toHaveLength(3);
  });

  it("refuse 422 la validation d'une écriture déséquilibrée, avec le détail", async () => {
    connecte();
    const cree = await ecrituresRoute.POST(
      post("/api/comptabilite/ecritures", {
        ...achat(),
        lignes: [
          { compteId: compte601, debit: "10000.00" },
          { compteId: compte401, tiersId, credit: "9000.00" },
        ],
      }),
    );
    const brouillon = await cree.json();

    const res = await validerRoute.POST(
      post(`/api/comptabilite/ecritures/${brouillon.id}/valider`),
      ctx(brouillon.id),
    );
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.error.code).toBe("ecriture_invalide");
    const codes = body.error.details.map((d: { code: string }) => d.code);
    expect(codes).toContain("DESEQUILIBRE");
  });

  it("valide et numérote", async () => {
    connecte();
    const res = await validerRoute.POST(
      post(`/api/comptabilite/ecritures/${brouillonId}/valider`),
      ctx(brouillonId),
    );
    expect(res.status).toBe(200);
    const ecriture = await res.json();
    expect(ecriture.statut).toBe("VALIDEE");
    expect(ecriture.numeroPiece).toMatch(/^AC2026-\d{5}$/);
  });

  it("refuse 409 la modification d'une écriture validée", async () => {
    connecte();
    const res = await ecritureRoute.PATCH(
      patch(`/api/comptabilite/ecritures/${brouillonId}`, {
        journalId: journalAchatId,
        dateEcriture: "2026-04-01",
        libelle: "Tentative",
        lignes: [],
      }),
      ctx(brouillonId),
    );
    expect(res.status).toBe(409);
  });

  it("refuse 409 la suppression d'une écriture validée", async () => {
    connecte();
    const res = await ecritureRoute.DELETE(
      new NextRequest(`http://localhost/api/comptabilite/ecritures/${brouillonId}`, {
        method: "DELETE",
      }),
      ctx(brouillonId),
    );
    expect(res.status).toBe(409);
  });

  it("contre-passe, ce qui relève de la permission « supprimer »", async () => {
    connecte(LECTURE_SEULE);
    const refus = await contrepasserRoute.POST(
      post(`/api/comptabilite/ecritures/${brouillonId}/contrepasser`, {}),
      ctx(brouillonId),
    );
    expect(refus.status).toBe(403);

    connecte();
    const res = await contrepasserRoute.POST(
      post(`/api/comptabilite/ecritures/${brouillonId}/contrepasser`, {
        dateContrepassation: "2026-06-01",
      }),
      ctx(brouillonId),
    );
    expect(res.status).toBe(201);
    const contre = await res.json();
    expect(contre.contrepasseEcritureId).toBe(brouillonId);
    expect(contre.numeroPiece).toMatch(/^AC2026-\d{5}$/);
  });
});

describe("lettrage", () => {
  // Le refus d'un groupe qui ne se solde pas est éprouvé par les tests
  // unitaires et par `npm run verify:comptabilite`. Ce qui se vérifie ici est
  // propre à la couche API : une sélection qui ne correspond pas à des lignes
  // réelles du compte doit être rejetée en bloc, jamais lettrée partiellement.
  it("refuse 400 une sélection qui ne correspond pas aux lignes du compte", async () => {
    connecte();
    const lignes = await db
      .select({ id: schema.cptaLignesEcriture.id })
      .from(schema.cptaLignesEcriture)
      .where(eq(schema.cptaLignesEcriture.compteId, compte401));

    const res = await lettragesRoute.POST(
      post(`/api/comptabilite/comptes/${compte401}/lettrages`, {
        // Deux identifiants demandés, une seule ligne réelle derrière.
        ligneIds: [lignes[0].id, lignes[0].id],
      }),
      ctx(compte401),
    );
    expect(res.status).toBe(400);
  });

  it("lettre une facture et sa contre-passation", async () => {
    connecte();
    // Seules les lignes d'écritures validées sont lettrables : celles d'un
    // brouillon ne sont pas encore des mouvements. Le service les écarte, la
    // sélection doit donc les écarter aussi.
    const lignes = await db
      .select({ id: schema.cptaLignesEcriture.id })
      .from(schema.cptaLignesEcriture)
      .innerJoin(
        schema.cptaEcritures,
        eq(schema.cptaLignesEcriture.ecritureId, schema.cptaEcritures.id),
      )
      .where(
        and(
          eq(schema.cptaLignesEcriture.compteId, compte401),
          ne(schema.cptaEcritures.statut, "BROUILLON"),
        ),
      );

    const res = await lettragesRoute.POST(
      post(`/api/comptabilite/comptes/${compte401}/lettrages`, {
        ligneIds: lignes.map((l) => l.id),
      }),
      ctx(compte401),
    );
    expect(res.status).toBe(201);
    const lettrage = await res.json();
    expect(lettrage.code).toBe("A");
  });

  it("refuse 409 le lettrage d'un compte non lettrable", async () => {
    connecte();
    const res = await lettragesRoute.POST(
      post(`/api/comptabilite/comptes/${compte601}/lettrages`, {
        ligneIds: [1, 2],
      }),
      ctx(compte601),
    );
    expect(res.status).toBe(409);
  });
});

describe("balance", () => {
  it("rend une balance équilibrée", async () => {
    connecte();
    const res = await balanceRoute.GET(
      get(`/api/comptabilite/balance?exerciceId=${exerciceId}`),
    );
    expect(res.status).toBe(200);
    const balance = await res.json();
    expect(balance.totaux.equilibree).toBe(true);
    expect(balance.totaux.totalDebit).toBe(balance.totaux.totalCredit);
  });

  it("refuse 401 sans session", async () => {
    deconnecte();
    const res = await balanceRoute.GET(
      get(`/api/comptabilite/balance?exerciceId=${exerciceId}`),
    );
    expect(res.status).toBe(401);
  });
});

describe("compte 521 disponible pour la suite", () => {
  it("est bien rapprochable", async () => {
    const [c] = await db
      .select()
      .from(schema.cptaComptes)
      .where(eq(schema.cptaComptes.id, compte521));
    expect(c.rapprochable).toBe(true);
  });
});
