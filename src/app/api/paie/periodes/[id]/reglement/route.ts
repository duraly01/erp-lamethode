import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { reglementSalairesSchema } from "@/lib/schemas/paie";
import { preparerReglement, reglerSalaires } from "@/lib/services/paie/reglement";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Journaux de trésorerie du contribuable et état de règlement de chaque bulletin. */
export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "paie", "read");
  const { id } = idParamSchema.parse(await params);
  return ok(await preparerReglement(id));
});

/**
 * Règle les salaires du mois : écriture de trésorerie, une ligne par
 * salarié sur son compte individuel, lettrée avec le net dû par la paie.
 */
export const POST = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(await getSessionUser(), "paie", "update");
  const { id } = idParamSchema.parse(await params);
  const input = reglementSalairesSchema.parse(await req.json());
  const resultat = await reglerSalaires(id, input, user.id);
  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "paie_periodes",
    entiteId: id,
    diff: { apres: { reglementEcritureId: resultat.ecriture.id, numeroPiece: resultat.ecriture.numeroPiece, bulletinIds: resultat.bulletinIds } },
    ip: clientIp(req),
  });
  return created(resultat);
});
