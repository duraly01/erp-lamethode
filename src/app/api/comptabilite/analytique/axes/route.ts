import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { axeCreateSchema, parContribuableSchema } from "@/lib/schemas/comptabilite";
import { creerAxe, listerAxes } from "@/lib/services/comptabilite/analytique";

/** Axes analytiques du contribuable, avec leurs sections. */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { contribuableId } = parContribuableSchema.parse(searchParamsToObject(req.url));
  return ok(await listerAxes(contribuableId));
});

export const POST = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "create");
  const { contribuableId, ...input } = axeCreateSchema.parse(await req.json());
  return created(await creerAxe(contribuableId, input));
});
