import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, noContent, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { ecritureUpdateSchema } from "@/lib/schemas/comptabilite";
import {
  getEcritureComplete,
  modifierBrouillon,
  supprimerBrouillon,
} from "@/lib/services/comptabilite/ecritures";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Écriture et ses lignes, dans l'ordre de saisie. */
export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { id } = idParamSchema.parse(await params);
  return ok(await getEcritureComplete(id));
});

/**
 * Remplace intégralement un brouillon.
 *
 * Une écriture validée est refusée par le service : elle ne se modifie pas,
 * elle se contre-passe.
 */
export const PATCH = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(
    await getSessionUser(),
    "comptabilite",
    "update",
  );
  const { id } = idParamSchema.parse(await params);
  const body = ecritureUpdateSchema.parse(await req.json());

  const avant = await getEcritureComplete(id);
  const apres = await modifierBrouillon(id, body);

  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "cpta_ecritures",
    entiteId: id,
    diff: { avant, apres },
    ip: clientIp(req),
  });

  return ok(apres);
});

/** Supprime un brouillon. Une écriture validée est refusée par le service. */
export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(
    await getSessionUser(),
    "comptabilite",
    "delete",
  );
  const { id } = idParamSchema.parse(await params);

  const avant = await getEcritureComplete(id);
  await supprimerBrouillon(id);

  await writeAudit({
    userId: user.id,
    action: "DELETE",
    entite: "cpta_ecritures",
    entiteId: id,
    diff: { avant },
    ip: clientIp(req),
  });

  return noContent();
});
