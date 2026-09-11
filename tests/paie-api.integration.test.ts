import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

/**
 * Tests d'intégration de l'API de paie (E4).
 *
 * Même procédé que la comptabilité : handlers réels, base réelle, session
 * simulée. Un contribuable témoin reçoit des salariés, un mois de paie, des
 * éléments, une validation.
 */

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/session", () => session);

const { db } = await import("@/db");
const schema = await import("@/db/schema");

const salariesRoute = await import("@/app/api/paie/salaries/route");
const salarieRoute = await import("@/app/api/paie/salaries/[id]/route");
const periodesRoute = await import("@/app/api/paie/periodes/route");
const periodeRoute = await import("@/app/api/paie/periodes/[id]/route");
const validerRoute = await import("@/app/api/paie/periodes/[id]/valider/route");
const recalculerRoute = await import("@/app/api/paie/periodes/[id]/recalculer/route");
const bulletinRoute = await import("@/app/api/paie/bulletins/[id]/route");
const baremeRoute = await import("@/app/api/paie/bareme/route");
const comptabiliserRoute = await import("@/app/api/paie/periodes/[id]/comptabiliser/route");
const bulletinPdfRoute = await import("@/app/api/paie/bulletins/[id]/pdf/route");
const periodePdfRoute = await import("@/app/api/paie/periodes/[id]/pdf/route");
const dipeRoute = await import("@/app/api/paie/periodes/[id]/dipe/route");
const exercicesRoute = await import("@/app/api/comptabilite/exercices/route");

const NOM_TEMOIN = "ZZ TEST API PAIE";
const ACCES_TOTAL = [{ ressource: "*", actions: ["*"] }];
const LECTURE_SEULE = [{ ressource: "paie", actions: ["read"] }];

let adminId: number;
let contribuableId: number;
let salarieId: number;
let sortiId: number;
let periodeId: number;
let bulletinId: number;

function connecte(permissions: unknown = ACCES_TOTAL) {
  session.getSessionUser.mockResolvedValue({ id: adminId, nom: "Test", email: "test@lamethode.cm", roleNom: "ADMIN", permissions });
}
function deconnecte() {
  session.getSessionUser.mockResolvedValue(null);
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
    await db.delete(schema.paiePeriodes).where(eq(schema.paiePeriodes.contribuableId, id));
    await db.delete(schema.paieSalaries).where(eq(schema.paieSalaries.contribuableId, id));
    await db.delete(schema.cnpsCotisations).where(eq(schema.cnpsCotisations.contribuableId, id));
    const exercices = await db.select({ id: schema.cptaExercices.id }).from(schema.cptaExercices).where(eq(schema.cptaExercices.contribuableId, id));
    for (const ex of exercices) {
      await db.delete(schema.cptaSequences).where(eq(schema.cptaSequences.exerciceId, ex.id));
      await db.delete(schema.cptaEcritures).where(eq(schema.cptaEcritures.exerciceId, ex.id));
    }
    await db.delete(schema.cptaExercices).where(eq(schema.cptaExercices.contribuableId, id));
    await db.delete(schema.cptaTiers).where(eq(schema.cptaTiers.contribuableId, id));
    await db.delete(schema.cptaTaxes).where(eq(schema.cptaTaxes.contribuableId, id));
    await db.delete(schema.cptaJournaux).where(eq(schema.cptaJournaux.contribuableId, id));
    await db.delete(schema.cptaComptes).where(eq(schema.cptaComptes.contribuableId, id));
    await db.delete(schema.contribuables).where(eq(schema.contribuables.id, id));
  }
}

beforeAll(async () => {
  await nettoyer();
  const [admin] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (!admin) throw new Error("Base non peuplée : lancez `npm run db:seed` d'abord.");
  adminId = admin.id;
  const [ctb] = await db
    .insert(schema.contribuables)
    .values({ nom: NOM_TEMOIN, niu: "ZZPAIE00000001", regimeFiscal: "REEL" })
    .returning();
  contribuableId = ctb.id;
});

afterAll(async () => {
  await nettoyer();
});

const FICHE = {
  matricule: "S001",
  nom: "MBARGA",
  prenoms: "Jean",
  numeroCnps: "123-456-789",
  dateEmbauche: "2024-03-01",
  poste: "Comptable",
  categorie: "VII",
  salaireBase: "500000",
  regimeCnps: "GENERAL",
  groupeRisque: "A",
  modePaiement: "VIREMENT",
  rubriquesFixes: [{ libelle: "Prime de transport", montant: "25000", cotisable: false, imposable: false }],
};

describe("barème", () => {
  it("se lit, avec au moins la version livrée", async () => {
    connecte();
    const res = await baremeRoute.GET();
    expect(res.status).toBe(200);
    const { versions } = await res.json();
    expect(versions.length).toBeGreaterThan(0);
    expect(versions[0].cnps.plafondMensuel).toBe(750_000);
  });

  it("refuse une version incohérente, et l'explique", async () => {
    connecte();
    const { versions } = await (await baremeRoute.GET()).json();
    const faux = { ...versions[0], valideDu: "2030-01-01", tdl: [{ jusqua: 100, montant: 1 }, { jusqua: 50, montant: 2 }] };
    const res = await baremeRoute.PUT(put("/api/paie/bareme", { versions: [...versions, faux] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/TDL/);
  });

  it("refuse 403 sans la permission paramètres", async () => {
    connecte(LECTURE_SEULE);
    const res = await baremeRoute.PUT(put("/api/paie/bareme", { versions: [] }));
    expect(res.status).toBe(403);
  });
});

describe("salariés", () => {
  it("crée une fiche avec ses primes fixes", async () => {
    connecte();
    const res = await salariesRoute.POST(post("/api/paie/salaries", { contribuableId, ...FICHE }));
    expect(res.status).toBe(201);
    const s = await res.json();
    salarieId = s.id;
    expect(s.salaireBase).toBe("500000.00");
    expect(s.rubriquesFixes).toHaveLength(1);
    expect(s.rubriquesFixes[0].montant).toBe("25000.00");
  });

  it("refuse un matricule déjà pris", async () => {
    connecte();
    const res = await salariesRoute.POST(post("/api/paie/salaries", { contribuableId, ...FICHE, nom: "AUTRE" }));
    expect(res.status).toBe(409);
  });

  it("refuse une fiche mal formée en 422", async () => {
    connecte();
    const res = await salariesRoute.POST(post("/api/paie/salaries", { contribuableId, ...FICHE, matricule: "S002", salaireBase: "cinq cent mille" }));
    expect(res.status).toBe(422);
  });

  it("un salarié sorti avant le mois n'y aura pas de bulletin", async () => {
    connecte();
    const res = await salariesRoute.POST(
      post("/api/paie/salaries", { contribuableId, ...FICHE, matricule: "S009", nom: "PARTI", dateEmbauche: "2023-01-01", dateSortie: "2026-05-31", rubriquesFixes: [] }),
    );
    expect(res.status).toBe(201);
    sortiId = (await res.json()).id;
  });

  it("liste par contribuable, actifs seulement si demandé", async () => {
    connecte();
    const tous = await (await salariesRoute.GET(get(`/api/paie/salaries?contribuableId=${contribuableId}`))).json();
    expect(tous.map((s: { matricule: string }) => s.matricule)).toEqual(["S001", "S009"]);
  });

  it("modifie la fiche et remplace ses primes", async () => {
    connecte();
    const res = await salarieRoute.PUT(
      put("", { ...FICHE, poste: "Chef comptable", rubriquesFixes: [...FICHE.rubriquesFixes, { libelle: "Prime de responsabilité", montant: "50000", cotisable: true, imposable: true }] }),
      ctx(salarieId),
    );
    expect(res.status).toBe(200);
    const s = await res.json();
    expect(s.poste).toBe("Chef comptable");
    expect(s.rubriquesFixes.map((r: { libelle: string }) => r.libelle)).toEqual(["Prime de transport", "Prime de responsabilité"]);
  });

  it("refuse 401 sans session", async () => {
    deconnecte();
    expect((await salariesRoute.GET(get(`/api/paie/salaries?contribuableId=${contribuableId}`))).status).toBe(401);
  });
});

describe("mois de paie", () => {
  it("s'ouvre avec un bulletin par salarié présent, calculé sur la fiche", async () => {
    connecte();
    const res = await periodesRoute.POST(post("/api/paie/periodes", { contribuableId, periode: "2026-06" }));
    expect(res.status).toBe(201);
    const p = await res.json();
    periodeId = p.id;
    expect(p.statut).toBe("BROUILLON");
    expect(p.baremeValideDu).toBe("2016-07-01");
    // S009 est sorti fin mai : un seul bulletin.
    expect(p.bulletins).toHaveLength(1);
    const b = p.bulletins[0];
    bulletinId = b.id;
    expect(b.matricule).toBe("S001");
    expect(b.nomComplet).toBe("MBARGA Jean");
    // 500 000 + 25 000 transport (hors bases) + 50 000 responsabilité (dans les bases).
    expect(b.brut).toBe("575000.00");
    expect(b.brutCotisable).toBe("550000.00");
    expect(b.brutImposable).toBe("550000.00");
    expect(b.cnpsSalarie).toBe("23100.00");
    expect(p.totaux.brut).toBe("575000.00");
  });

  it("ne s'ouvre pas deux fois", async () => {
    connecte();
    const res = await periodesRoute.POST(post("/api/paie/periodes", { contribuableId, periode: "2026-06" }));
    expect(res.status).toBe(409);
  });

  it("refuse un mois sans salarié présent", async () => {
    connecte();
    const res = await periodesRoute.POST(post("/api/paie/periodes", { contribuableId, periode: "2020-01" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/Aucun salarié/);
  });

  it("le bulletin se lit avec ses lignes dans l'ordre gains, retenues, employeur", async () => {
    connecte();
    const b = await (await bulletinRoute.GET(get(""), ctx(bulletinId))).json();
    const types = b.lignes.map((l: { type: string }) => l.type);
    expect(types.indexOf("RETENUE")).toBeGreaterThan(types.lastIndexOf("GAIN"));
    expect(types.indexOf("EMPLOYEUR")).toBeGreaterThan(types.lastIndexOf("RETENUE"));
    expect(b.lignes.find((l: { code: string }) => l.code === "PVID_SALARIE")).toMatchObject({ base: "550000.00", taux: "4.2000", montant: "23100.00" });
    expect(b.periode.periode).toBe("2026-06");
  });

  it("reçoit les éléments du mois et se recalcule", async () => {
    connecte();
    const res = await bulletinRoute.PUT(
      put("", { joursAbsence: 3, heuresSup: "20000", primes: [{ libelle: "Prime exceptionnelle", montant: "30000", cotisable: true, imposable: true }], avances: "100000", autresRetenues: [] }),
      ctx(bulletinId),
    );
    expect(res.status).toBe(200);
    const b = await res.json();
    // 575 000 − 50 000 (3/30 de 500 000) + 20 000 + 30 000.
    expect(b.brut).toBe("575000.00");
    expect(b.avances).toBe("100000.00");
    expect(b.lignes.find((l: { code: string }) => l.code === "ABSENCE").montant).toBe("-50000.00");
    expect(b.elements.joursAbsence).toBe(3);
    expect(Number(b.netAPayer)).toBe(Number(b.brut) - Number(b.totalRetenues));
  });

  it("refuse des éléments qui rendraient le net négatif, en nommant le salarié", async () => {
    connecte();
    const res = await bulletinRoute.PUT(put("", { avances: "900000" }), ctx(bulletinId));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/S001.*négatif/);
  });

  it("se recalcule sur les fiches d'aujourd'hui, éléments conservés", async () => {
    connecte();
    // Le salaire de base passe à 600 000 ; S009 revient (plus de date de sortie).
    await salarieRoute.PUT(put("", { ...FICHE, salaireBase: "600000", rubriquesFixes: [] }), ctx(salarieId));
    await salarieRoute.PUT(put("", { ...FICHE, matricule: "S009", nom: "PARTI", dateEmbauche: "2023-01-01", dateSortie: null, salaireBase: "80000", rubriquesFixes: [] }), ctx(sortiId));

    const res = await recalculerRoute.POST(post(""), ctx(periodeId));
    expect(res.status).toBe(200);
    const p = await res.json();
    expect(p.bulletins).toHaveLength(2);
    const b = p.bulletins.find((x: { matricule: string }) => x.matricule === "S001");
    expect(b.salaireBase).toBe("600000.00");
    expect(b.elements.joursAbsence).toBe(3);
    // 600 000 − 60 000 + 20 000 + 30 000, plus aucune prime fixe.
    expect(b.brut).toBe("590000.00");
    const petit = p.bulletins.find((x: { matricule: string }) => x.matricule === "S009");
    // 80 000 × 70 % − 3 360 = 52 640 ; × 12 − 500 000 = 131 680 ; 10 % / 12 = 1 097.
    expect(petit.irpp).toBe("1097.00");
    expect(petit.tdl).toBe("500.00");
  });

  it("la liste des mois porte les totaux", async () => {
    connecte();
    const liste = await (await periodesRoute.GET(get(`/api/paie/periodes?contribuableId=${contribuableId}`))).json();
    expect(liste).toHaveLength(1);
    expect(liste[0].bulletins).toBe(2);
    expect(Number(liste[0].totalBrut)).toBe(590_000 + 80_000);
  });

  it("se valide, puis ne bouge plus ; sans exercice ouvert, l'écriture attend et le dit", async () => {
    connecte();
    const res = await validerRoute.POST(post(""), ctx(periodeId));
    expect(res.status).toBe(200);
    const v = await res.json();
    expect(v.statut).toBe("VALIDEE");
    expect(v.ecriture).toBeNull();
    expect(v.motif).toMatch(/Aucun exercice comptable/);
    // La ligne CNPS du mois est posée, à l'échéance du 15 du mois suivant.
    expect(v.cnps.periode).toBe("2026-06");
    expect(v.cnps.dateEcheance).toBe("2026-07-15");
    expect(Number(v.cnps.masseSalariale)).toBe(590_000 + 80_000);
    expect(Number(v.cnps.montantSalarie)).toBe(Math.round((590_000 + 80_000) * 0.042));

    expect((await bulletinRoute.PUT(put("", { joursAbsence: 1 }), ctx(bulletinId))).status).toBe(409);
    expect((await recalculerRoute.POST(post(""), ctx(periodeId))).status).toBe(409);
    expect((await periodeRoute.DELETE(post(""), ctx(periodeId))).status).toBe(409);
    expect((await validerRoute.POST(post(""), ctx(periodeId))).status).toBe(409);
  });

  it("un salarié avec des bulletins ne se supprime pas", async () => {
    connecte();
    const res = await salarieRoute.DELETE(post(""), ctx(salarieId));
    expect(res.status).toBe(409);
  });

  it("un mois en brouillon se jette avec ses bulletins", async () => {
    connecte();
    const p = await (await periodesRoute.POST(post("/api/paie/periodes", { contribuableId, periode: "2026-07" }))).json();
    expect(p.bulletins).toHaveLength(2);
    expect((await periodeRoute.DELETE(post(""), ctx(p.id))).status).toBe(204);
    expect((await periodeRoute.GET(get(""), ctx(p.id))).status).toBe(404);
  });

  it("refuse 403 en lecture seule", async () => {
    connecte(LECTURE_SEULE);
    expect((await periodesRoute.POST(post("/api/paie/periodes", { contribuableId, periode: "2026-08" }))).status).toBe(403);
    expect((await periodeRoute.GET(get(""), ctx(periodeId))).status).toBe(200);
  });
});

describe("après validation : écriture, CNPS, documents", () => {
  it("comptabilise le mois une fois l'exercice ouvert : écriture équilibrée sur les comptes de paie", async () => {
    connecte();
    const ex = await exercicesRoute.POST(
      post("/api/comptabilite/exercices", { contribuableId, libelle: "Exercice 2026", dateDebut: "2026-01-01", dateFin: "2026-12-31" }),
    );
    expect(ex.status).toBe(201);

    const res = await comptabiliserRoute.POST(post(""), ctx(periodeId));
    expect(res.status).toBe(200);
    const e = await res.json();
    expect(e.statut).toBe("VALIDEE");
    expect(e.origine).toBe("PAIE");
    expect(e.origineId).toBe(periodeId);
    expect(e.numeroPiece).toMatch(/^OD2026-/);
    expect(e.dateEcriture).toBe("2026-06-30");

    const lignes = await db
      .select({ numero: schema.cptaComptes.numero, tiersId: schema.cptaLignesEcriture.tiersId, debit: schema.cptaLignesEcriture.debit, credit: schema.cptaLignesEcriture.credit })
      .from(schema.cptaLignesEcriture)
      .innerJoin(schema.cptaComptes, eq(schema.cptaLignesEcriture.compteId, schema.cptaComptes.id))
      .where(eq(schema.cptaLignesEcriture.ecritureId, e.id));
    const par = (n: string) => lignes.find((l) => l.numero === n);
    // S001 : 600 000 − 60 000 + 20 000 = 560 000 de salaire, 30 000 de prime ; S009 : 80 000.
    expect(par("6611")?.debit).toBe("640000.00");
    expect(par("6612")?.debit).toBe("30000.00");
    // Une ligne de net par salarié, chacune sur son tiers ; un seul acompte.
    const nets = lignes.filter((l) => l.numero === "422");
    expect(nets).toHaveLength(2);
    expect(nets.every((l) => l.tiersId !== null)).toBe(true);
    expect(par("421")?.credit).toBe("100000.00");
    const s = await (await salarieRoute.GET(get(""), ctx(salarieId))).json();
    expect(s.tiersId).not.toBeNull();
    const [tiers] = await db.select().from(schema.cptaTiers).where(eq(schema.cptaTiers.id, s.tiersId));
    expect(tiers.code).toBe("SAL-S001");
    expect(tiers.types).toEqual(["SALARIE"]);
    expect(par("431")?.credit).toBeDefined();
    expect(par("4471")?.credit).toBeDefined();
    const debit = lignes.reduce((s, l) => s + Number(l.debit ?? 0), 0);
    const credit = lignes.reduce((s, l) => s + Number(l.credit ?? 0), 0);
    expect(debit).toBe(credit);

    const p = await (await periodeRoute.GET(get(""), ctx(periodeId))).json();
    expect(p.ecritureId).toBe(e.id);
  });

  it("ne se comptabilise pas deux fois", async () => {
    connecte();
    expect((await comptabiliserRoute.POST(post(""), ctx(periodeId))).status).toBe(409);
  });

  it("un bulletin s'imprime, et le mois entier aussi", async () => {
    connecte();
    const un = await bulletinPdfRoute.GET(get(""), ctx(bulletinId));
    expect(un.status).toBe(200);
    expect(un.headers.get("content-type")).toBe("application/pdf");
    expect(un.headers.get("content-disposition")).toMatch(/inline; filename="Bulletin_S001_2026-06\.pdf"/);
    expect(Buffer.from(await un.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");

    const tous = await periodePdfRoute.GET(get(""), ctx(periodeId));
    expect(tous.status).toBe(200);
    expect(tous.headers.get("content-disposition")).toMatch(/Bulletins_2026-06\.pdf/);
  });

  it("le DIPE du mois sort en classeur, une ligne par salarié et un total", async () => {
    connecte();
    const res = await dipeRoute.GET(get(""), ctx(periodeId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="DIPE_2026-06\.xlsx"/);
    const buf = Buffer.from(await res.arrayBuffer());
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("DIPE 2026-06")!;
    expect(ws.getCell("A1").value).toBe("Matricule");
    expect(ws.getCell("A2").value).toBe("S001");
    expect(ws.getCell("A3").value).toBe("S009");
    expect(ws.getCell("A4").value).toBe("TOTAL");
    expect(ws.getCell("H2").value).toBe(590_000);
  });

  it("refuse 403 en lecture seule sur la comptabilisation", async () => {
    connecte(LECTURE_SEULE);
    expect((await comptabiliserRoute.POST(post(""), ctx(periodeId))).status).toBe(403);
  });
});
