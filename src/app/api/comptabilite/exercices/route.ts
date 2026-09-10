import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, created, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import {
  exerciceCreateSchema,
  parContribuableSchema,
} from "@/lib/schemas/comptabilite";
import {
  listerExercices,
  ouvrirExercice,
} from "@/lib/services/comptabilite/exercices";
import { writeAudit, clientIp } from "@/lib/audit";

/** Exercices comptables d'un contribuable, du plus récent au plus ancien. */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { contribuableId } = parContribuableSchema.parse(
    searchParamsToObject(req.url),
  );
  return ok(await listerExercices(contribuableId));
});

/**
 * Ouvre un exercice. Le premier exercice d'un contribuable dépose aussi son
 * référentiel : plan comptable SYSCOHADA, journaux et taxes.
 */
export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(
    await getSessionUser(),
    "comptabilite",
    "create",
  );
  const body = exerciceCreateSchema.parse(await req.json());

  const exercice = await ouvrirExercice(body);

  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "cpta_exercices",
    entiteId: exercice.id,
    diff: { apres: exercice },
    ip: clientIp(req),
  });

  return created(exercice);
});
