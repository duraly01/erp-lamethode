import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { noContent, ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { immobilisationSchema } from "@/lib/schemas/comptabilite";
import { getImmobilisation, modifierImmobilisation, supprimerImmobilisation } from "@/lib/services/comptabilite/immobilisations";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** La fiche, son plan d'amortissement exercice par exercice, et ce qui en a été passé. */
export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { id } = idParamSchema.parse(await params);
  return ok(await getImmobilisation(id));
});

export const PUT = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "update");
  const { id } = idParamSchema.parse(await params);
  const input = immobilisationSchema.parse(await req.json());
  const immobilisation = await modifierImmobilisation(id, input);
  await writeAudit({ userId: user.id, action: "UPDATE", entite: "cpta_immobilisations", entiteId: id, diff: { apres: input }, ip: clientIp(req) });
  return ok(immobilisation);
});

/** Une fiche sans écriture se jette ; une fiche dotée ou sortie reste. */
export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "delete");
  const { id } = idParamSchema.parse(await params);
  await supprimerImmobilisation(id);
  await writeAudit({ userId: user.id, action: "DELETE", entite: "cpta_immobilisations", entiteId: id, ip: clientIp(req) });
  return noContent();
});
