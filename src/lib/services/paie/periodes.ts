import "server-only";
import { and, asc, desc, eq, sql, count, inArray } from "drizzle-orm";
import { db } from "@/db";
import { paieBulletinLignes, paieBulletins, paiePeriodes, paieRubriquesFixes, paieSalaries } from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/http";
import { formatMontant, parseMontant } from "@/lib/comptable/money";
import { calculerBulletin, PaieInvalideError, type Bulletin, type Rubrique } from "@/lib/paie/calcul";
import { baremeEnVigueur, type AvantageNature, type BaremePaie } from "@/lib/paie/bareme";
import type { ElementsBulletinSaisis } from "@/lib/schemas/paie";
import { baremePourPeriode, lireBaremePaie } from "./bareme";
import { comptabiliserSiPossible, reporterCotisationsCnps } from "./comptabilisation";

/**
 * Mois de paie et bulletins.
 *
 * Ouvrir un mois, c'est calculer un bulletin pour chaque salarié présent :
 * sa fiche donne le fixe, le barème du mois donne les taux. Tant que le mois
 * est en brouillon, chaque bulletin reçoit ses éléments — absences, heures
 * supplémentaires, primes du mois, acomptes — et se recalcule ; le mois
 * entier peut aussi se recalculer si une fiche a changé entre-temps.
 *
 * Validé, le mois est figé : ce que les bulletins portent est ce qui a été
 * remis aux salariés et déclaré. Le barème qui l'a calculé est noté sur le
 * mois, pour qu'on sache toujours avec quoi il a été fait.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Salarie = typeof paieSalaries.$inferSelect;

const ELEMENTS_VIDES: ElementsBulletinSaisis = { joursAbsence: 0, heuresSup: null, primes: [], avances: null, autresRetenues: [] };

function bornesDuMois(periode: string) {
  const [a, m] = periode.split("-").map(Number);
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { debut: `${periode}-01`, fin: `${periode}-${String(dernier).padStart(2, "0")}` };
}

/** Présent dans le mois : embauché avant sa fin, pas sorti avant son début. */
function presentDansLeMois(s: Salarie, periode: string) {
  const { debut, fin } = bornesDuMois(periode);
  return s.actif && s.dateEmbauche <= fin && (!s.dateSortie || s.dateSortie >= debut);
}

function montantOuZero(v: string | number | null | undefined) {
  return v === null || v === undefined || v === "" ? 0 : parseMontant(v);
}

/** Calcule le bulletin d'un salarié pour le mois, fixe et éléments compris. */
function calculer(
  salarie: Salarie,
  rubriquesFixes: { libelle: string; montant: string; cotisable: boolean; imposable: boolean }[],
  elements: ElementsBulletinSaisis,
  bareme: BaremePaie,
): Bulletin {
  const rubriques: Rubrique[] = [
    ...rubriquesFixes.map((r) => ({ libelle: r.libelle, montant: parseMontant(r.montant), cotisable: r.cotisable, imposable: r.imposable })),
    ...elements.primes.map((r) => ({ libelle: r.libelle, montant: parseMontant(r.montant), cotisable: r.cotisable, imposable: r.imposable })),
  ];
  try {
    return calculerBulletin(
      {
        salaireBase: parseMontant(salarie.salaireBase),
        regimeCnps: salarie.regimeCnps,
        groupeRisque: salarie.groupeRisque,
        joursAbsence: elements.joursAbsence,
        heuresSup: montantOuZero(elements.heuresSup),
        rubriques,
        avantagesNature: salarie.avantagesNature as AvantageNature[],
        avances: montantOuZero(elements.avances),
        autresRetenues: elements.autresRetenues.map((r) => ({ libelle: r.libelle, montant: parseMontant(r.montant) })),
      },
      bareme,
    );
  } catch (e) {
    if (e instanceof PaieInvalideError) throw badRequest(`${salarie.matricule} — ${e.message}`);
    throw e;
  }
}

function colonnesBulletin(salarie: Salarie, elements: ElementsBulletinSaisis, b: Bulletin) {
  const t = b.totaux;
  const m = formatMontant;
  return {
    elements: elements as unknown as Record<string, unknown>,
    matricule: salarie.matricule,
    nomComplet: [salarie.nom, salarie.prenoms].filter(Boolean).join(" "),
    poste: salarie.poste,
    categorie: salarie.categorie,
    numeroCnps: salarie.numeroCnps,
    salaireBase: salarie.salaireBase,
    regimeCnps: salarie.regimeCnps,
    groupeRisque: salarie.groupeRisque,
    modePaiement: salarie.modePaiement,
    brut: m(t.brut),
    brutCotisable: m(t.brutCotisable),
    brutImposable: m(t.brutImposable),
    cnpsSalarie: m(t.cnpsSalarie),
    irpp: m(t.irpp),
    cac: m(t.cac),
    cfcSalarie: m(t.cfcSalarie),
    tdl: m(t.tdl),
    rav: m(t.rav),
    avances: m(t.avances),
    autresRetenues: m(t.autresRetenues),
    totalRetenues: m(t.totalRetenues),
    netAPayer: m(t.netAPayer),
    cnpsEmployeur: m(t.pvidEmployeur + t.prestationsFamiliales + t.accidentsTravail),
    cfcEmployeur: m(t.cfcEmployeur),
    fne: m(t.fne),
    chargesEmployeur: m(t.chargesEmployeur),
    updatedAt: new Date(),
  };
}

async function ecrireLignes(tx: Tx, bulletinId: number, b: Bulletin) {
  await tx.delete(paieBulletinLignes).where(eq(paieBulletinLignes.bulletinId, bulletinId));
  await tx.insert(paieBulletinLignes).values(
    b.lignes.map((l, i) => ({
      bulletinId,
      ordre: i,
      type: l.type,
      code: l.code,
      libelle: l.libelle,
      base: l.base === undefined ? null : formatMontant(l.base),
      taux: l.taux === undefined ? null : l.taux.toFixed(4),
      montant: formatMontant(l.montant),
      enNature: !!l.enNature,
    })),
  );
}

async function rubriquesDe(salarieIds: number[]) {
  if (salarieIds.length === 0) return new Map<number, (typeof paieRubriquesFixes.$inferSelect)[]>();
  const rows = await db
    .select()
    .from(paieRubriquesFixes)
    .where(inArray(paieRubriquesFixes.salarieId, salarieIds))
    .orderBy(asc(paieRubriquesFixes.ordre));
  const parSalarie = new Map<number, typeof rows>();
  for (const r of rows) {
    const l = parSalarie.get(r.salarieId);
    if (l) l.push(r);
    else parSalarie.set(r.salarieId, [r]);
  }
  return parSalarie;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function listerPeriodes(contribuableId: number) {
  return db
    .select({
      id: paiePeriodes.id,
      periode: paiePeriodes.periode,
      statut: paiePeriodes.statut,
      baremeValideDu: paiePeriodes.baremeValideDu,
      ecritureId: paiePeriodes.ecritureId,
      valideeLe: paiePeriodes.valideeLe,
      bulletins: count(paieBulletins.id),
      totalBrut: sql<string>`coalesce(sum(${paieBulletins.brut}), 0)`,
      totalNet: sql<string>`coalesce(sum(${paieBulletins.netAPayer}), 0)`,
      totalCharges: sql<string>`coalesce(sum(${paieBulletins.chargesEmployeur}), 0)`,
    })
    .from(paiePeriodes)
    .leftJoin(paieBulletins, eq(paieBulletins.periodeId, paiePeriodes.id))
    .where(eq(paiePeriodes.contribuableId, contribuableId))
    .groupBy(paiePeriodes.id)
    .orderBy(desc(paiePeriodes.periode));
}

export async function getPeriode(id: number) {
  const [periode] = await db.select().from(paiePeriodes).where(eq(paiePeriodes.id, id));
  if (!periode) throw notFound("Mois de paie introuvable.");
  const bulletins = await db
    .select()
    .from(paieBulletins)
    .where(eq(paieBulletins.periodeId, id))
    .orderBy(asc(paieBulletins.matricule));
  const somme = (champ: keyof (typeof bulletins)[number]) =>
    formatMontant(bulletins.reduce((s, b) => s + parseMontant(b[champ] as string), 0));
  return {
    ...periode,
    bulletins,
    totaux: {
      brut: somme("brut"),
      brutCotisable: somme("brutCotisable"),
      brutImposable: somme("brutImposable"),
      cnpsSalarie: somme("cnpsSalarie"),
      irpp: somme("irpp"),
      cac: somme("cac"),
      cfcSalarie: somme("cfcSalarie"),
      tdl: somme("tdl"),
      rav: somme("rav"),
      totalRetenues: somme("totalRetenues"),
      netAPayer: somme("netAPayer"),
      cnpsEmployeur: somme("cnpsEmployeur"),
      cfcEmployeur: somme("cfcEmployeur"),
      fne: somme("fne"),
      chargesEmployeur: somme("chargesEmployeur"),
    },
  };
}

export async function getBulletin(id: number) {
  const [bulletin] = await db.select().from(paieBulletins).where(eq(paieBulletins.id, id));
  if (!bulletin) throw notFound("Bulletin introuvable.");
  const [periode] = await db.select().from(paiePeriodes).where(eq(paiePeriodes.id, bulletin.periodeId));
  const lignes = await db
    .select()
    .from(paieBulletinLignes)
    .where(eq(paieBulletinLignes.bulletinId, id))
    .orderBy(asc(paieBulletinLignes.ordre));
  return { ...bulletin, periode: { id: periode.id, periode: periode.periode, statut: periode.statut, contribuableId: periode.contribuableId }, lignes };
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

async function periodeModifiable(id: number) {
  const [periode] = await db.select().from(paiePeriodes).where(eq(paiePeriodes.id, id));
  if (!periode) throw notFound("Mois de paie introuvable.");
  if (periode.statut !== "BROUILLON") throw conflict("Ce mois de paie est validé : il ne se modifie plus.");
  return periode;
}

/** Ouvre le mois : un bulletin par salarié présent, calculé sur sa fiche. */
export async function ouvrirPeriode(contribuableId: number, periode: string, userId: number | null) {
  const [existante] = await db
    .select({ id: paiePeriodes.id })
    .from(paiePeriodes)
    .where(and(eq(paiePeriodes.contribuableId, contribuableId), eq(paiePeriodes.periode, periode)));
  if (existante) throw conflict(`Le mois ${periode} est déjà ouvert.`);

  const bareme = await baremePourPeriode(periode);
  const salaries = (await db.select().from(paieSalaries).where(eq(paieSalaries.contribuableId, contribuableId))).filter((s) =>
    presentDansLeMois(s, periode),
  );
  if (salaries.length === 0) throw badRequest("Aucun salarié présent ce mois-ci : créez d'abord les fiches.");
  const rubriques = await rubriquesDe(salaries.map((s) => s.id));

  const id = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(paiePeriodes)
      .values({ contribuableId, periode, baremeValideDu: bareme.valideDu, createdBy: userId })
      .returning({ id: paiePeriodes.id });
    for (const s of salaries) {
      const b = calculer(s, rubriques.get(s.id) ?? [], ELEMENTS_VIDES, bareme);
      const [row] = await tx
        .insert(paieBulletins)
        .values({ periodeId: p.id, salarieId: s.id, ...colonnesBulletin(s, ELEMENTS_VIDES, b) })
        .returning({ id: paieBulletins.id });
      await ecrireLignes(tx, row.id, b);
    }
    return p.id;
  });
  return getPeriode(id);
}

/** Enregistre les éléments du mois d'un bulletin et le recalcule. */
export async function modifierElementsBulletin(bulletinId: number, elements: ElementsBulletinSaisis) {
  const bulletin = await getBulletin(bulletinId);
  const periode = await periodeModifiable(bulletin.periodeId);
  const bareme = baremeEnVigueur(await lireBaremePaie(), periode.periode);
  if (!bareme) throw badRequest(`Aucun barème ne s'applique à ${periode.periode}.`);
  const [salarie] = await db.select().from(paieSalaries).where(eq(paieSalaries.id, bulletin.salarieId));
  const rubriques = (await rubriquesDe([salarie.id])).get(salarie.id) ?? [];

  const b = calculer(salarie, rubriques, elements, bareme);
  await db.transaction(async (tx) => {
    await tx.update(paieBulletins).set(colonnesBulletin(salarie, elements, b)).where(eq(paieBulletins.id, bulletinId));
    await ecrireLignes(tx, bulletinId, b);
  });
  return getBulletin(bulletinId);
}

/**
 * Recalcule tout le mois sur les fiches d'aujourd'hui : un salaire modifié,
 * un salarié ajouté ou sorti depuis l'ouverture. Les éléments saisis sont
 * conservés.
 */
export async function recalculerPeriode(id: number) {
  const periode = await periodeModifiable(id);
  const bareme = await baremePourPeriode(periode.periode);
  const salaries = (await db.select().from(paieSalaries).where(eq(paieSalaries.contribuableId, periode.contribuableId))).filter((s) =>
    presentDansLeMois(s, periode.periode),
  );
  const rubriques = await rubriquesDe(salaries.map((s) => s.id));
  const existants = await db.select().from(paieBulletins).where(eq(paieBulletins.periodeId, id));
  const parSalarie = new Map(existants.map((b) => [b.salarieId, b]));
  const presents = new Set(salaries.map((s) => s.id));

  await db.transaction(async (tx) => {
    for (const b of existants) {
      if (!presents.has(b.salarieId)) await tx.delete(paieBulletins).where(eq(paieBulletins.id, b.id));
    }
    for (const s of salaries) {
      const existant = parSalarie.get(s.id);
      const elements = (existant?.elements as ElementsBulletinSaisis | undefined) ?? ELEMENTS_VIDES;
      const b = calculer(s, rubriques.get(s.id) ?? [], elements, bareme);
      let bulletinId = existant?.id;
      if (bulletinId) {
        await tx.update(paieBulletins).set(colonnesBulletin(s, elements, b)).where(eq(paieBulletins.id, bulletinId));
      } else {
        const [row] = await tx
          .insert(paieBulletins)
          .values({ periodeId: id, salarieId: s.id, ...colonnesBulletin(s, elements, b) })
          .returning({ id: paieBulletins.id });
        bulletinId = row.id;
      }
      await ecrireLignes(tx, bulletinId, b);
    }
    await tx.update(paiePeriodes).set({ baremeValideDu: bareme.valideDu, updatedAt: new Date() }).where(eq(paiePeriodes.id, id));
  });
  return getPeriode(id);
}

/**
 * Fige le mois, puis en tire ce qui en découle : la ligne de cotisations
 * CNPS, et l'écriture de paie si le contribuable tient ses livres ici. Sans
 * exercice ouvert sur le mois, le mois est validé quand même et l'écriture
 * attendra — le motif est rendu pour être montré.
 */
export async function validerPeriode(id: number, userId: number | null) {
  const periode = await periodeModifiable(id);
  const [{ n }] = await db.select({ n: count() }).from(paieBulletins).where(eq(paieBulletins.periodeId, id));
  if (n === 0) throw badRequest("Aucun bulletin dans ce mois.");
  await db
    .update(paiePeriodes)
    .set({ statut: "VALIDEE", valideeLe: new Date(), valideePar: userId, updatedAt: new Date() })
    .where(eq(paiePeriodes.id, periode.id));

  const cnps = await reporterCotisationsCnps(id);
  const { ecriture, motif } = await comptabiliserSiPossible(id, userId);
  const [validee] = await db.select().from(paiePeriodes).where(eq(paiePeriodes.id, id));
  return { ...validee, ecriture, motif, cnps };
}

/** Un mois en brouillon se jette avec ses bulletins ; validé, il reste. */
export async function supprimerPeriode(id: number) {
  await periodeModifiable(id);
  await db.delete(paiePeriodes).where(eq(paiePeriodes.id, id));
}
