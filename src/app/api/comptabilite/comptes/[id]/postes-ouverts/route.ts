import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { getPostesOuverts } from "@/lib/services/comptabilite/lettrage";

/**
 * Lignes non lettrées du compte : ce qui reste réellement dû.
 *
 * C'est la liste sur laquelle s'appuient la relance client et la balance âgée.
 */
export const GET = withApi(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    requirePermission(await getSessionUser(), "comptabilite", "read");
    const { id } = idParamSchema.parse(await params);
    return ok(await getPostesOuverts(id));
  },
);
