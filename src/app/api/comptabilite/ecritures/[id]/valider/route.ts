import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { validerEcritureEnBase } from "@/lib/services/comptabilite/ecritures";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Valide une écriture et lui attribue son numéro de pièce.
 *
 * Opération sans retour : l'écriture devient immuable. En cas de refus, la
 * réponse 422 porte dans ses détails la liste complète des erreurs, chacune
 * avec son code et, le cas échéant, l'index de la ligne fautive — de quoi les
 * afficher ligne à ligne plutôt qu'en un message unique.
 */
export const POST = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(
    await getSessionUser(),
    "comptabilite",
    "update",
  );
  const { id } = idParamSchema.parse(await params);

  const ecriture = await validerEcritureEnBase(id, user.id);

  await writeAudit({
    userId: user.id,
    action: "VALIDATION",
    entite: "cpta_ecritures",
    entiteId: id,
    diff: { apres: { numeroPiece: ecriture.numeroPiece, statut: ecriture.statut } },
    ip: clientIp(req),
  });

  return ok(ecriture);
});
