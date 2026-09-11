import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { periodeCreateSchema, periodesQuerySchema } from "@/lib/schemas/paie";
import { listerPeriodes, ouvrirPeriode } from "@/lib/services/paie/periodes";
import { writeAudit, clientIp } from "@/lib/audit";

/** Mois de paie d'un contribuable, avec leurs totaux. */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "paie", "read");
  const q = periodesQuerySchema.parse(searchParamsToObject(req.url));
  return ok(await listerPeriodes(q.contribuableId));
});

/** Ouvre un mois : un bulletin par salarié présent, calculé sur sa fiche. */
export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(await getSessionUser(), "paie", "create");
  const input = periodeCreateSchema.parse(await req.json());
  const periode = await ouvrirPeriode(input.contribuableId, input.periode, user.id);
  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "paie_periodes",
    entiteId: periode.id,
    diff: { apres: { periode: periode.periode, bulletins: periode.bulletins.length } },
    ip: clientIp(req),
  });
  return created(periode);
});
