import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { noContent, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { codeLettrageSchema } from "@/lib/schemas/comptabilite";
import {
  delettrer,
  getLignesLettrees,
} from "@/lib/services/comptabilite/lettrage";
import { writeAudit, clientIp } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; code: string }> };

/**
 * Retire un code de lettrage et rouvre les lignes concernées.
 *
 * Relève de « modifier » et non de « supprimer » : le délettrage ne touche à
 * aucun montant et se refait sans trace comptable.
 */
export const DELETE = withApi(async (req: NextRequest, { params }: Ctx) => {
  const user = requirePermission(
    await getSessionUser(),
    "comptabilite",
    "update",
  );
  const p = await params;
  const { id } = idParamSchema.parse({ id: p.id });
  const { code } = codeLettrageSchema.parse({ code: p.code });

  const avant = await getLignesLettrees(id, code.toUpperCase());
  await delettrer(id, code.toUpperCase());

  await writeAudit({
    userId: user.id,
    action: "DELETTRAGE",
    entite: "cpta_lettrages",
    entiteId: id,
    diff: { avant: { code, lignes: avant } },
    ip: clientIp(req),
  });

  return noContent();
});
