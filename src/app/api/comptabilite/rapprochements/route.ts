import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, created, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import {
  rapprochementsQuerySchema,
  rapprochementCreateSchema,
} from "@/lib/schemas/comptabilite";
import {
  listerRapprochements,
  creerRapprochement,
} from "@/lib/services/comptabilite/rapprochement";
import { writeAudit, clientIp } from "@/lib/audit";

/** Rapprochements d'un compte de banque sur l'exercice, du plus récent au plus ancien. */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const q = rapprochementsQuerySchema.parse(searchParamsToObject(req.url));
  return ok(await listerRapprochements(q.exerciceId, q.compteId));
});

/** Ouvre un rapprochement à une date, face à un solde de relevé. */
export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "update");
  const body = rapprochementCreateSchema.parse(await req.json());
  const r = await creerRapprochement(
    { ...body, soldeReleve: body.soldeReleve ?? 0 },
    user.id,
  );
  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "cpta_rapprochements",
    entiteId: r.id,
    diff: { apres: r },
    ip: clientIp(req),
  });
  return created(r);
});
