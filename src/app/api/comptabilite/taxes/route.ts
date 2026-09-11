import { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cptaTaxes, cptaComptes } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { parContribuableSchema } from "@/lib/schemas/comptabilite";

/**
 * Taxes du contribuable, avec leur période de validité et leur compte.
 *
 * Toutes sont rendues, y compris celles qui ne sont plus en vigueur : une
 * pièce antérieure se saisit au taux de son époque, et c'est le service qui
 * vérifie qu'une taxe est valide à la date de la pièce.
 */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const { contribuableId } = parContribuableSchema.parse(
    searchParamsToObject(req.url),
  );

  return ok(
    await db
      .select({
        id: cptaTaxes.id,
        code: cptaTaxes.code,
        libelle: cptaTaxes.libelle,
        taux: cptaTaxes.taux,
        type: cptaTaxes.type,
        compteId: cptaTaxes.compteId,
        compteNumero: cptaComptes.numero,
        valideDu: cptaTaxes.valideDu,
        valideAu: cptaTaxes.valideAu,
      })
      .from(cptaTaxes)
      .leftJoin(cptaComptes, eq(cptaTaxes.compteId, cptaComptes.id))
      .where(and(eq(cptaTaxes.contribuableId, contribuableId)))
      .orderBy(asc(cptaTaxes.type), asc(cptaTaxes.code)),
  );
});
