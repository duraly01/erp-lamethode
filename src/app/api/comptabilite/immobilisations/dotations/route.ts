import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { parExerciceSchema } from "@/lib/schemas/comptabilite";
import { passerDotations, previsualiserDotations } from "@/lib/services/comptabilite/immobilisations";
import { writeAudit, clientIp } from "@/lib/audit";

/** Ce que les dotations de l'exercice donneraient : les biens encore à doter et leur montant. */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { exerciceId } = parExerciceSchema.parse(searchParamsToObject(req.url));
  return ok(await previsualiserDotations(exerciceId));
});

/** Passe l'écriture de dotations de l'exercice pour les biens qui n'en ont pas encore. */
export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "create");
  const { exerciceId } = parExerciceSchema.parse(await req.json());
  const resultat = await passerDotations(exerciceId, user.id);
  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "cpta_ecritures",
    entiteId: resultat.ecriture.id,
    diff: { apres: { origine: "AMORTISSEMENT", exerciceId, numeroPiece: resultat.ecriture.numeroPiece, dotations: resultat.dotations } },
    ip: clientIp(req),
  });
  return created(resultat);
});
