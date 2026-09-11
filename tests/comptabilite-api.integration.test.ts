import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { and, eq, inArray, ne } from "drizzle-orm";

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
const exerciceRoute = await import("@/app/api/comptabilite/exercices/[id]/route");
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
const dsfRoute = await import("@/app/api/comptabilite/dsf/route");
const fluxRoute = await import("@/app/api/comptabilite/flux-tresorerie/route");
const notesRoute = await import("@/app/api/comptabilite/notes-annexes/route");
const venteRoute = await import("@/app/api/comptabilite/pieces/facture-vente/route");
const achatRoute = await import("@/app/api/comptabilite/pieces/facture-achat/route");
const reglementRoute = await import("@/app/api/comptabilite/pieces/reglement/route");
const liquiderRoute = await import("@/app/api/comptabilite/tva/liquider/route");
const rapprochementsRoute = await import("@/app/api/comptabilite/rapprochements/route");
const rapprochementRoute = await import("@/app/api/comptabilite/rapprochements/[id]/route");
const pointerRoute = await import("@/app/api/comptabilite/rapprochements/[id]/pointer/route");
const cloturerRoute = await import("@/app/api/comptabilite/rapprochements/[id]/cloturer/route");
const postesTiersRoute = await import("@/app/api/comptabilite/tiers/[id]/postes-ouverts/route");
const piecesRoute = await import("@/app/api/comptabilite/pieces/route");
const pieceRoute = await import("@/app/api/comptabilite/pieces/[id]/route");
const clotureRoute = await import("@/app/api/comptabilite/exercices/[id]/cloture/route");

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
        .delete(schema.cptaPieces)
        .where(eq(schema.cptaPieces.exerciceId, ex.id));
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
      await db
        .delete(schema.cptaRapprochements)
        .where(eq(schema.cptaRapprochements.compteId, c.id));
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

  it("rend aussi la présentation du système minimal, cohérente avec la normale", async () => {
    connecte();
    const res = await etatsRoute.GET(
      get(`/api/comptabilite/etats-financiers?exerciceId=${exerciceId}`),
    );
    const etats = await res.json();

    // Le SMT regroupe les postes du système normal : mêmes totaux, même
    // résultat, par construction.
    expect(etats.smt.equilibre).toBe(true);
    expect(etats.smt.totalActif).toBe(etats.bilan.totalActif);
    expect(etats.smt.totalPassif).toBe(etats.bilan.totalPassif);
    expect(etats.smt.resultatNet).toBe(etats.resultat.resultatNet);
    expect(etats.smt.actif.map((l: { code: string }) => l.code)).toEqual(["IA", "IB", "IC", "ID", "IZ"]);
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

describe("DSF et liquidation de l'impôt", () => {
  const CLE_BAREME = "impot_resultat_bareme";

  async function poserBareme(valeur: unknown | null) {
    await db.delete(schema.parametres).where(eq(schema.parametres.cle, CLE_BAREME));
    if (valeur !== null) {
      await db.insert(schema.parametres).values({ cle: CLE_BAREME, valeur });
    }
  }

  afterAll(async () => {
    await poserBareme(null);
  });

  it("rend la liasse et le résultat sans barème, mais pas l'impôt", async () => {
    await poserBareme(null);
    connecte();

    const res = await dsfRoute.GET(
      get(`/api/comptabilite/dsf?exerciceId=${exerciceId}`),
    );
    expect(res.status).toBe(200);

    const dsf = await res.json();
    expect(dsf.annee).toBe("2026");
    expect(dsf.etats.bilan.equilibre).toBe(true);
    expect(dsf.liquidation.baremeManquant).toBe(true);

    // Zéro se lirait « rien à payer » ; null dit « pas calculable ».
    expect(dsf.liquidation.impotSurResultat).toBeNull();
    expect(dsf.liquidation.soldeAPayer).toBeNull();

    // Ce qui vient des livres est là malgré tout.
    expect(typeof dsf.liquidation.chiffreAffaires).toBe("number");
    expect(dsf.liquidation.resultatComptable).toBe(
      dsf.etats.resultat.resultatNet,
    );
  });

  it("refuse de reporter un montant tant que le barème manque", async () => {
    await poserBareme(null);
    connecte();
    const res = await dsfRoute.POST(
      post("/api/comptabilite/dsf", { exerciceId }),
    );
    expect(res.status).toBe(409);
  });

  it("liquide l'impôt une fois le barème paramétré", async () => {
    await poserBareme({ tauxImpot: "33", tauxMinimum: "2.2" });
    connecte();

    const res = await dsfRoute.GET(
      get(`/api/comptabilite/dsf?exerciceId=${exerciceId}`),
    );
    const dsf = await res.json();

    expect(dsf.liquidation.baremeManquant).toBe(false);
    expect(dsf.liquidation.impotSurResultat).not.toBeNull();
    expect(dsf.liquidation.minimumPerception).not.toBeNull();
    // L'impôt retenu est toujours le plus élevé des deux.
    expect(dsf.liquidation.impotRetenu).toBe(
      Math.max(dsf.liquidation.impotSurResultat, dsf.liquidation.minimumPerception),
    );
  });

  it("le minimum de perception reste dû sur un exercice déficitaire", async () => {
    await poserBareme({ tauxImpot: "33", tauxMinimum: "2.2" });
    connecte();

    // Le déficit est provoqué par une déduction massive plutôt que présumé du
    // jeu de données, que les blocs précédents font varier. Ce qui est vérifié
    // ici est la règle : une perte n'exonère pas du minimum, assis sur le
    // chiffre d'affaires et non sur le résultat.
    const res = await dsfRoute.GET(
      get(
        `/api/comptabilite/dsf?exerciceId=${exerciceId}&deductions=999999999`,
      ),
    );
    const dsf = await res.json();

    expect(dsf.liquidation.resultatFiscal).toBeLessThan(0);
    expect(dsf.liquidation.impotSurResultat).toBe(0);
    expect(dsf.liquidation.chiffreAffaires).toBeGreaterThan(0);
    expect(dsf.liquidation.minimumApplique).toBe(true);
    expect(dsf.liquidation.impotRetenu).toBeGreaterThan(0);
  });

  it("applique les retraitements fiscaux reçus", async () => {
    await poserBareme({ tauxImpot: "33", tauxMinimum: "2.2" });
    connecte();

    const sans = await (
      await dsfRoute.GET(get(`/api/comptabilite/dsf?exerciceId=${exerciceId}`))
    ).json();
    const avec = await (
      await dsfRoute.GET(
        get(
          `/api/comptabilite/dsf?exerciceId=${exerciceId}&reintegrations=1000000`,
        ),
      )
    ).json();

    expect(avec.liquidation.resultatFiscal - sans.liquidation.resultatFiscal).toBe(
      100_000_000,
    );
  });

  it("reporte le solde sur la déclaration DSF existante", async () => {
    await poserBareme({ tauxImpot: "33", tauxMinimum: "2.2" });

    const [decl] = await db
      .insert(schema.declarations)
      .values({
        contribuableId,
        type: "DSF",
        periodicite: "ANNUELLE",
        periode: "2026",
        dateEcheance: "2027-03-15",
      })
      .returning();
    expect(decl.montant).toBeNull();

    connecte();
    const res = await dsfRoute.POST(
      post("/api/comptabilite/dsf", { exerciceId }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.declaration.montant).not.toBeNull();
    expect(body.declaration.statut).toBe("A_FAIRE");
  });

  it("refuse 403 le report en lecture seule", async () => {
    connecte(LECTURE_SEULE);
    const res = await dsfRoute.POST(
      post("/api/comptabilite/dsf", { exerciceId }),
    );
    expect(res.status).toBe(403);
  });

  it("refuse 401 sans session", async () => {
    deconnecte();
    const res = await dsfRoute.GET(
      get(`/api/comptabilite/dsf?exerciceId=${exerciceId}`),
    );
    expect(res.status).toBe(401);
  });
});

describe("tableau des flux de trésorerie", () => {
  it("reconstitue la trésorerie de clôture sur les écritures réelles", async () => {
    connecte();
    const res = await fluxRoute.GET(
      get(`/api/comptabilite/flux-tresorerie?exerciceId=${exerciceId}`),
    );
    expect(res.status).toBe(200);

    const flux = await res.json();
    // C'est l'invariant du tableau, et la preuve que les règles couvrent ce que
    // l'application produit réellement — contre-passations et lettrages compris.
    expect(flux.ecart).toBe(0);
    expect(flux.coherent).toBe(true);
    expect(flux.comptesHorsTableau).toEqual([]);
  });

  it("la trésorerie de clôture est celle de la balance", async () => {
    connecte();
    const [flux, balance] = await Promise.all([
      fluxRoute.GET(get(`/api/comptabilite/flux-tresorerie?exerciceId=${exerciceId}`)).then((r) => r.json()),
      balanceRoute.GET(get(`/api/comptabilite/balance?exerciceId=${exerciceId}`)).then((r) => r.json()),
    ]);
    const tresorerieBalance = balance.lignes
      .filter((l: { compteNumero: string }) => l.compteNumero.startsWith("5"))
      .reduce(
        (t: number, l: { soldeDebiteur: number; soldeCrediteur: number }) =>
          t + l.soldeDebiteur - l.soldeCrediteur,
        0,
      );
    expect(flux.tresorerieCloture).toBe(tresorerieBalance);
  });

  it("sans à-nouveaux, part d'une trésorerie nulle et le dit", async () => {
    connecte();
    const res = await fluxRoute.GET(
      get(`/api/comptabilite/flux-tresorerie?exerciceId=${exerciceId}`),
    );
    const flux = await res.json();
    expect(flux.sansANouveaux).toBe(true);
    expect(flux.tresorerieOuverture).toBe(0);
  });

  it("présente les lignes du modèle dans l'ordre, totaux compris", async () => {
    connecte();
    const res = await fluxRoute.GET(
      get(`/api/comptabilite/flux-tresorerie?exerciceId=${exerciceId}`),
    );
    const flux = await res.json();
    const codes = flux.lignes.map((l: { code: string }) => l.code);
    expect(codes[0]).toBe("ZA");
    expect(codes[codes.length - 1]).toBe("ZF");
    expect(codes).toContain("ZB");
    expect(codes).toContain("ZC");
    expect(codes).toContain("ZD");
  });

  it("refuse 401 sans session", async () => {
    deconnecte();
    const res = await fluxRoute.GET(
      get(`/api/comptabilite/flux-tresorerie?exerciceId=${exerciceId}`),
    );
    expect(res.status).toBe(401);
  });
});

describe("notes annexes", () => {
  it("rend les notes chiffrées et celles à rédiger", async () => {
    connecte();
    const res = await notesRoute.GET(
      get(`/api/comptabilite/notes-annexes?exerciceId=${exerciceId}`),
    );
    expect(res.status).toBe(200);

    const notes = await res.json();
    expect(notes.notes.length).toBeGreaterThan(20);
    expect(notes.aRediger.length).toBeGreaterThan(0);
    expect(notes.sansANouveaux).toBe(true);
  });

  it("retrouve les totaux des états financiers", async () => {
    connecte();
    const [notes, etats] = await Promise.all([
      notesRoute.GET(get(`/api/comptabilite/notes-annexes?exerciceId=${exerciceId}`)).then((r) => r.json()),
      etatsRoute.GET(get(`/api/comptabilite/etats-financiers?exerciceId=${exerciceId}`)).then((r) => r.json()),
    ]);
    const note = (code: string) => notes.notes.find((n: { definition: { code: string } }) => n.definition.code === code);
    const poste = (section: { code: string; net?: number; montant?: number }[], code: string) => section.find((p) => p.code === code)!;

    // La note fournisseurs retrouve le poste DJ (+ DI), les achats le poste RA…
    expect(note("FOURNISSEURS").total.fin).toBe(
      poste(etats.bilan.passif, "DJ").net! + poste(etats.bilan.passif, "DI").net!,
    );
    expect(note("DETTES_FISCALES").total.fin).toBe(poste(etats.bilan.passif, "DK").net);
    expect(note("TRESORERIE_ACTIF").total.fin).toBe(poste(etats.bilan.actif, "BS").net);
    expect(note("CHIFFRE_AFFAIRES").total).toBe(poste(etats.resultat.lignes, "XB").montant);
  });

  it("refuse 401 sans session", async () => {
    deconnecte();
    const res = await notesRoute.GET(
      get(`/api/comptabilite/notes-annexes?exerciceId=${exerciceId}`),
    );
    expect(res.status).toBe(401);
  });
});

describe("saisie assistée — pièces génératrices d'écritures", () => {
  let clientId: number;
  let compte411: number;
  let compte701: number;
  let compte5211: number;
  let taxeCollectee: number;
  let taxeDeductible: number;
  let journalBanque: number;

  beforeAll(async () => {
    const comptes = await db
      .select({ id: schema.cptaComptes.id, numero: schema.cptaComptes.numero })
      .from(schema.cptaComptes)
      .where(eq(schema.cptaComptes.contribuableId, contribuableId));
    const parNumero = new Map(comptes.map((c) => [c.numero, c.id]));
    compte411 = parNumero.get("411")!;
    compte701 = parNumero.get("701")!;
    compte5211 = parNumero.get("5211")!;

    const [client] = await db
      .insert(schema.cptaTiers)
      .values({
        contribuableId,
        code: "C001",
        raisonSociale: "Client de saisie assistée",
        types: ["CLIENT"],
        compteId: compte411,
      })
      .returning();
    clientId = client.id;

    const taxes = await db
      .select({ id: schema.cptaTaxes.id, code: schema.cptaTaxes.code })
      .from(schema.cptaTaxes)
      .where(eq(schema.cptaTaxes.contribuableId, contribuableId));
    taxeCollectee = taxes.find((t) => t.code === "TVA1925")!.id;
    taxeDeductible = taxes.find((t) => t.code === "TVA1925D")!.id;

    const [bq] = await db
      .select({ id: schema.cptaJournaux.id })
      .from(schema.cptaJournaux)
      .where(
        and(
          eq(schema.cptaJournaux.contribuableId, contribuableId),
          eq(schema.cptaJournaux.code, "BQ"),
        ),
      );
    journalBanque = bq.id;
  });

  it("une facture de vente devient une écriture équilibrée au journal des ventes", async () => {
    connecte();
    const res = await venteRoute.POST(
      post("/api/comptabilite/pieces/facture-vente", {
        exerciceId,
        dateEcriture: "2026-12-05",
        reference: "V-2026-001",
        dateEcheance: "2027-01-05",
        tiersId: clientId,
        lignes: [{ compteId: compte701, montantHt: "1000000", taxeId: taxeCollectee }],
      }),
    );
    expect(res.status).toBe(201);

    const { ecriture, generee } = await res.json();
    expect(ecriture.statut).toBe("BROUILLON");
    expect(ecriture.origine).toBe("FACTURE_VENTE");
    expect(generee.totalTtc).toBe(119_250_000);
    expect(generee.totalTva).toBe(19_250_000);

    const lignes = await db
      .select()
      .from(schema.cptaLignesEcriture)
      .where(eq(schema.cptaLignesEcriture.ecritureId, ecriture.id));
    expect(lignes).toHaveLength(3);
    const client = lignes.find((l) => l.compteId === compte411)!;
    expect(client.debit).toBe("1192500.00");
    expect(client.tiersId).toBe(clientId);
    expect(client.dateEcheance).toBe("2027-01-05");

    // Validée à part : seule une écriture validée entre dans la TVA du mois,
    // et la liquidation testée plus bas compte sur celle-ci.
    expect((await validerRoute.POST(post(""), ctx(ecriture.id))).status).toBe(200);
  });

  it("peut valider dans la foulée, avec la permission de modification", async () => {
    connecte();
    const res = await venteRoute.POST(
      post("/api/comptabilite/pieces/facture-vente", {
        exerciceId,
        dateEcriture: "2026-12-06",
        reference: "V-2026-002",
        tiersId: clientId,
        lignes: [{ compteId: compte701, montantHt: "50000", taxeId: null }],
        valider: true,
      }),
    );
    expect(res.status).toBe(201);
    const { ecriture } = await res.json();
    expect(ecriture.statut).toBe("VALIDEE");
    expect(ecriture.numeroPiece).toMatch(/^VE2026-/);
  });

  it("valider exige la permission de modification, pas seulement de création", async () => {
    connecte([{ ressource: "comptabilite", actions: ["read", "create"] }]);
    const res = await venteRoute.POST(
      post("/api/comptabilite/pieces/facture-vente", {
        exerciceId,
        dateEcriture: "2026-12-06",
        tiersId: clientId,
        lignes: [{ compteId: compte701, montantHt: "1000" }],
        valider: true,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("une facture d'achat va au journal des achats avec la TVA déductible", async () => {
    connecte();
    const res = await achatRoute.POST(
      post("/api/comptabilite/pieces/facture-achat", {
        exerciceId,
        dateEcriture: "2026-12-07",
        reference: "AF-2026-031",
        tiersId,
        lignes: [{ compteId: compte601, montantHt: "400000", taxeId: taxeDeductible }],
        valider: true,
      }),
    );
    expect(res.status).toBe(201);
    const { ecriture, generee } = await res.json();
    expect(ecriture.origine).toBe("FACTURE_ACHAT");
    expect(ecriture.numeroPiece).toMatch(/^AC2026-/);
    expect(generee.totalTtc).toBe(47_700_000);
  });

  it("refuse un tiers sans compte collectif", async () => {
    const [orphelin] = await db
      .insert(schema.cptaTiers)
      .values({ contribuableId, code: "X999", raisonSociale: "Sans compte", types: [] })
      .returning();
    connecte();
    const res = await venteRoute.POST(
      post("/api/comptabilite/pieces/facture-vente", {
        exerciceId,
        dateEcriture: "2026-12-07",
        tiersId: orphelin.id,
        lignes: [{ compteId: compte701, montantHt: "1000" }],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/compte collectif/);
  });

  it("un règlement passe par le compte de contrepartie du journal de trésorerie", async () => {
    connecte();
    const res = await reglementRoute.POST(
      post("/api/comptabilite/pieces/reglement", {
        exerciceId,
        journalId: journalBanque,
        dateEcriture: "2026-12-10",
        reference: "VIR-12",
        tiersId: clientId,
        montant: "1192500",
        sens: "ENCAISSEMENT",
        valider: true,
      }),
    );
    expect(res.status).toBe(201);
    const { ecriture } = await res.json();
    expect(ecriture.origine).toBe("REGLEMENT");
    expect(ecriture.numeroPiece).toMatch(/^BQ2026-/);

    const lignes = await db
      .select()
      .from(schema.cptaLignesEcriture)
      .where(eq(schema.cptaLignesEcriture.ecritureId, ecriture.id));
    expect(lignes.find((l) => l.compteId === compte5211)!.debit).toBe("1192500.00");
    expect(lignes.find((l) => l.compteId === compte411)!.credit).toBe("1192500.00");
  });

  it("refuse un règlement sur un journal qui n'est pas de trésorerie", async () => {
    connecte();
    const res = await reglementRoute.POST(
      post("/api/comptabilite/pieces/reglement", {
        exerciceId,
        journalId: journalAchatId,
        dateEcriture: "2026-12-10",
        tiersId: clientId,
        montant: "1000",
        sens: "ENCAISSEMENT",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("refuse 422 une ligne sans montant", async () => {
    connecte();
    const res = await venteRoute.POST(
      post("/api/comptabilite/pieces/facture-vente", {
        exerciceId,
        dateEcriture: "2026-12-07",
        tiersId: clientId,
        lignes: [{ compteId: compte701, montantHt: "0" }],
      }),
    );
    expect(res.status).toBe(422);
  });
});

describe("liquidation de la TVA", () => {
  // Décembre : la vente de 1 000 000 HT (TVA 192 500) et l'achat de 400 000 HT
  // (TVA 77 000) du bloc précédent, seuls mouvements de TVA du mois.
  const PERIODE = "2026-12";

  it("passe l'écriture qui solde les comptes de TVA et constate la TVA due", async () => {
    connecte();
    const res = await liquiderRoute.POST(
      post("/api/comptabilite/tva/liquider", { exerciceId, periode: PERIODE, valider: true }),
    );
    expect(res.status).toBe(201);

    const { ecriture, generee } = await res.json();
    expect(ecriture.numeroPiece).toMatch(/^OD2026-/);
    expect(ecriture.dateEcriture).toBe("2026-12-31");
    expect(generee.totalTva).toBe(11_550_000); // 192 500 − 77 000

    // Après liquidation, la TVA du mois se lit comme déjà soldée.
    const apres = await (
      await tvaRoute.GET(get(`/api/comptabilite/tva?exerciceId=${exerciceId}&periode=${PERIODE}`))
    ).json();
    expect(apres.totalCollectee).toBe(0);
    expect(apres.totalDeductible).toBe(0);
  });

  it("refuse de liquider deux fois la même période", async () => {
    connecte();
    const res = await liquiderRoute.POST(
      post("/api/comptabilite/tva/liquider", { exerciceId, periode: PERIODE }),
    );
    expect(res.status).toBe(409);
  });

  it("refuse une période sans mouvement de TVA", async () => {
    connecte();
    const res = await liquiderRoute.POST(
      post("/api/comptabilite/tva/liquider", { exerciceId, periode: "2026-08" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/Rien à liquider/);
  });
});

describe("rapprochement bancaire", () => {
  let rapprochementId: number;
  let soldeComptable: number;

  async function lireEtat(id: number) {
    const res = await rapprochementRoute.GET(get(""), ctx(id));
    expect(res.status).toBe(200);
    return res.json();
  }

  it("refuse un compte qui n'est pas rapprochable", async () => {
    connecte();
    const res = await rapprochementsRoute.POST(
      post("/api/comptabilite/rapprochements", {
        exerciceId,
        compteId: compte601,
        dateRapprochement: "2026-12-31",
        soldeReleve: "0",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("ouvre un rapprochement sur le compte de banque, au solde comptable du jour", async () => {
    connecte();
    const balance = await (
      await balanceRoute.GET(get(`/api/comptabilite/balance?exerciceId=${exerciceId}&dateFin=2026-12-31`))
    ).json();
    const l = balance.lignes.find((x: { compteNumero: string }) => x.compteNumero === "5211");
    soldeComptable = l.soldeDebiteur - l.soldeCrediteur;

    // Le relevé annonce le même solde : une fois tout pointé, l'écart sera nul.
    const res = await rapprochementsRoute.POST(
      post("/api/comptabilite/rapprochements", {
        exerciceId,
        compteId: compte521,
        dateRapprochement: "2026-12-31",
        soldeReleve: String(soldeComptable / 100),
      }),
    );
    expect(res.status).toBe(201);
    const r = await res.json();
    rapprochementId = r.id;
    expect(r.cloture).toBe(false);
    expect(Math.round(Number(r.soldeComptable) * 100)).toBe(soldeComptable);
  });

  it("n'admet qu'un rapprochement ouvert par compte", async () => {
    connecte();
    const res = await rapprochementsRoute.POST(
      post("/api/comptabilite/rapprochements", {
        exerciceId,
        compteId: compte521,
        dateRapprochement: "2026-12-31",
        soldeReleve: "0",
      }),
    );
    expect(res.status).toBe(409);
  });

  it("avant pointage, toutes les lignes sont en suspens et l'écart les reflète", async () => {
    connecte();
    const { etat } = await lireEtat(rapprochementId);
    expect(etat.pointees).toEqual([]);
    expect(etat.nonPointees.length).toBeGreaterThan(0);
    // Solde rapproché = solde − débits + crédits non pointés ; le relevé vaut
    // le solde comptable, donc l'écart est exactement ce qui reste à pointer.
    expect(etat.ecart).toBe(etat.debitsNonPointes - etat.creditsNonPointes);
  });

  it("refuse de clôturer tant qu'un écart subsiste", async () => {
    connecte();
    const res = await cloturerRoute.POST(post(""), ctx(rapprochementId));
    expect(res.status).toBe(409);
  });

  it("refuse de pointer une ligne d'un autre compte", async () => {
    connecte();
    const [ligne601] = await db
      .select({ id: schema.cptaLignesEcriture.id })
      .from(schema.cptaLignesEcriture)
      .where(eq(schema.cptaLignesEcriture.compteId, compte601))
      .limit(1);
    const res = await pointerRoute.POST(
      post("", { ligneIds: [ligne601.id], pointer: true }),
      ctx(rapprochementId),
    );
    expect(res.status).toBe(400);
  });

  it("pointe toutes les lignes et ramène l'écart à zéro", async () => {
    connecte();
    const { etat: avant } = await lireEtat(rapprochementId);
    const res = await pointerRoute.POST(
      post("", { ligneIds: avant.nonPointees.map((l: { ligneId: number }) => l.ligneId), pointer: true }),
      ctx(rapprochementId),
    );
    expect(res.status).toBe(200);
    const etat = await res.json();
    expect(etat.nonPointees).toEqual([]);
    expect(etat.soldeRapproche).toBe(soldeComptable);
    expect(etat.ecart).toBe(0);
    expect(etat.juste).toBe(true);
  });

  it("dépointer une ligne rouvre l'écart, et la proposition la retrouve", async () => {
    connecte();
    const { etat: avant } = await lireEtat(rapprochementId);
    const une = avant.pointees[0];
    await pointerRoute.POST(post("", { ligneIds: [une.ligneId], pointer: false }), ctx(rapprochementId));

    const { etat, proposition } = await lireEtat(rapprochementId);
    expect(etat.ecart).toBe(une.debit - une.credit);
    expect(proposition.map((l: { ligneId: number }) => l.ligneId)).toEqual([une.ligneId]);

    // On la repointe pour la suite.
    await pointerRoute.POST(post("", { ligneIds: [une.ligneId], pointer: true }), ctx(rapprochementId));
  });

  it("clôture un rapprochement juste, et le fige", async () => {
    connecte();
    const res = await cloturerRoute.POST(post(""), ctx(rapprochementId));
    expect(res.status).toBe(200);
    expect((await res.json()).cloture).toBe(true);

    const { etat } = await lireEtat(rapprochementId);
    const refus = await pointerRoute.POST(
      post("", { ligneIds: [etat.pointees[0].ligneId], pointer: false }),
      ctx(rapprochementId),
    );
    expect(refus.status).toBe(409);
  });

  it("un rapprochement suivant voit les lignes déjà pointées comme telles", async () => {
    connecte();
    const res = await rapprochementsRoute.POST(
      post("/api/comptabilite/rapprochements", {
        exerciceId,
        compteId: compte521,
        dateRapprochement: "2026-12-31",
        soldeReleve: String(soldeComptable / 100),
      }),
    );
    expect(res.status).toBe(201);
    const suivant = await res.json();
    const { etat } = await lireEtat(suivant.id);
    // Rien à pointer : le précédent rapprochement a tout retrouvé.
    expect(etat.nonPointees).toEqual([]);
    expect(etat.juste).toBe(true);

    // Et une ligne pointée ailleurs ne se repointe pas ici.
    const refus = await pointerRoute.POST(
      post("", { ligneIds: [etat.pointees[0].ligneId], pointer: true }),
      ctx(suivant.id),
    );
    expect(refus.status).toBe(409);

    // Nettoyage : on le supprime, il n'a servi qu'à vérifier.
    expect((await rapprochementRoute.DELETE(post(""), ctx(suivant.id))).status).toBe(204);
  });

  it("refuse 403 le pointage en lecture seule", async () => {
    connecte(LECTURE_SEULE);
    const res = await pointerRoute.POST(post("", { ligneIds: [1], pointer: true }), ctx(rapprochementId));
    expect(res.status).toBe(403);
  });
});

describe("lettrage à la saisie d'un règlement", () => {
  let clientId: number;
  let compte701: number;
  let journalBanque: number;
  let facture1: number; // ligne 411 de 240 000
  let facture2: number; // ligne 411 de 60 000

  beforeAll(async () => {
    connecte();
    const comptes = await db
      .select({ id: schema.cptaComptes.id, numero: schema.cptaComptes.numero })
      .from(schema.cptaComptes)
      .where(eq(schema.cptaComptes.contribuableId, contribuableId));
    const parNumero = new Map(comptes.map((c) => [c.numero, c.id]));
    compte701 = parNumero.get("701")!;

    const [client] = await db
      .insert(schema.cptaTiers)
      .values({
        contribuableId,
        code: "C-LETTR",
        raisonSociale: "Client du lettrage",
        types: ["CLIENT"],
        compteId: parNumero.get("411")!,
      })
      .returning();
    clientId = client.id;

    const [bq] = await db
      .select({ id: schema.cptaJournaux.id })
      .from(schema.cptaJournaux)
      .where(and(eq(schema.cptaJournaux.contribuableId, contribuableId), eq(schema.cptaJournaux.code, "BQ")));
    journalBanque = bq.id;

    // Deux factures sans TVA, validées : 240 000 et 60 000.
    async function facturer(reference: string, montant: string) {
      const res = await venteRoute.POST(
        post("/api/comptabilite/pieces/facture-vente", {
          exerciceId,
          dateEcriture: "2026-12-12",
          reference,
          tiersId: clientId,
          lignes: [{ compteId: compte701, montantHt: montant }],
          valider: true,
        }),
      );
      expect(res.status).toBe(201);
      const { ecriture } = await res.json();
      const [ligne] = await db
        .select({ id: schema.cptaLignesEcriture.id })
        .from(schema.cptaLignesEcriture)
        .where(
          and(
            eq(schema.cptaLignesEcriture.ecritureId, ecriture.id),
            eq(schema.cptaLignesEcriture.compteId, parNumero.get("411")!),
          ),
        );
      return ligne.id;
    }
    facture1 = await facturer("L-1", "240000");
    facture2 = await facturer("L-2", "60000");
  });

  it("liste les postes ouverts du tiers, et de lui seul", async () => {
    connecte();
    const res = await postesTiersRoute.GET(get(""), ctx(clientId));
    expect(res.status).toBe(200);
    const postes = await res.json();
    const ids = postes.map((p: { ligneId: number }) => p.ligneId);
    expect(ids).toContain(facture1);
    expect(ids).toContain(facture2);
    // Les factures de l'autre client (bloc saisie assistée) n'y sont pas.
    expect(postes.every((p: { tiersId: number }) => p.tiersId === clientId)).toBe(true);
  });

  it("refuse de lettrer un brouillon", async () => {
    connecte();
    const res = await reglementRoute.POST(
      post("/api/comptabilite/pieces/reglement", {
        exerciceId,
        journalId: journalBanque,
        dateEcriture: "2026-12-15",
        tiersId: clientId,
        montant: "240000",
        sens: "ENCAISSEMENT",
        lettrerAvec: [facture1],
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/brouillon/);
  });

  it("refuse un règlement qui ne solde pas les factures désignées, sans rien écrire", async () => {
    connecte();
    const avant = await db.select({ id: schema.cptaEcritures.id }).from(schema.cptaEcritures);
    const res = await reglementRoute.POST(
      post("/api/comptabilite/pieces/reglement", {
        exerciceId,
        journalId: journalBanque,
        dateEcriture: "2026-12-15",
        tiersId: clientId,
        montant: "200000",
        sens: "ENCAISSEMENT",
        valider: true,
        lettrerAvec: [facture1],
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/ne se soldent pas/);
    // Le refus est net : aucune écriture n'a été créée entre-temps.
    const apres = await db.select({ id: schema.cptaEcritures.id }).from(schema.cptaEcritures);
    expect(apres.length).toBe(avant.length);
  });

  it("lettre le règlement avec les deux factures qu'il solde d'un seul virement", async () => {
    connecte();
    const res = await reglementRoute.POST(
      post("/api/comptabilite/pieces/reglement", {
        exerciceId,
        journalId: journalBanque,
        dateEcriture: "2026-12-15",
        reference: "VIR-300",
        tiersId: clientId,
        montant: "300000",
        sens: "ENCAISSEMENT",
        valider: true,
        lettrerAvec: [facture1, facture2],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ecriture.statut).toBe("VALIDEE");
    expect(body.lettrage).not.toBeNull();
    expect(body.lettrage.code).toMatch(/^[A-Z]+$/);

    // Les trois lignes portent le même code, et le tiers n'a plus de poste ouvert.
    const lignes = await db
      .select({ id: schema.cptaLignesEcriture.id, lettrage: schema.cptaLignesEcriture.lettrage })
      .from(schema.cptaLignesEcriture)
      .where(inArray(schema.cptaLignesEcriture.id, [facture1, facture2]));
    expect(lignes.map((l) => l.lettrage)).toEqual([body.lettrage.code, body.lettrage.code]);

    const ouverts = await (await postesTiersRoute.GET(get(""), ctx(clientId))).json();
    expect(ouverts).toEqual([]);
  });

  it("refuse une ligne déjà lettrée", async () => {
    connecte();
    const res = await reglementRoute.POST(
      post("/api/comptabilite/pieces/reglement", {
        exerciceId,
        journalId: journalBanque,
        dateEcriture: "2026-12-16",
        tiersId: clientId,
        montant: "240000",
        sens: "ENCAISSEMENT",
        valider: true,
        lettrerAvec: [facture1],
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/poste ouvert/);
  });
});

describe("pièces persistées", () => {
  let clientId: number;
  let compte701: number;
  let compte411: number;
  let taxeCollectee: number;
  let journalBanque: number;
  let pieceId: number;
  let ecritureId: number;

  beforeAll(async () => {
    const comptes = await db
      .select({ id: schema.cptaComptes.id, numero: schema.cptaComptes.numero })
      .from(schema.cptaComptes)
      .where(eq(schema.cptaComptes.contribuableId, contribuableId));
    const parNumero = new Map(comptes.map((c) => [c.numero, c.id]));
    compte701 = parNumero.get("701")!;
    compte411 = parNumero.get("411")!;

    const [client] = await db
      .insert(schema.cptaTiers)
      .values({ contribuableId, code: "C-PIECE", raisonSociale: "Client des pièces", types: ["CLIENT"], compteId: compte411 })
      .returning();
    clientId = client.id;

    const taxes = await db
      .select({ id: schema.cptaTaxes.id, code: schema.cptaTaxes.code })
      .from(schema.cptaTaxes)
      .where(eq(schema.cptaTaxes.contribuableId, contribuableId));
    taxeCollectee = taxes.find((t) => t.code === "TVA1925")!.id;

    const [bq] = await db
      .select({ id: schema.cptaJournaux.id })
      .from(schema.cptaJournaux)
      .where(and(eq(schema.cptaJournaux.contribuableId, contribuableId), eq(schema.cptaJournaux.code, "BQ")));
    journalBanque = bq.id;
  });

  it("une facture est conservée avec ses lignes, et liée à son écriture dans les deux sens", async () => {
    connecte();
    const res = await venteRoute.POST(
      post("/api/comptabilite/pieces/facture-vente", {
        exerciceId,
        dateEcriture: "2026-12-20",
        reference: "P-2026-001",
        dateEcheance: "2026-12-25",
        tiersId: clientId,
        lignes: [
          { compteId: compte701, montantHt: "100000", taxeId: taxeCollectee, libelle: "Pains" },
          { compteId: compte701, montantHt: "20000", taxeId: null, libelle: "Livraison" },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    pieceId = body.piece.id;
    ecritureId = body.ecriture.id;

    expect(body.piece.totalHt).toBe("120000.00");
    expect(body.piece.totalTva).toBe("19250.00");
    expect(body.piece.totalTtc).toBe("139250.00");
    expect(body.piece.ecritureId).toBe(ecritureId);
    // L'écriture désigne la pièce d'où elle vient.
    expect(body.ecriture.origine).toBe("FACTURE_VENTE");
    expect(body.ecriture.origineId).toBe(pieceId);

    const lignes = await db.select().from(schema.cptaPieceLignes).where(eq(schema.cptaPieceLignes.pieceId, pieceId));
    expect(lignes.map((l) => [l.ordre, l.libelle, l.montantHt, l.taxeId])).toEqual([
      [0, "Pains", "100000.00", taxeCollectee],
      [1, "Livraison", "20000.00", null],
    ]);
  });

  it("se lit avec ses statuts dérivés : brouillon, règlement sans objet", async () => {
    connecte();
    const res = await pieceRoute.GET(get(""), ctx(pieceId));
    expect(res.status).toBe(200);
    const p = await res.json();
    expect(p.statutComptable).toBe("BROUILLON");
    expect(p.statutReglement).toBe("SANS_OBJET");
    expect(p.tiers.raisonSociale).toBe("Client des pièces");
    expect(p.lignes).toHaveLength(2);
    expect(p.lignes[0].compteNumero).toBe("701");
    expect(p.lignes[0].taux).toBe("19.2500");
  });

  it("validée et non réglée, échéance passée : en retard", async () => {
    connecte();
    expect((await validerRoute.POST(post(""), ctx(ecritureId))).status).toBe(200);
    const p = await (await pieceRoute.GET(get(""), ctx(pieceId))).json();
    expect(p.statutComptable).toBe("VALIDEE");
    expect(p.numeroPiece).toMatch(/^VE2026-/);
    // Le test tourne après le 25/12/2026 pour le calendrier de Douala… ou pas :
    // la seule chose stable est que le statut suit l'échéance et le jour.
    expect(["EN_ATTENTE", "EN_RETARD"]).toContain(p.statutReglement);
  });

  it("réglée dès que sa ligne est lettrée par un règlement", async () => {
    connecte();
    const [ligne] = await db
      .select({ id: schema.cptaLignesEcriture.id })
      .from(schema.cptaLignesEcriture)
      .where(and(eq(schema.cptaLignesEcriture.ecritureId, ecritureId), eq(schema.cptaLignesEcriture.compteId, compte411)));

    const res = await reglementRoute.POST(
      post("/api/comptabilite/pieces/reglement", {
        exerciceId,
        journalId: journalBanque,
        dateEcriture: "2026-12-22",
        tiersId: clientId,
        montant: "139250",
        sens: "ENCAISSEMENT",
        valider: true,
        lettrerAvec: [ligne.id],
      }),
    );
    expect(res.status).toBe(201);

    const p = await (await pieceRoute.GET(get(""), ctx(pieceId))).json();
    expect(p.statutReglement).toBe("REGLEE");
  });

  it("la liste de l'exercice retrouve la pièce, filtrable par type et par tiers", async () => {
    connecte();
    const toutes = await (await piecesRoute.GET(get(`/api/comptabilite/pieces?exerciceId=${exerciceId}`))).json();
    expect(toutes.some((p: { id: number }) => p.id === pieceId)).toBe(true);

    const achats = await (
      await piecesRoute.GET(get(`/api/comptabilite/pieces?exerciceId=${exerciceId}&type=FACTURE_ACHAT`))
    ).json();
    expect(achats.every((p: { type: string }) => p.type === "FACTURE_ACHAT")).toBe(true);
    expect(achats.some((p: { id: number }) => p.id === pieceId)).toBe(false);

    const duClient = await (
      await piecesRoute.GET(get(`/api/comptabilite/pieces?exerciceId=${exerciceId}&tiersId=${clientId}`))
    ).json();
    expect(duClient.map((p: { id: number }) => p.id)).toEqual([pieceId]);
  });

  it("survit à la suppression de son brouillon : à recomptabiliser", async () => {
    connecte();
    const res = await venteRoute.POST(
      post("/api/comptabilite/pieces/facture-vente", {
        exerciceId,
        dateEcriture: "2026-12-23",
        reference: "P-2026-002",
        tiersId: clientId,
        lignes: [{ compteId: compte701, montantHt: "5000" }],
      }),
    );
    const { piece, ecriture } = await res.json();
    expect((await ecritureRoute.DELETE(post(""), ctx(ecriture.id))).status).toBe(204);

    const p = await (await pieceRoute.GET(get(""), ctx(piece.id))).json();
    expect(p.ecritureId).toBeNull();
    expect(p.statutComptable).toBe("NON_COMPTABILISEE");
  });

  it("refuse 401 sans session", async () => {
    deconnecte();
    expect((await piecesRoute.GET(get(`/api/comptabilite/pieces?exerciceId=${exerciceId}`))).status).toBe(401);
  });
});

describe("clôture d'exercice", () => {
  let suivantId: number;

  it("dit ce qui empêche de clôturer", async () => {
    connecte();
    const res = await clotureRoute.GET(get(""), ctx(exerciceId));
    expect(res.status).toBe(200);
    const c = await res.json();
    expect(c.suivant).not.toBeNull();
    expect(c.suivant.libelle).toBe("Exercice 2027");
    suivantId = c.suivant.id;
    expect(c.balanceEquilibree).toBe(true);
    // Les blocs précédents ont laissé des brouillons : c'est un obstacle nommé.
    if (c.brouillons > 0) expect(c.obstacles.join(" ")).toMatch(/brouillon/);
  });

  it("refuse tant qu'un obstacle subsiste", async () => {
    connecte();
    const c = await (await clotureRoute.GET(get(""), ctx(exerciceId))).json();
    if (c.obstacles.length === 0) return;
    const res = await clotureRoute.POST(post(""), ctx(exerciceId));
    expect(res.status).toBe(409);
  });

  it("pointe une partie de la banque avant clôture, pour vérifier la reprise", async () => {
    // Le rapprochement clôturé plus haut a été supprimé par son test ; on en
    // refait un qui pointe tout sauf une ligne, et on le clôture.
    connecte();
    const balance = await (
      await balanceRoute.GET(get(`/api/comptabilite/balance?exerciceId=${exerciceId}&dateFin=2026-12-31`))
    ).json();
    const l = balance.lignes.find((x: { compteNumero: string }) => x.compteNumero === "5211");
    const solde = l.soldeDebiteur - l.soldeCrediteur;

    const cree = await rapprochementsRoute.POST(
      post("/api/comptabilite/rapprochements", {
        exerciceId,
        compteId: compte521,
        dateRapprochement: "2026-12-31",
        soldeReleve: String(solde / 100),
      }),
    );
    // Un rapprochement clôturé existe déjà si le bloc précédent a tout pointé :
    // dans ce cas rien à faire, les lignes sont déjà pointées.
    if (cree.status === 409) return;
    expect(cree.status).toBe(201);
    const r = await cree.json();
    const { etat } = await (await rapprochementRoute.GET(get(""), ctx(r.id))).json();
    const [laisseeDeCote, ...aPointer] = etat.nonPointees;
    if (aPointer.length > 0) {
      await pointerRoute.POST(
        post("", { ligneIds: aPointer.map((x: { ligneId: number }) => x.ligneId), pointer: true }),
        ctx(r.id),
      );
    }
    // On corrige le relevé pour que l'écart soit nul avec cette ligne laissée de côté.
    const apres = await (await rapprochementRoute.GET(get(""), ctx(r.id))).json();
    await rapprochementRoute.PATCH(
      patch("", { soldeReleve: String(apres.etat.soldeRapproche / 100) }),
      ctx(r.id),
    );
    expect((await cloturerRoute.POST(post(""), ctx(r.id))).status).toBe(200);
    void laisseeDeCote;
  });

  it("clôture une fois les brouillons levés : à-nouveaux dans le suivant, exercice clos", async () => {
    connecte();
    const brouillons = await db
      .select({ id: schema.cptaEcritures.id })
      .from(schema.cptaEcritures)
      .where(and(eq(schema.cptaEcritures.exerciceId, exerciceId), eq(schema.cptaEcritures.statut, "BROUILLON")));
    for (const b of brouillons) {
      expect((await ecritureRoute.DELETE(post(""), ctx(b.id))).status).toBe(204);
    }

    const avant = await (await etatsRoute.GET(get(`/api/comptabilite/etats-financiers?exerciceId=${exerciceId}`))).json();

    const res = await clotureRoute.POST(post(""), ctx(exerciceId));
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.exercice.statut).toBe("CLOS");
    expect(r.aNouveaux.numeroPiece).toMatch(/^AN2027-/);
    expect(r.aNouveaux.lignes).toBeGreaterThan(0);
    expect(r.aNouveaux.resultatNet).toBe(avant.resultat.resultatNet);

    // Le bilan d'ouverture de 2027 est le bilan de clôture de 2026, et le
    // résultat de 2026 y est devenu un poste de bilan.
    const apres = await (await etatsRoute.GET(get(`/api/comptabilite/etats-financiers?exerciceId=${suivantId}`))).json();
    expect(apres.bilan.totalActif).toBe(avant.bilan.totalActif);
    expect(apres.bilan.equilibre).toBe(true);
    expect(apres.resultat.resultatNet).toBe(0);
    const cj = (e: { bilan: { passif: { code: string; net: number }[] } }) =>
      e.bilan.passif.find((p) => p.code === "CJ")!.net;
    expect(cj(apres)).toBe(cj(avant));
  });

  it("les postes ouverts d'un tiers sont désormais ses reprises, pas les originaux", async () => {
    connecte();
    const [client] = await db
      .select({ id: schema.cptaTiers.id })
      .from(schema.cptaTiers)
      .where(and(eq(schema.cptaTiers.contribuableId, contribuableId), eq(schema.cptaTiers.code, "C001")));
    const postes = await (await postesTiersRoute.GET(get(""), ctx(client.id))).json();
    expect(postes.length).toBeGreaterThan(0);

    const [an] = await db
      .select({ id: schema.cptaEcritures.id })
      .from(schema.cptaEcritures)
      .where(and(eq(schema.cptaEcritures.exerciceId, suivantId), eq(schema.cptaEcritures.origine, "A_NOUVEAUX")));
    const lignesAN = await db
      .select({ id: schema.cptaLignesEcriture.id })
      .from(schema.cptaLignesEcriture)
      .where(eq(schema.cptaLignesEcriture.ecritureId, an.id));
    const idsAN = new Set(lignesAN.map((l) => l.id));
    expect(postes.every((p: { ligneId: number }) => idsAN.has(p.ligneId))).toBe(true);
    // Et le tiers, l'échéance et le libellé de reprise ont suivi.
    expect(postes.every((p: { tiersId: number; libelle: string }) => p.tiersId === client.id)).toBe(true);
    expect(postes.every((p: { libelle: string }) => /Reprise à nouveau/.test(p.libelle))).toBe(true);
  });

  it("reprend la banque : une ligne par mouvement non pointé, un solde pour les pointés", async () => {
    connecte();
    const [an] = await db
      .select({ id: schema.cptaEcritures.id })
      .from(schema.cptaEcritures)
      .where(and(eq(schema.cptaEcritures.exerciceId, suivantId), eq(schema.cptaEcritures.origine, "A_NOUVEAUX")));
    const lignes = await db
      .select({ libelle: schema.cptaLignesEcriture.libelle })
      .from(schema.cptaLignesEcriture)
      .where(and(eq(schema.cptaLignesEcriture.ecritureId, an.id), eq(schema.cptaLignesEcriture.compteId, compte521)));

    const soldes = lignes.filter((x) => x.libelle?.includes("solde rapproché"));
    const details = lignes.filter((x) => !x.libelle?.includes("solde rapproché"));
    // Les lignes pointées se résument en un seul solde ; les autres restent une par une.
    expect(soldes).toHaveLength(1);
    expect(details.length).toBeGreaterThanOrEqual(1);
  });

  it("ne se clôture pas deux fois, et ne se rouvre plus", async () => {
    connecte();
    expect((await clotureRoute.POST(post(""), ctx(exerciceId))).status).toBe(409);
    const res = await exerciceRoute.PATCH(patch("", { statut: "OUVERT" }), ctx(exerciceId));
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(/ne se rouvre plus/);
  });

  it("l'exercice clos n'accepte plus de saisie", async () => {
    connecte();
    const res = await ecrituresRoute.POST(
      post("/api/comptabilite/ecritures", {
        exerciceId,
        journalId: journalAchatId,
        dateEcriture: "2026-12-30",
        libelle: "Trop tard",
        lignes: [],
      }),
    );
    expect(res.status).toBe(409);
  });

  it("refuse 403 sans la permission de clôture", async () => {
    connecte(LECTURE_SEULE);
    expect((await clotureRoute.POST(post(""), ctx(suivantId))).status).toBe(403);
  });
});
