import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { factures, reglements } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, notFound, conflict, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { reglementCreateSchema } from "@/lib/schemas/factures";
import { recalculeFacture } from "@/lib/services/factures";
import { resteAPayer } from "@/lib/facturation";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Enregistre un encaissement et met à jour le solde de la facture. */
export const POST = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "factures", "update");
  const { id } = idParamSchema.parse(await params);
  const body = reglementCreateSchema.parse(await req.json());

  const [facture] = await db
    .select()
    .from(factures)
    .where(eq(factures.id, id));
  if (!facture) throw notFound("Facture introuvable.");

  if (facture.statut === "BROUILLON") {
    throw conflict(
      "Cette facture est encore en brouillon : émettez-la avant d'enregistrer un règlement.",
    );
  }
  if (facture.statut === "ANNULEE") {
    throw conflict("Cette facture est annulée.");
  }

  const reste = resteAPayer(
    Number(facture.totalTtc),
    Number(facture.montantRegle),
  );
  if (body.montant > reste) {
    throw conflict(
      `Le règlement dépasse le reste à payer (${reste.toLocaleString("fr-FR")} FCFA).`,
    );
  }

  const [row] = await db
    .insert(reglements)
    .values({
      factureId: id,
      date: body.date,
      montant: body.montant.toFixed(2),
      mode: body.mode,
      reference: body.reference ?? null,
      notes: body.notes ?? null,
      createdBy: user.id,
    })
    .returning();

  const maj = await recalculeFacture(id);

  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "reglements",
    entiteId: row.id,
    diff: { apres: { ...row, statutFacture: maj.statut } },
    ip: clientIp(req),
  });

  return created({ reglement: row, facture: maj });
});
