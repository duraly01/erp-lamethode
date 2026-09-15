import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { immobilisationCreateSchema, immobilisationsQuerySchema } from "@/lib/schemas/comptabilite";
import { creerImmobilisation, listerImmobilisations } from "@/lib/services/comptabilite/immobilisations";
import { writeAudit, clientIp } from "@/lib/audit";

/** Registre des immobilisations du contribuable, avec l'amorti et la valeur nette à la clôture de l'exercice demandé. */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const q = immobilisationsQuerySchema.parse(searchParamsToObject(req.url));
  return ok(await listerImmobilisations(q.contribuableId, q.exerciceId));
});

/** Nouvelle fiche. Le bien est déjà dans les livres par sa facture ; la fiche dit comment l'amortir. */
export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(await getSessionUser(), "comptabilite", "create");
  const { contribuableId, ...input } = immobilisationCreateSchema.parse(await req.json());
  const immobilisation = await creerImmobilisation(contribuableId, input, user.id);
  await writeAudit({
    userId: user.id,
    action: "CREATE",
    entite: "cpta_immobilisations",
    entiteId: immobilisation.id,
    diff: { apres: { code: immobilisation.code, libelle: immobilisation.libelle, valeurOrigine: immobilisation.valeurOrigine } },
    ip: clientIp(req),
  });
  return created(immobilisation);
});
