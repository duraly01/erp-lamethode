import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { sectionCreateSchema } from "@/lib/schemas/comptabilite";
import { creerSection } from "@/lib/services/comptabilite/analytique";

type Ctx = { params: Promise<{ id: string }> };

/** Nouvelle section sur l'axe. */
export const POST = withApi(async (req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "comptabilite", "create");
  const { id } = idParamSchema.parse(await params);
  return created(await creerSection(id, sectionCreateSchema.parse(await req.json())));
});
