import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { controlerCloture, cloturerExercice } from "@/lib/services/comptabilite/cloture";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Ce qui empêche encore de clôturer, ou rien. À montrer avant le bouton. */
export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { id } = idParamSchema.parse(await params);
  return ok(await controlerCloture(id));
});

/**
 * Clôture l'exercice : reprend ses soldes en à-nouveaux dans l'exercice
 * suivant, puis le fige. Même permission que le verrouillage — c'est un
 * geste de fin d'exercice, pas de saisie courante.
 */
export const POST = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "delete");
  const { id } = idParamSchema.parse(await params);

  const resultat = await cloturerExercice(id, user.id);

  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "cpta_exercices",
    entiteId: id,
    diff: { apres: { statut: "CLOS", aNouveaux: resultat.aNouveaux, suivant: resultat.suivant } },
    ip: clientIp(req),
  });

  return ok(resultat);
});
