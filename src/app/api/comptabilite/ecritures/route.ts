import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, created, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import {
  ecritureCreateSchema,
  ecritureListQuerySchema,
} from "@/lib/schemas/comptabilite";
import {
  listerEcritures,
  creerBrouillon,
} from "@/lib/services/comptabilite/ecritures";
import { writeAudit, clientIp } from "@/lib/audit";

/** Écritures d'un exercice, brouillons compris, par ordre chronologique. */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const q = ecritureListQuerySchema.parse(searchParamsToObject(req.url));
  return ok(await listerEcritures(q.exerciceId, q.journalId));
});

/**
 * Enregistre une écriture au brouillon.
 *
 * Un brouillon peut être incomplet ou déséquilibré : c'est son objet. Les
 * règles comptables ne s'appliquent qu'à la validation.
 */
export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(
    await getSessionUser(),
    "comptabilite",
    "create",
  );
  const body = ecritureCreateSchema.parse(await req.json());

  const ecriture = await creerBrouillon(body, user.id);

  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "cpta_ecritures",
    entiteId: ecriture.id,
    diff: { apres: ecriture },
    ip: clientIp(req),
  });

  return created(ecriture);
});
