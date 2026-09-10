import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { parContribuableSchema } from "@/lib/schemas/comptabilite";
import { listerJournaux } from "@/lib/services/comptabilite/restitutions";

/** Journaux de saisie du contribuable (achats, ventes, banque, caisse, OD, AN). */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { contribuableId } = parContribuableSchema.parse(
    searchParamsToObject(req.url),
  );
  return ok(await listerJournaux(contribuableId));
});
