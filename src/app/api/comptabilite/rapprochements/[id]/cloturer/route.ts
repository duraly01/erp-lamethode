import { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { cloturerRapprochement } from "@/lib/services/comptabilite/rapprochement";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Clôture un rapprochement juste : le pointage devient définitif. */
export const POST = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "update");
  const id = z.coerce.number().int().positive().parse((await params).id);
  const r = await cloturerRapprochement(id);
  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "cpta_rapprochements",
    entiteId: id,
    diff: { apres: { cloture: true } },
    ip: clientIp(req),
  });
  return ok(r);
});
