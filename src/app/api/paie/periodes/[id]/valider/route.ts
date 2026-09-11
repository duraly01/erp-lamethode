import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { validerPeriode } from "@/lib/services/paie/periodes";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Fige le mois : les bulletins ne bougent plus. */
export const POST = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "paie", "update");
  const { id } = idParamSchema.parse(await params);
  const periode = await validerPeriode(id, user.id);
  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "paie_periodes",
    entiteId: id,
    diff: { apres: { statut: "VALIDEE", periode: periode.periode } },
    ip: clientIp(req),
  });
  return ok(periode);
});
