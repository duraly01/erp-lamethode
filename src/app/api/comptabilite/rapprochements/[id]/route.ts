import { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, noContent, withApi } from "@/lib/http";
import { rapprochementUpdateSchema } from "@/lib/schemas/comptabilite";
import {
  getRapprochement,
  modifierSoldeReleve,
  supprimerRapprochement,
} from "@/lib/services/comptabilite/rapprochement";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const idSchema = z.coerce.number().int().positive();

/** État complet du rapprochement : lignes, pointage, écart, proposition. */
export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const id = idSchema.parse((await params).id);
  return ok(await getRapprochement(id));
});

/** Corrige le solde du relevé d'un rapprochement ouvert. */
export const PATCH = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "update");
  const id = idSchema.parse((await params).id);
  const body = rapprochementUpdateSchema.parse(await req.json());
  const etat = await modifierSoldeReleve(id, body.soldeReleve ?? 0);
  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "cpta_rapprochements",
    entiteId: id,
    diff: { apres: { soldeReleve: etat.soldeReleve, ecart: etat.ecart } },
    ip: clientIp(req),
  });
  return ok(etat);
});

/** Supprime un rapprochement ouvert par erreur ; ses lignes redeviennent non pointées. */
export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "delete");
  const id = idSchema.parse((await params).id);
  await supprimerRapprochement(id);
  await writeAudit({
    userId: user.id,
    action: "DELETE",
    entite: "cpta_rapprochements",
    entiteId: id,
    ip: clientIp(req),
  });
  return noContent();
});
