import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { contrepassationSchema } from "@/lib/schemas/comptabilite";
import { contrepasserEcriture } from "@/lib/services/comptabilite/ecritures";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Annule une écriture validée en enregistrant son inverse.
 *
 * Relève de « supprimer » : c'est l'acte d'annulation, le plus sensible du
 * module. Les deux écritures restent visibles au grand livre.
 */
export const POST = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(
    await getSessionUser(),
    "comptabilite",
    "delete",
  );
  const { id } = idParamSchema.parse(await params);

  const body = await req.json().catch(() => ({}));
  const { dateContrepassation } = contrepassationSchema.parse(body ?? {});

  const contre = await contrepasserEcriture(id, user.id, dateContrepassation);

  await writeAudit({
    userId: user.id,
    action: "CONTREPASSATION",
    entite: "cpta_ecritures",
    entiteId: id,
    diff: { apres: { contrepasseePar: contre.id, numeroPiece: contre.numeroPiece } },
    ip: clientIp(req),
  });

  return created(contre);
});
