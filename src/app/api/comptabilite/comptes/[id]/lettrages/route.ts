import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, created, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { lettrageCreateSchema } from "@/lib/schemas/comptabilite";
import {
  listerLettrages,
  lettrerLignes,
} from "@/lib/services/comptabilite/lettrage";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Codes de lettrage déjà posés sur le compte. */
export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { id } = idParamSchema.parse(await params);
  return ok(await listerLettrages(id));
});

/**
 * Lettre un groupe de lignes sous un même code.
 *
 * Le service refuse un groupe qui ne se solde pas : lettrer sans solder ferait
 * disparaître du relevé des postes ouverts une somme qui reste due.
 */
export const POST = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(
    await getSessionUser(),
    "comptabilite",
    "update",
  );
  const { id } = idParamSchema.parse(await params);
  const { ligneIds } = lettrageCreateSchema.parse(await req.json());

  const lettrage = await lettrerLignes(id, ligneIds, user.id);

  await writeAudit({
    userId: user.id,
    action: "LETTRAGE",
    entite: "cpta_lettrages",
    entiteId: lettrage.id,
    diff: { apres: lettrage },
    ip: clientIp(req),
  });

  return created(lettrage);
});
