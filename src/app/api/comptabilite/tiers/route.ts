import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, created, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import {
  parContribuableSchema,
  tiersCreateSchema,
} from "@/lib/schemas/comptabilite";
import { listerTiers, creerTiers } from "@/lib/services/comptabilite/tiers";
import { writeAudit, clientIp } from "@/lib/audit";

/** Tiers actifs du contribuable, par raison sociale. */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { contribuableId } = parContribuableSchema.parse(
    searchParamsToObject(req.url),
  );
  return ok(await listerTiers(contribuableId));
});

export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(
    await getSessionUser(),
    "comptabilite",
    "create",
  );
  const body = tiersCreateSchema.parse(await req.json());
  const tiers = await creerTiers(body);

  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "cpta_tiers",
    entiteId: tiers.id,
    diff: { apres: tiers },
    ip: clientIp(req),
  });

  return created(tiers);
});
