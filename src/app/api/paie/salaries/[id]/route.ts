import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { noContent, ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { salarieUpdateSchema } from "@/lib/schemas/paie";
import { getSalarie, modifierSalarie, supprimerSalarie } from "@/lib/services/paie/salaries";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "paie", "read");
  const { id } = idParamSchema.parse(await params);
  return ok(await getSalarie(id));
});

export const PUT = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "paie", "update");
  const { id } = idParamSchema.parse(await params);
  const avant = await getSalarie(id);
  const salarie = await modifierSalarie(id, salarieUpdateSchema.parse(await req.json()));
  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "paie_salaries",
    entiteId: id,
    diff: {
      avant: { salaireBase: avant.salaireBase, actif: avant.actif, dateSortie: avant.dateSortie },
      apres: { salaireBase: salarie.salaireBase, actif: salarie.actif, dateSortie: salarie.dateSortie },
    },
    ip: clientIp(req),
  });
  return ok(salarie);
});

export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "paie", "delete");
  const { id } = idParamSchema.parse(await params);
  await supprimerSalarie(id);
  await writeAudit({ userId: user.id, action: "DELETE", entite: "paie_salaries", entiteId: id, ip: clientIp(req) });
  return noContent();
});
