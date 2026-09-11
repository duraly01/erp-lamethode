import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contribuables, paieBulletinLignes, paieBulletins, paiePeriodes, paieSalaries } from "@/db/schema";
import { notFound } from "@/lib/http";
import { buildWorkbookBuffer, styleHeaderRow } from "@/lib/exports/excel";
import { libelleMoisPaie, type BulletinPdf } from "@/lib/exports/bulletin-pdf";

/**
 * Ce que les documents de paie ont besoin de savoir : les bulletins d'un
 * mois, ou un seul, avec l'employeur et le salarié — et le DIPE, l'état
 * nominatif du mois que la DGI et la CNPS attendent.
 */

async function chargerBulletins(periodeId: number, seulement?: number): Promise<BulletinPdf[]> {
  const [periode] = await db
    .select({
      periode: paiePeriodes.periode,
      employeur: {
        nom: contribuables.nom,
        niu: contribuables.niu,
        adresse: contribuables.adresseFacturation,
        centreImpots: contribuables.centreImpots,
      },
    })
    .from(paiePeriodes)
    .innerJoin(contribuables, eq(paiePeriodes.contribuableId, contribuables.id))
    .where(eq(paiePeriodes.id, periodeId));
  if (!periode) throw notFound("Mois de paie introuvable.");

  const bulletins = await db
    .select({ bulletin: paieBulletins, niu: paieSalaries.niu, dateEmbauche: paieSalaries.dateEmbauche })
    .from(paieBulletins)
    .innerJoin(paieSalaries, eq(paieBulletins.salarieId, paieSalaries.id))
    .where(seulement ? eq(paieBulletins.id, seulement) : eq(paieBulletins.periodeId, periodeId))
    .orderBy(asc(paieBulletins.matricule));
  const ids = bulletins.map((b) => b.bulletin.id);
  const lignes = ids.length
    ? await db.select().from(paieBulletinLignes).where(inArray(paieBulletinLignes.bulletinId, ids)).orderBy(asc(paieBulletinLignes.ordre))
    : [];

  return bulletins.map(({ bulletin: b, niu, dateEmbauche }) => ({
    periode: periode.periode,
    employeur: periode.employeur,
    salarie: {
      matricule: b.matricule,
      nomComplet: b.nomComplet,
      poste: b.poste,
      categorie: b.categorie,
      numeroCnps: b.numeroCnps,
      niu,
      dateEmbauche,
      modePaiement: b.modePaiement,
    },
    lignes: lignes
      .filter((l) => l.bulletinId === b.id)
      .map((l) => ({ type: l.type, libelle: l.libelle, base: l.base, taux: l.taux, montant: l.montant, enNature: l.enNature })),
    totaux: {
      brut: b.brut,
      brutCotisable: b.brutCotisable,
      brutImposable: b.brutImposable,
      totalRetenues: b.totalRetenues,
      netAPayer: b.netAPayer,
      chargesEmployeur: b.chargesEmployeur,
    },
    elements: (b.elements as { joursAbsence?: number }) ?? null,
  }));
}

export async function bulletinsDuMois(periodeId: number) {
  return chargerBulletins(periodeId);
}

export async function bulletinPourImpression(bulletinId: number) {
  const [b] = await db.select({ periodeId: paieBulletins.periodeId }).from(paieBulletins).where(eq(paieBulletins.id, bulletinId));
  if (!b) throw notFound("Bulletin introuvable.");
  const [bulletin] = await chargerBulletins(b.periodeId, bulletinId);
  return bulletin;
}

/**
 * DIPE — document d'information sur le personnel employé : une ligne par
 * salarié avec ses identifiants, ses bases et chaque retenue et charge du
 * mois. En classeur, parce que c'est ainsi qu'il se ressaisit ou se dépose.
 */
export async function construireDipe(periodeId: number) {
  const [periode] = await db
    .select({ periode: paiePeriodes.periode, employeur: contribuables.nom, niu: contribuables.niu })
    .from(paiePeriodes)
    .innerJoin(contribuables, eq(paiePeriodes.contribuableId, contribuables.id))
    .where(eq(paiePeriodes.id, periodeId));
  if (!periode) throw notFound("Mois de paie introuvable.");

  const bulletins = await db
    .select({ b: paieBulletins, niu: paieSalaries.niu, dateEmbauche: paieSalaries.dateEmbauche })
    .from(paieBulletins)
    .innerJoin(paieSalaries, eq(paieBulletins.salarieId, paieSalaries.id))
    .where(eq(paieBulletins.periodeId, periodeId))
    .orderBy(asc(paieBulletins.matricule));

  const n = (v: string) => Number(v);
  const buf = await buildWorkbookBuffer((wb) => {
    const ws = wb.addWorksheet(`DIPE ${periode.periode}`);
    ws.columns = [
      { header: "Matricule", key: "matricule", width: 12 },
      { header: "Nom et prénoms", key: "nom", width: 28 },
      { header: "NIU", key: "niu", width: 16 },
      { header: "N° CNPS", key: "cnps", width: 14 },
      { header: "Poste", key: "poste", width: 18 },
      { header: "Embauche", key: "embauche", width: 12 },
      { header: "Salaire de base", key: "base", width: 14 },
      { header: "Brut", key: "brut", width: 14 },
      { header: "Brut cotisable", key: "cotisable", width: 14 },
      { header: "Brut imposable", key: "imposable", width: 14 },
      { header: "CNPS salarié", key: "cnpsSal", width: 13 },
      { header: "CNPS employeur", key: "cnpsEmp", width: 14 },
      { header: "IRPP", key: "irpp", width: 12 },
      { header: "CAC", key: "cac", width: 10 },
      { header: "CFC salarié", key: "cfcSal", width: 12 },
      { header: "CFC employeur", key: "cfcEmp", width: 13 },
      { header: "FNE", key: "fne", width: 10 },
      { header: "TDL", key: "tdl", width: 10 },
      { header: "RAV", key: "rav", width: 10 },
      { header: "Total retenues", key: "retenues", width: 14 },
      { header: "Net à payer", key: "net", width: 14 },
    ];
    styleHeaderRow(ws);
    for (const { b, niu, dateEmbauche } of bulletins) {
      ws.addRow({
        matricule: b.matricule,
        nom: b.nomComplet,
        niu: niu ?? "",
        cnps: b.numeroCnps ?? "",
        poste: b.poste ?? "",
        embauche: dateEmbauche,
        base: n(b.salaireBase),
        brut: n(b.brut),
        cotisable: n(b.brutCotisable),
        imposable: n(b.brutImposable),
        cnpsSal: n(b.cnpsSalarie),
        cnpsEmp: n(b.cnpsEmployeur),
        irpp: n(b.irpp),
        cac: n(b.cac),
        cfcSal: n(b.cfcSalarie),
        cfcEmp: n(b.cfcEmployeur),
        fne: n(b.fne),
        tdl: n(b.tdl),
        rav: n(b.rav),
        retenues: n(b.totalRetenues),
        net: n(b.netAPayer),
      });
    }
    // Ligne de totaux.
    const total = ws.addRow({ matricule: "TOTAL", nom: `${bulletins.length} salarié${bulletins.length > 1 ? "s" : ""}` });
    const cles = ["base", "brut", "cotisable", "imposable", "cnpsSal", "cnpsEmp", "irpp", "cac", "cfcSal", "cfcEmp", "fne", "tdl", "rav", "retenues", "net"];
    for (const cle of cles) {
      const col = ws.getColumn(cle);
      const lettre = col.letter;
      total.getCell(cle).value = { formula: `SUM(${lettre}2:${lettre}${bulletins.length + 1})` };
    }
    total.font = { bold: true };
    for (const cle of cles) ws.getColumn(cle).numFmt = "#,##0";

    const info = wb.addWorksheet("Employeur");
    info.addRows([
      ["Employeur", periode.employeur],
      ["NIU", periode.niu ?? ""],
      ["Mois", libelleMoisPaie(periode.periode)],
      ["Généré le", new Date().toLocaleDateString("fr-FR")],
    ]);
    info.getColumn(1).width = 14;
    info.getColumn(2).width = 40;
  });
  return { buf, periode: periode.periode };
}
