import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { noContent, ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { getPeriode, supprimerPeriode } from "@/lib/services/paie/periodes";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Le mois et ses bulletins. */
export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "paie", "read");
  const { id } = idParamSchema.parse(await params);
  return ok(await getPeriode(id));
});

/** Jette un mois en brouillon, bulletins compris. */
export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "paie", "delete");
  const { id } = idParamSchema.parse(await params);
  await supprimerPeriode(id);
  await writeAudit({ userId: user.id, action: "DELETE", entite: "paie_periodes", entiteId: id, ip: clientIp(req) });
  return noContent();
});
