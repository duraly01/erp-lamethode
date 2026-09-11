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
const etatsRoute = await import(
  "@/app/api/comptabilite/etats-financiers/route"
);
const tvaRoute = await import("@/app/api/comptabilite/tva/route");

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

describe("états financiers", () => {
  /**
   * Retrouve un poste dans une section de l'état rendue par l'API.
   *
   * Les champs sont ceux du JSON : `net`/`netPrecedent` au bilan,
   * `montant`/`montantPrecedent` au compte de résultat, chacun absent de
   * l'autre section — d'où le type partiel.
   */
  type LignePoste = {
    code: string;
    net?: number;
    netPrecedent?: number | null;
    montant?: number;
    montantPrecedent?: number | null;
  };
  const poste = (lignes: LignePoste[], code: string) =>
    lignes.find((l) => l.code === code);

  it("rend un bilan équilibré sur les écritures réellement saisies", async () => {
    connecte();
    const res = await etatsRoute.GET(
      get(`/api/comptabilite/etats-financiers?exerciceId=${exerciceId}`),
    );
    expect(res.status).toBe(200);

    const etats = await res.json();
    // L'équilibre du bilan sur de vraies écritures est la preuve de bout en
    // bout que le rattachement des comptes couvre ce que l'application produit.
    expect(etats.bilan.ecart).toBe(0);
    expect(etats.bilan.equilibre).toBe(true);
  });

  it("ne laisse aucun compte hors des états", async () => {
    connecte();
    const res = await etatsRoute.GET(
      get(`/api/comptabilite/etats-financiers?exerciceId=${exerciceId}`),
    );
    const etats = await res.json();
    expect(etats.comptesNonRattaches).toEqual([]);
  });

  /**
   * Les écritures des blocs précédents ont été contre-passées : leurs soldes se
   * neutralisent, et un état calculé dessus est nul partout. Ce bloc pose donc
   * ses propres écritures plutôt que de s'appuyer sur celles d'un autre test.
   */
  async function poserUnPetitExercice() {
    connecte();
    const achat = await ecrituresRoute.POST(
      post("/api/comptabilite/ecritures", {
        exerciceId,
        journalId: journalAchatId,
        dateEcriture: "2026-09-10",
        libelle: "Achat à crédit pour les états financiers",
        lignes: [
          { compteId: compte601, debit: "50000.00" },
          { compteId: compte4452, debit: "9625.00" },
          { compteId: compte401, tiersId, credit: "59625.00" },
        ],
      }),
    );
    expect(achat.status).toBe(201);
    const a = await achat.json();
    expect(
      (await validerRoute.POST(post(""), ctx(a.id))).status,
    ).toBe(200);

    const financement = await ecrituresRoute.POST(
      post("/api/comptabilite/ecritures", {
        exerciceId,
        journalId: journalAchatId,
        dateEcriture: "2026-09-11",
        libelle: "Encaissement pour les états financiers",
        lignes: [
          { compteId: compte521, debit: "80000.00" },
          { compteId: compte401, tiersId, credit: "80000.00" },
        ],
      }),
    );
    expect(financement.status).toBe(201);
    const f = await financement.json();
    expect(
      (await validerRoute.POST(post(""), ctx(f.id))).status,
    ).toBe(200);
  }

  it("ventile les comptes mouvementés vers leurs postes", async () => {
    await poserUnPetitExercice();

    const res = await etatsRoute.GET(
      get(`/api/comptabilite/etats-financiers?exerciceId=${exerciceId}`),
    );
    const etats = await res.json();

    // 601 → achats de marchandises, 401 → fournisseurs d'exploitation,
    // 4452 → TVA récupérable, donc une créance sur l'État, 5211 → trésorerie.
    expect(poste(etats.resultat.lignes, "RA")!.montant).toBe(5_000_000);
    expect(poste(etats.bilan.actif, "BJ")!.net).toBe(962_500);
    expect(poste(etats.bilan.actif, "BS")!.net).toBe(8_000_000);
    expect(poste(etats.bilan.passif, "DJ")!.net).toBe(13_962_500);

    // Le résultat de l'exercice fait la contrepartie de l'écart entre ce qui
    // est entré à l'actif et ce qui a été financé.
    expect(poste(etats.bilan.passif, "CJ")!.net).toBe(-5_000_000);
    expect(etats.bilan.totalActif).toBe(8_962_500);
    expect(etats.bilan.equilibre).toBe(true);
  });

  it("accompagne l'état des rattachements restant à confirmer", async () => {
    connecte();
    const res = await etatsRoute.GET(
      get(`/api/comptabilite/etats-financiers?exerciceId=${exerciceId}`),
    );
    const etats = await res.json();
    expect(etats.rattachementsAConfirmer.length).toBeGreaterThan(0);
    expect(etats.rattachementsAConfirmer[0]).toHaveProperty("motif");
  });

  it("sans exercice précédent, la colonne de comparaison est vide et non nulle", async () => {
    connecte();
    const res = await etatsRoute.GET(
      get(`/api/comptabilite/etats-financiers?exerciceId=${exerciceId}`),
    );
    const etats = await res.json();
    // Zéro affirmerait qu'il n'y avait rien l'an dernier ; `null` dit qu'on
    // ne sait pas, ce qui est le cas d'un premier exercice.
    expect(etats.exercicePrecedent).toBeNull();
    expect(poste(etats.bilan.actif, "BZ")!.netPrecedent).toBeNull();
  });

  it("rattache le comparatif au premier exercice dès qu'un second est ouvert", async () => {
    connecte();
    const creation = await exercicesRoute.POST(
      post("/api/comptabilite/exercices", {
        contribuableId,
        libelle: "Exercice 2027",
        dateDebut: "2027-01-01",
        dateFin: "2027-12-31",
      }),
    );
    expect(creation.status).toBe(201);
    const suivant = await creation.json();

    const res = await etatsRoute.GET(
      get(`/api/comptabilite/etats-financiers?exerciceId=${suivant.id}`),
    );
    const etats = await res.json();

    expect(etats.exercicePrecedent).toEqual({
      id: exerciceId,
      libelle: expect.any(String),
    });

    // L'exercice 2027 est vide : son bilan est à zéro, mais la colonne N-1
    // reprend bien le total de l'exercice précédent.
    expect(poste(etats.bilan.actif, "BZ")!.net).toBe(0);
    expect(poste(etats.bilan.actif, "BZ")!.netPrecedent).not.toBe(0);
  });

  it("refuse 401 sans session", async () => {
    deconnecte();
    const res = await etatsRoute.GET(
      get(`/api/comptabilite/etats-financiers?exerciceId=${exerciceId}`),
    );
    expect(res.status).toBe(401);
  });

  it("refuse 403 sans la permission comptabilite", async () => {
    connecte(SANS_COMPTA);
    const res = await etatsRoute.GET(
      get(`/api/comptabilite/etats-financiers?exerciceId=${exerciceId}`),
    );
    expect(res.status).toBe(403);
  });
});

describe("déclaration de TVA", () => {
  // Novembre est vierge : les blocs précédents saisissent en mars et septembre.
  const PERIODE = "2026-11";

  beforeAll(async () => {
    connecte();

    const comptes = await db
      .select({ id: schema.cptaComptes.id, numero: schema.cptaComptes.numero })
      .from(schema.cptaComptes)
      .where(eq(schema.cptaComptes.contribuableId, contribuableId));
    const parNumero = new Map(comptes.map((c) => [c.numero, c.id]));

    const [journalVente] = await db
      .select({ id: schema.cptaJournaux.id })
      .from(schema.cptaJournaux)
      .where(
        and(
          eq(schema.cptaJournaux.contribuableId, contribuableId),
          eq(schema.cptaJournaux.code, "VE"),
        ),
      );

    async function valider(journalId: number, libelle: string, lignes: unknown[]) {
      const res = await ecrituresRoute.POST(
        post("/api/comptabilite/ecritures", {
          exerciceId,
          journalId,
          dateEcriture: "2026-11-15",
          libelle,
          lignes,
        }),
      );
      expect(res.status).toBe(201);
      const e = await res.json();
      expect((await validerRoute.POST(post(""), ctx(e.id))).status).toBe(200);
    }

    // Vente au comptant de 1 000 000 HT, TVA 19,25 % : 192 500 collectés.
    // L'encaissement passe par la banque plutôt que par le compte clients, qui
    // est collectif et exigerait un tiers sans rien apporter à ce test.
    await valider(journalVente.id, "Vente du mois", [
      { compteId: parNumero.get("5211"), debit: "1192500.00" },
      { compteId: parNumero.get("701"), credit: "1000000.00" },
      { compteId: parNumero.get("4431"), credit: "192500.00" },
    ]);

    // Achat de 400 000 HT : 77 000 de TVA déductible.
    await valider(journalAchatId, "Achat du mois", [
      { compteId: parNumero.get("601"), debit: "400000.00" },
      { compteId: parNumero.get("4452"), debit: "77000.00" },
      { compteId: parNumero.get("401"), tiersId, credit: "477000.00" },
    ]);
  });

  it("oppose la TVA collectée à la TVA déductible du mois", async () => {
    connecte();
    const res = await tvaRoute.GET(
      get(`/api/comptabilite/tva?exerciceId=${exerciceId}&periode=${PERIODE}`),
    );
    expect(res.status).toBe(200);

    const tva = await res.json();
    expect(tva.totalCollectee).toBe(19_250_000);
    expect(tva.totalDeductible).toBe(7_700_000);
    expect(tva.tvaDue).toBe(11_550_000);
    expect(tva.creditAReporter).toBe(0);
    expect(tva.dateDebut).toBe("2026-11-01");
    expect(tva.dateFin).toBe("2026-11-30");
  });

  it("ne retient que les mouvements de la période", async () => {
    // Les achats de mars et septembre portent aussi de la TVA déductible : les
    // reprendre en novembre les redéclarerait.
    connecte();
    const res = await tvaRoute.GET(
      get(`/api/comptabilite/tva?exerciceId=${exerciceId}&periode=2026-10`),
    );
    const tva = await res.json();
    expect(tva.totalCollectee).toBe(0);
    expect(tva.totalDeductible).toBe(0);
    expect(tva.tvaDue).toBe(0);
  });

  it("détaille les comptes qui composent chaque total", async () => {
    connecte();
    const res = await tvaRoute.GET(
      get(`/api/comptabilite/tva?exerciceId=${exerciceId}&periode=${PERIODE}`),
    );
    const tva = await res.json();

    expect(tva.collectee.map((l: { compteNumero: string }) => l.compteNumero)).toEqual(["4431"]);
    expect(tva.deductible.map((l: { compteNumero: string }) => l.compteNumero)).toEqual(["4452"]);
  });

  it("signale les périodes antérieures non liquidées", async () => {
    connecte();
    const res = await tvaRoute.GET(
      get(`/api/comptabilite/tva?exerciceId=${exerciceId}&periode=${PERIODE}`),
    );
    const tva = await res.json();

    // Les mois antérieurs portent de la TVA que rien n'a soldée : aucune
    // écriture de liquidation n'a été passée. Le calcul reste juste pour
    // novembre, mais le crédit reporté ne peut pas être lu sur un compte que
    // personne n'a alimenté — la déclaration le dit au lieu de présenter un
    // montant qui a l'air complet.
    expect(tva.tvaAnterieureNonLiquidee).not.toBe(0);
    expect(tva.creditAnterieur).toBe(0);
  });

  it("refuse une période hors de l'exercice", async () => {
    connecte();
    const res = await tvaRoute.GET(
      get(`/api/comptabilite/tva?exerciceId=${exerciceId}&periode=2025-11`),
    );
    expect(res.status).toBe(400);
  });

  it("refuse 422 une période mal formée", async () => {
    connecte();
    const res = await tvaRoute.GET(
      get(`/api/comptabilite/tva?exerciceId=${exerciceId}&periode=novembre`),
    );
    expect(res.status).toBe(422);
  });

  it("refuse de reporter tant que l'échéance n'existe pas", async () => {
    connecte();
    const res = await tvaRoute.POST(
      post("/api/comptabilite/tva", { exerciceId, periode: PERIODE }),
    );
    // Fabriquer l'obligation ici court-circuiterait le régime du contribuable.
    expect(res.status).toBe(404);
  });

  it("reporte le montant sur la déclaration existante", async () => {
    const [decl] = await db
      .insert(schema.declarations)
      .values({
        contribuableId,
        type: "TVA",
        periodicite: "MENSUELLE",
        periode: PERIODE,
        dateEcheance: "2026-12-15",
      })
      .returning();
    expect(decl.montant).toBeNull();

    connecte();
    const res = await tvaRoute.POST(
      post("/api/comptabilite/tva", { exerciceId, periode: PERIODE }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.declaration.montant).toBe("115500.00");
    // Connaître le montant ne veut pas dire que la déclaration est déposée.
    expect(body.declaration.statut).toBe("A_FAIRE");
  });

  it("refuse 403 le report en lecture seule", async () => {
    connecte(LECTURE_SEULE);
    const res = await tvaRoute.POST(
      post("/api/comptabilite/tva", { exerciceId, periode: PERIODE }),
    );
    expect(res.status).toBe(403);
  });

  it("refuse 401 sans session", async () => {
    deconnecte();
    const res = await tvaRoute.GET(
      get(`/api/comptabilite/tva?exerciceId=${exerciceId}&periode=${PERIODE}`),
    );
    expect(res.status).toBe(401);
  });
});
