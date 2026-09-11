import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { salarieCreateSchema, salariesQuerySchema } from "@/lib/schemas/paie";
import { creerSalarie, listerSalaries } from "@/lib/services/paie/salaries";
import { writeAudit, clientIp } from "@/lib/audit";

/** Salariés d'un contribuable. */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "paie", "read");
  const q = salariesQuerySchema.parse(searchParamsToObject(req.url));
  return ok(await listerSalaries(q.contribuableId, { actifs: q.actifs === undefined ? undefined : q.actifs === "true" }));
});

export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(await getSessionUser(), "paie", "create");
  const input = salarieCreateSchema.parse(await req.json());
  const salarie = await creerSalarie(input);
  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "paie_salaries",
    entiteId: salarie.id,
    diff: { apres: { matricule: salarie.matricule, nom: salarie.nom, salaireBase: salarie.salaireBase } },
    ip: clientIp(req),
  });
  return created(salarie);
});
