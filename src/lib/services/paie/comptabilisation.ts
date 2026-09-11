import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cnpsCotisations,
  cptaComptes,
  cptaExercices,
  cptaJournaux,
  cptaTiers,
  paieBulletinLignes,
  paieBulletins,
  paiePeriodes,
  paieSalaries,
} from "@/db/schema";
import { badRequest, conflict, notFound, HttpError } from "@/lib/http";
import { formatMontant, parseMontant, sommeMontants } from "@/lib/comptable/money";
import { defaultEcheanceMensuelle } from "@/lib/constants";
import { genererEcriturePaie, EcriturePaieError, type ComptesPaie, type TotauxPaie } from "@/lib/paie/ecriture";
import { creerBrouillon, validerEcritureEnBase } from "@/lib/services/comptabilite/ecritures";

/**
 * Ce qu'un mois de paie validé laisse derrière lui.
 *
 * - L'écriture de paie dans les livres du contribuable, s'il les tient ici :
 *   il faut un exercice ouvert qui couvre le mois, un journal d'opérations
 *   diverses, et les comptes de paie dans le plan. Sans exercice, le mois
 *   reste validé sans écriture ; elle se passera plus tard, à la demande.
 * - La ligne de cotisations CNPS du mois, dans le suivi des échéances qui
 *   existait avant la paie : la masse salariale et les deux parts, prêtes
 *   à déclarer.
 */

/** Numéros du plan de référence, dans l'ordre de préférence. */
const NUMEROS: Record<keyof ComptesPaie, string[]> = {
  salaires: ["6611", "661"],
  primes: ["6612"],
  chargesSociales: ["6641", "664"],
  taxesSalaires: ["6414", "641"],
  remunerationsDues: ["422"],
  avances: ["421"],
  oppositions: ["423"],
  cnps: ["431"],
  irpp: ["4471", "447"],
  autresImpots: ["442", "447"],
};

async function comptesPaie(contribuableId: number): Promise<ComptesPaie> {
  const rows = await db
    .select({ id: cptaComptes.id, numero: cptaComptes.numero })
    .from(cptaComptes)
    .where(and(eq(cptaComptes.contribuableId, contribuableId), eq(cptaComptes.actif, true)));
  const parNumero = new Map(rows.map((r) => [r.numero, r.id]));
  const trouve = (cle: keyof ComptesPaie) => NUMEROS[cle].map((n) => parNumero.get(n)).find((id) => id !== undefined) ?? null;

  const manquants: string[] = [];
  const comptes = {} as Record<keyof ComptesPaie, number | null>;
  for (const cle of Object.keys(NUMEROS) as (keyof ComptesPaie)[]) {
    comptes[cle] = trouve(cle);
    if (comptes[cle] === null && cle !== "primes") manquants.push(NUMEROS[cle][0]);
  }
  if (manquants.length > 0) {
    throw badRequest(`Le plan comptable n'a pas les comptes de paie ${manquants.join(", ")}.`);
  }
  return comptes as ComptesPaie;
}

/**
 * Le compte individuel du salarié dans les livres : un tiers rattaché au
 * 422, créé à sa première paie comptabilisée et gardé sur la fiche. Le code
 * suit le matricule ; s'il est déjà pris — fiche recréée, tiers saisi à la
 * main —, on reprend le tiers existant plutôt que d'en faire un doublon.
 */
async function tiersDuSalarie(salarie: typeof paieSalaries.$inferSelect, compte422: number): Promise<number> {
  if (salarie.tiersId) return salarie.tiersId;
  const code = `SAL-${salarie.matricule}`;
  const [existant] = await db
    .select({ id: cptaTiers.id })
    .from(cptaTiers)
    .where(and(eq(cptaTiers.contribuableId, salarie.contribuableId), eq(cptaTiers.code, code)));
  let tiersId = existant?.id;
  if (!tiersId) {
    const [cree] = await db
      .insert(cptaTiers)
      .values({
        contribuableId: salarie.contribuableId,
        code,
        raisonSociale: [salarie.nom, salarie.prenoms].filter(Boolean).join(" "),
        types: ["SALARIE"],
        niu: salarie.niu,
        compteId: compte422,
      })
      .returning({ id: cptaTiers.id });
    tiersId = cree.id;
  }
  await db.update(paieSalaries).set({ tiersId, updatedAt: new Date() }).where(eq(paieSalaries.id, salarie.id));
  return tiersId;
}

/** Totaux du mois, en centimes, depuis les bulletins et leurs lignes. */
async function totauxDuMois(periodeId: number, compte422: number): Promise<TotauxPaie> {
  const bulletins = await db.select().from(paieBulletins).where(eq(paieBulletins.periodeId, periodeId));
  const salaries = bulletins.length
    ? await db.select().from(paieSalaries).where(inArray(paieSalaries.id, bulletins.map((b) => b.salarieId)))
    : [];
  const parSalarie: TotauxPaie["parSalarie"] = [];
  for (const b of bulletins) {
    const s = salaries.find((x) => x.id === b.salarieId)!;
    parSalarie.push({
      tiersId: await tiersDuSalarie(s, compte422),
      libelle: `${b.matricule} ${b.nomComplet}`,
      netAPayer: parseMontant(b.netAPayer),
      avances: parseMontant(b.avances),
    });
  }
  const ids = bulletins.map((b) => b.id);
  const lignes = ids.length
    ? await db
        .select({ code: paieBulletinLignes.code, montant: paieBulletinLignes.montant })
        .from(paieBulletinLignes)
        .where(inArray(paieBulletinLignes.bulletinId, ids))
    : [];
  const somme = (codes: string[]) => sommeMontants(lignes.filter((l) => codes.includes(l.code)).map((l) => parseMontant(l.montant)));
  const colonne = (champ: keyof (typeof bulletins)[number]) => sommeMontants(bulletins.map((b) => parseMontant(b[champ] as string)));
  return {
    salaires: somme(["SALAIRE_BASE", "ABSENCE", "HEURES_SUP"]),
    primes: somme(["PRIME"]),
    cnpsSalarie: colonne("cnpsSalarie"),
    cnpsEmployeur: colonne("cnpsEmployeur"),
    irpp: colonne("irpp"),
    cac: colonne("cac"),
    cfcSalarie: colonne("cfcSalarie"),
    cfcEmployeur: colonne("cfcEmployeur"),
    fne: colonne("fne"),
    tdl: colonne("tdl"),
    rav: colonne("rav"),
    avances: colonne("avances"),
    autresRetenues: colonne("autresRetenues"),
    netAPayer: colonne("netAPayer"),
    parSalarie,
  };
}

function finDuMois(periode: string) {
  const [a, m] = periode.split("-").map(Number);
  return `${periode}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

function libelleMois(periode: string) {
  const [a, m] = periode.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** L'exercice ouvert qui couvre le mois, ou null si le contribuable ne tient pas ses livres ici. */
async function exerciceDuMois(contribuableId: number, periode: string) {
  const fin = finDuMois(periode);
  const [exercice] = await db
    .select()
    .from(cptaExercices)
    .where(and(eq(cptaExercices.contribuableId, contribuableId), lte(cptaExercices.dateDebut, fin), gte(cptaExercices.dateFin, fin)))
    .limit(1);
  return exercice ?? null;
}

/**
 * Passe l'écriture de paie du mois. Le mois doit être validé et ne pas en
 * avoir déjà une.
 */
export async function comptabiliserPeriode(periodeId: number, userId: number | null) {
  const [periode] = await db.select().from(paiePeriodes).where(eq(paiePeriodes.id, periodeId));
  if (!periode) throw notFound("Mois de paie introuvable.");
  if (periode.statut !== "VALIDEE") throw conflict("Validez le mois avant de le comptabiliser.");
  if (periode.ecritureId) throw conflict("Ce mois est déjà comptabilisé.");

  const exercice = await exerciceDuMois(periode.contribuableId, periode.periode);
  if (!exercice) throw badRequest(`Aucun exercice comptable ne couvre ${libelleMois(periode.periode)} : ouvrez-le d'abord.`);
  if (exercice.statut !== "OUVERT") throw conflict(`L'exercice ${exercice.libelle} n'est plus ouvert.`);

  const [journal] = await db
    .select()
    .from(cptaJournaux)
    .where(and(eq(cptaJournaux.contribuableId, periode.contribuableId), eq(cptaJournaux.type, "DIVERS"), eq(cptaJournaux.actif, true)))
    .limit(1);
  if (!journal) throw badRequest("Aucun journal d'opérations diverses pour ce contribuable.");

  const comptes = await comptesPaie(periode.contribuableId);
  let lignes;
  try {
    lignes = genererEcriturePaie(await totauxDuMois(periodeId, comptes.remunerationsDues), comptes, libelleMois(periode.periode));
  } catch (e) {
    if (e instanceof EcriturePaieError) throw conflict(e.message);
    throw e;
  }
  if (lignes.length === 0) throw badRequest("Rien à comptabiliser : le mois est vide.");

  const brouillon = await creerBrouillon(
    {
      exerciceId: exercice.id,
      journalId: journal.id,
      dateEcriture: finDuMois(periode.periode),
      libelle: `Paie ${libelleMois(periode.periode)}`,
      reference: `PAIE ${periode.periode}`,
      origine: "PAIE",
      origineId: periode.id,
      lignes,
    },
    userId,
  );
  const ecriture = await validerEcritureEnBase(brouillon.id, userId);
  await db.update(paiePeriodes).set({ ecritureId: ecriture.id, updatedAt: new Date() }).where(eq(paiePeriodes.id, periodeId));
  return ecriture;
}

/**
 * Tente la comptabilisation sans faire échouer la validation : rend
 * l'écriture, ou la raison pour laquelle elle attendra.
 */
export async function comptabiliserSiPossible(periodeId: number, userId: number | null) {
  try {
    return { ecriture: await comptabiliserPeriode(periodeId, userId), motif: null };
  } catch (e) {
    if (e instanceof HttpError) return { ecriture: null, motif: e.message };
    throw e;
  }
}

/**
 * Reporte le mois dans le suivi des cotisations CNPS : masse cotisable et
 * parts salariale et patronale. La ligne se crée à l'échéance légale, ou se
 * met à jour si elle existe — sans toucher à son statut, qui dit où en est
 * la déclaration.
 */
export async function reporterCotisationsCnps(periodeId: number) {
  const [periode] = await db.select().from(paiePeriodes).where(eq(paiePeriodes.id, periodeId));
  if (!periode) throw notFound("Mois de paie introuvable.");
  const [t] = await db
    .select({
      masse: sql<string>`coalesce(sum(${paieBulletins.brutCotisable}), 0)`,
      salarie: sql<string>`coalesce(sum(${paieBulletins.cnpsSalarie}), 0)`,
      employeur: sql<string>`coalesce(sum(${paieBulletins.cnpsEmployeur}), 0)`,
    })
    .from(paieBulletins)
    .where(eq(paieBulletins.periodeId, periodeId));

  const [annee, mois] = periode.periode.split("-").map(Number);
  const valeurs = {
    masseSalariale: formatMontant(parseMontant(t.masse)),
    montantSalarie: formatMontant(parseMontant(t.salarie)),
    montantEmployeur: formatMontant(parseMontant(t.employeur)),
    notes: `Calculé depuis la paie de ${libelleMois(periode.periode)}.`,
  };
  const [row] = await db
    .insert(cnpsCotisations)
    .values({
      contribuableId: periode.contribuableId,
      periode: periode.periode,
      dateEcheance: defaultEcheanceMensuelle(annee, mois),
      ...valeurs,
    })
    .onConflictDoUpdate({
      target: [cnpsCotisations.contribuableId, cnpsCotisations.periode],
      set: { ...valeurs, updatedAt: new Date() },
    })
    .returning();
  return row;
}
