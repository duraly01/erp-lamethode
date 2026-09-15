import "server-only";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { cptaExercices, cptaJournaux, cptaLignesEcriture, paieBulletins, paiePeriodes, paieSalaries } from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/http";
import { parseMontant } from "@/lib/comptable/money";
import { genererEcritureReglementSalaires, EcriturePaieError, type SalaireARegler } from "@/lib/paie/ecriture";
import { creerBrouillon, validerEcritureEnBase } from "@/lib/services/comptabilite/ecritures";
import { getPostesOuverts, lettrerLignes } from "@/lib/services/comptabilite/lettrage";
import { comptesPaie } from "./comptabilisation";

/**
 * Règlement des salaires d'un mois.
 *
 * L'écriture de paie a crédité le 422 de chaque salarié de son net. Le
 * payer, c'est passer sur un journal de trésorerie le débit de ces mêmes
 * comptes contre la banque ou la caisse — puis lettrer, salarié par
 * salarié, le net dû avec son règlement. Le bulletin garde l'écriture qui
 * l'a réglé : c'est ainsi qu'on sait qui a été payé.
 *
 * Un mois se règle en plusieurs fois : les virements un jour, la caisse un
 * autre. Chaque règlement désigne ses bulletins ; par défaut, ceux dont le
 * mode de paiement correspond au journal — virements et chèques en banque,
 * espèces en caisse — et qui ne sont pas encore payés.
 */

type Journal = typeof cptaJournaux.$inferSelect;
type Bulletin = typeof paieBulletins.$inferSelect;

export type EntreeReglementSalaires = {
  journalId: number;
  dateEcriture: string;
  reference?: string | null;
  /** À défaut, les bulletins du mode de paiement du journal, non encore réglés. */
  bulletinIds?: number[];
};

/** Le mode de paiement d'un bulletin se règle sur ce type de journal. */
function journalDuMode(mode: Bulletin["modePaiement"]): Journal["type"] {
  return mode === "ESPECES" ? "CAISSE" : "BANQUE";
}

async function periodeComptabilisee(periodeId: number) {
  const [periode] = await db.select().from(paiePeriodes).where(eq(paiePeriodes.id, periodeId));
  if (!periode) throw notFound("Mois de paie introuvable.");
  if (periode.statut !== "VALIDEE") throw conflict("Validez le mois avant de régler les salaires.");
  if (!periode.ecritureId) throw conflict("Comptabilisez le mois avant de régler les salaires : le net dû n'est pas encore dans les livres.");
  return periode;
}

async function journauxTresorerie(contribuableId: number) {
  return db
    .select()
    .from(cptaJournaux)
    .where(and(eq(cptaJournaux.contribuableId, contribuableId), inArray(cptaJournaux.type, ["BANQUE", "CAISSE"]), eq(cptaJournaux.actif, true)))
    .orderBy(asc(cptaJournaux.code));
}

function libelleMois(periode: string) {
  const [a, m] = periode.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Ce que l'écran a besoin de savoir avant de régler : les journaux de
 * trésorerie disponibles, et l'état de chaque bulletin — réglé ou non, et
 * sur quel journal il se réglerait.
 */
export async function preparerReglement(periodeId: number) {
  const [periode] = await db.select().from(paiePeriodes).where(eq(paiePeriodes.id, periodeId));
  if (!periode) throw notFound("Mois de paie introuvable.");
  const [journaux, bulletins] = await Promise.all([
    journauxTresorerie(periode.contribuableId),
    db.select().from(paieBulletins).where(eq(paieBulletins.periodeId, periodeId)).orderBy(asc(paieBulletins.matricule)),
  ]);
  return {
    periodeId,
    comptabilisee: periode.statut === "VALIDEE" && periode.ecritureId !== null,
    journaux: journaux.map((j) => ({ id: j.id, code: j.code, libelle: j.libelle, type: j.type, compteContrepartieId: j.compteContrepartieId })),
    bulletins: bulletins.map((b) => ({
      id: b.id,
      matricule: b.matricule,
      nomComplet: b.nomComplet,
      modePaiement: b.modePaiement,
      typeJournal: journalDuMode(b.modePaiement),
      netAPayer: b.netAPayer,
      reglementEcritureId: b.reglementEcritureId,
    })),
  };
}

/**
 * Règle les salaires désignés et lettre chaque net avec son règlement.
 *
 * Tout ce qui pourrait faire échouer le lettrage est vérifié avant que
 * l'écriture n'existe : le net de chaque salarié doit être un poste ouvert
 * de son tiers sur le 422, du montant exact du bulletin. Un règlement passé
 * puis un lettrage refusé laisseraient un mois à moitié payé.
 */
export async function reglerSalaires(periodeId: number, input: EntreeReglementSalaires, userId: number | null) {
  const periode = await periodeComptabilisee(periodeId);

  const [journal] = await db
    .select()
    .from(cptaJournaux)
    .where(and(eq(cptaJournaux.id, input.journalId), eq(cptaJournaux.contribuableId, periode.contribuableId)));
  if (!journal) throw notFound("Journal introuvable pour ce contribuable.");
  if (journal.type !== "BANQUE" && journal.type !== "CAISSE") {
    throw badRequest(`Le journal ${journal.code} n'est pas un journal de trésorerie : les salaires se règlent en banque ou en caisse.`);
  }
  if (!journal.compteContrepartieId) {
    throw badRequest(`Le journal ${journal.code} n'a pas de compte de contrepartie : indiquez son compte de trésorerie.`);
  }

  const [exercice] = await db
    .select()
    .from(cptaExercices)
    .where(
      and(
        eq(cptaExercices.contribuableId, periode.contribuableId),
        lte(cptaExercices.dateDebut, input.dateEcriture),
        gte(cptaExercices.dateFin, input.dateEcriture),
      ),
    )
    .limit(1);
  if (!exercice) throw badRequest(`Aucun exercice comptable ne couvre le ${input.dateEcriture}.`);
  if (exercice.statut !== "OUVERT") throw conflict(`L'exercice ${exercice.libelle} n'est plus ouvert.`);

  // Les bulletins à régler : désignés, ou ceux du mode de paiement du journal.
  const tous = await db.select().from(paieBulletins).where(eq(paieBulletins.periodeId, periodeId));
  let bulletins: Bulletin[];
  if (input.bulletinIds && input.bulletinIds.length > 0) {
    const parId = new Map(tous.map((b) => [b.id, b]));
    bulletins = input.bulletinIds.map((id) => {
      const b = parId.get(id);
      if (!b) throw badRequest("Un bulletin désigné au moins n'est pas de ce mois.");
      return b;
    });
    // Désigner un bulletin déjà réglé est une erreur, pas un oubli à corriger en silence.
    const dejaRegles = bulletins.filter((b) => b.reglementEcritureId !== null);
    if (dejaRegles.length > 0) {
      throw conflict(`Déjà réglé : ${dejaRegles.map((b) => b.matricule).join(", ")}.`);
    }
  } else {
    bulletins = tous.filter((b) => journalDuMode(b.modePaiement) === journal.type && b.reglementEcritureId === null);
  }
  bulletins = bulletins.filter((b) => parseMontant(b.netAPayer) > 0);
  if (bulletins.length === 0) throw badRequest("Rien à régler : aucun bulletin avec un net à payer sur ce journal.");

  // Le net dû de chaque salarié, tel que l'écriture de paie l'a crédité sur
  // son tiers — et qui doit être encore ouvert, du montant du bulletin.
  const compteRemunerations = (await comptesPaie(periode.contribuableId)).remunerationsDues;
  const salaries = await db
    .select({ id: paieSalaries.id, tiersId: paieSalaries.tiersId })
    .from(paieSalaries)
    .where(inArray(paieSalaries.id, bulletins.map((b) => b.salarieId)));
  const tiersDe = new Map(salaries.map((s) => [s.id, s.tiersId]));
  // Sur le 422, la ligne de net de ce mois pour chaque tiers : celle de
  // l'écriture de paie, et non n'importe quel poste du salarié — deux mois
  // impayés de suite auraient le même montant.
  const netsDuMois = await db
    .select({ id: cptaLignesEcriture.id, tiersId: cptaLignesEcriture.tiersId })
    .from(cptaLignesEcriture)
    .where(and(eq(cptaLignesEcriture.ecritureId, periode.ecritureId!), eq(cptaLignesEcriture.compteId, compteRemunerations)));
  const ouverts = new Map((await getPostesOuverts(compteRemunerations)).map((p) => [p.ligneId, p]));
  const aLettrer: { tiersId: number; ligneId: number }[] = [];
  const salaires: SalaireARegler[] = [];
  for (const b of bulletins) {
    const tiersId = tiersDe.get(b.salarieId);
    if (!tiersId) throw conflict(`${b.matricule} n'a pas de compte individuel dans les livres.`);
    const net = parseMontant(b.netAPayer);
    const ligne = netsDuMois.find((l) => l.tiersId === tiersId);
    const poste = ligne ? ouverts.get(ligne.id) : undefined;
    if (!poste || -poste.solde !== net) {
      throw conflict(
        `Le net de ${b.matricule} n'est plus un poste ouvert de son compte : déjà lettré, ou l'écriture de paie a été contrepassée.`,
      );
    }
    aLettrer.push({ tiersId, ligneId: poste.ligneId });
    salaires.push({ tiersId, libelle: `${b.matricule} ${b.nomComplet}`, netAPayer: net });
  }

  let lignes;
  try {
    lignes = genererEcritureReglementSalaires(
      salaires,
      { remunerationsDues: compteRemunerations, tresorerie: journal.compteContrepartieId },
      libelleMois(periode.periode),
    );
  } catch (e) {
    if (e instanceof EcriturePaieError) throw badRequest(e.message);
    throw e;
  }

  const brouillon = await creerBrouillon(
    {
      exerciceId: exercice.id,
      journalId: journal.id,
      dateEcriture: input.dateEcriture,
      libelle: `Règlement des salaires ${libelleMois(periode.periode)}`,
      reference: input.reference ?? `PAIE ${periode.periode}`,
      origine: "REGLEMENT",
      origineId: periode.id,
      lignes,
    },
    userId,
  );
  const ecriture = await validerEcritureEnBase(brouillon.id, userId);

  // Lettrage salarié par salarié : sa ligne de règlement avec son net dû.
  const debits = await db
    .select({ id: cptaLignesEcriture.id, tiersId: cptaLignesEcriture.tiersId })
    .from(cptaLignesEcriture)
    .where(and(eq(cptaLignesEcriture.ecritureId, ecriture.id), eq(cptaLignesEcriture.compteId, compteRemunerations)));
  const lettrages = [];
  for (const { tiersId, ligneId } of aLettrer) {
    const debit = debits.find((d) => d.tiersId === tiersId)!;
    lettrages.push(await lettrerLignes(compteRemunerations, [ligneId, debit.id], userId));
  }

  await db
    .update(paieBulletins)
    .set({ reglementEcritureId: ecriture.id, updatedAt: new Date() })
    .where(inArray(paieBulletins.id, bulletins.map((b) => b.id)));

  return { ecriture, bulletinIds: bulletins.map((b) => b.id), lettrages: lettrages.map((l) => l.code) };
}
