import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { baremePaieVersionsSchema } from "@/lib/schemas/paie";
import { enregistrerBaremePaie, lireBaremePaie } from "@/lib/services/paie/bareme";
import { writeAudit, clientIp } from "@/lib/audit";

/** Les versions datées du barème de paie. */
export const GET = withApi(async () => {
  requirePermission(await getSessionUser(), "paie", "read");
  return ok({ versions: await lireBaremePaie() });
});

/** Remplace l'ensemble des versions. Réservé à qui règle les paramètres. */
export const PUT = withApi(async (req: NextRequest) => {
  const user = requirePermission(await getSessionUser(), "parametres", "update");
  const { versions } = baremePaieVersionsSchema.parse(await req.json());
  const enregistrees = await enregistrerBaremePaie(versions);
  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "parametres",
    entiteId: 0,
    diff: { apres: { cle: "paie_bareme", versions: enregistrees.map((v) => v.valideDu) } },
    ip: clientIp(req),
  });
  return ok({ versions: enregistrees });
});
