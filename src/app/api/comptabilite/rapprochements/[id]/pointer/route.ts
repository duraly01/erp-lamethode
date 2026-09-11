import { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { pointageSchema } from "@/lib/schemas/comptabilite";
import { pointer } from "@/lib/services/comptabilite/rapprochement";

type Ctx = { params: Promise<{ id: string }> };

/** Pointe ou dépointe des lignes ; rend l'état recalculé. */
export const POST = withApi(async (req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "update");
  const id = z.coerce.number().int().positive().parse((await params).id);
  const body = pointageSchema.parse(await req.json());
  return ok(await pointer(id, body.ligneIds, body.pointer));
});
