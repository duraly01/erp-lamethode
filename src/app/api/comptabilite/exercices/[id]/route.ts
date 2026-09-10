import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { exerciceStatutSchema } from "@/lib/schemas/comptabilite";
import {
  getExercice,
  changerStatutExercice,
} from "@/lib/services/comptabilite/exercices";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { id } = idParamSchema.parse(await params);
  return ok(await getExercice(id));
});

/**
 * Ouvre, clôt ou verrouille un exercice.
 *
 * Le verrouillage relève de « supprimer » et non de « modifier » : il retire
 * définitivement la possibilité de corriger l'exercice depuis l'application.
 */
export const PATCH = withApi(async (req: NextRequest, { params }: Ctx) => {
  const { statut } = exerciceStatutSchema.parse(await req.json());
  const action = statut === "VERROUILLE" ? "delete" : "update";
  const user = requirePermission(
    await getSessionUser(),
    "comptabilite",
    action,
  );
  const { id } = idParamSchema.parse(await params);

  const avant = await getExercice(id);
  const apres = await changerStatutExercice(id, statut, user.id);

  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "cpta_exercices",
    entiteId: id,
    diff: { avant: { statut: avant.statut }, apres: { statut: apres.statut } },
    ip: clientIp(req),
  });

  return ok(apres);
});
