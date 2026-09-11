import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { parExerciceSchema } from "@/lib/schemas/comptabilite";
import { getNotesAnnexes } from "@/lib/services/comptabilite/notes-annexes";

/**
 * Notes annexes chiffrées de l'exercice, et liste de celles qui restent à
 * rédiger parce que les livres ne les contiennent pas.
 */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const q = parExerciceSchema.parse(searchParamsToObject(req.url));
  return ok(await getNotesAnnexes(q.exerciceId));
});
