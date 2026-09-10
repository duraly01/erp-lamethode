import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contribuables, factureLignes, factures, reglements } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, noContent, notFound, conflict, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { factureUpdateSchema } from "@/lib/schemas/factures";
import { recalculeFacture } from "@/lib/services/factures";
import { tauxTvaParDefaut } from "@/lib/facturation";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

async function chargeFacture(id: number) {
  const [facture] = await db
    .select({
      id: factures.id,
      numero: factures.numero,
      contribuableId: factures.contribuableId,
      contribuableNom: contribuables.nom,
      contribuableNiu: contribuables.niu,
      contribuableEmail: contribuables.email,
      contribuableTelephone: contribuables.telephone,
      periode: factures.periode,
      objet: factures.objet,
      dateEmission: factures.dateEmission,
      dateEcheance: factures.dateEcheance,
      statut: factures.statut,
      totalHt: factures.totalHt,
      totalTva: factures.totalTva,
      totalTtc: factures.totalTtc,
      montantRegle: factures.montantRegle,
      envoyeeLe: factures.envoyeeLe,
      canauxEnvoi: factures.canauxEnvoi,
      notes: factures.notes,
    })
    .from(factures)
    .innerJoin(contribuables, eq(factures.contribuableId, contribuables.id))
    .where(eq(factures.id, id));
  if (!facture) return null;

  const lignes = await db
    .select()
    .from(factureLignes)
    .where(eq(factureLignes.factureId, id))
    .orderBy(asc(factureLignes.ordre), asc(factureLignes.id));

  const paiements = await db
    .select()
    .from(reglements)
    .where(eq(reglements.factureId, id))
    .orderBy(asc(reglements.date));

  return { ...facture, lignes, reglements: paiements };
}

export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "factures", "read");
  const { id } = idParamSchema.parse(await params);
  const facture = await chargeFacture(id);
  if (!facture) throw notFound("Facture introuvable.");
  return ok(facture);
});

export const PATCH = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "factures", "update");
  const { id } = idParamSchema.parse(await params);
  const patch = factureUpdateSchema.parse(await req.json());

  const avant = await chargeFacture(id);
  if (!avant) throw notFound("Facture introuvable.");

  // Une facture déjà envoyée ne se réécrit pas : elle est chez le client. Seul
  // le passage en ANNULEE reste possible, pour tracer une annulation.
  const modifieLeFond =
    patch.lignes !== undefined ||
    patch.periode !== undefined ||
    patch.dateEmission !== undefined ||
    patch.objet !== undefined;
  if (modifieLeFond && avant.statut !== "BROUILLON") {
    throw conflict(
      "Cette facture a déjà été émise : annulez-la et créez-en une nouvelle plutôt que de la modifier.",
    );
  }

  const { lignes, ...champs } = patch;

  if (Object.keys(champs).length > 0) {
    await db
      .update(factures)
      .set({ ...champs, updatedAt: new Date() })
      .where(eq(factures.id, id));
  }

  if (lignes) {
    await db.delete(factureLignes).where(eq(factureLignes.factureId, id));
    if (lignes.length > 0) {
      await db.insert(factureLignes).values(
        lignes.map((l, i) => ({
          factureId: id,
          categorie: l.categorie,
          libelle: l.libelle,
          montantHt: l.montantHt.toFixed(2),
          tauxTva: (l.tauxTva ?? tauxTvaParDefaut(l.categorie)).toFixed(2),
          declarationId: l.declarationId ?? null,
          ordre: i,
        })),
      );
    }
  }

  await recalculeFacture(id);
  const apres = await chargeFacture(id);

  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "factures",
    entiteId: id,
    diff: { avant, apres },
    ip: clientIp(req),
  });

  return ok(apres);
});

export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "factures", "delete");
  const { id } = idParamSchema.parse(await params);

  const avant = await chargeFacture(id);
  if (!avant) throw notFound("Facture introuvable.");

  // Une pièce comptable émise ne se supprime pas : elle s'annule, pour que la
  // numérotation reste continue et vérifiable.
  if (avant.statut !== "BROUILLON") {
    await db
      .update(factures)
      .set({ statut: "ANNULEE", updatedAt: new Date() })
      .where(eq(factures.id, id));
    await writeAudit({
      userId: user.id,
      action: "CANCEL",
      entite: "factures",
      entiteId: id,
      diff: { avant },
      ip: clientIp(req),
    });
    return ok({ ...avant, statut: "ANNULEE" as const });
  }

  await db.delete(factures).where(eq(factures.id, id));

  await writeAudit({
    userId: user.id,
    action: "DELETE",
    entite: "factures",
    entiteId: id,
    diff: { avant },
    ip: clientIp(req),
  });

  return noContent();
});
