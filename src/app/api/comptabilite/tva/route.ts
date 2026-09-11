import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { tvaQuerySchema } from "@/lib/schemas/comptabilite";
import {
  getDeclarationTva,
  reporterTvaSurDeclaration,
} from "@/lib/services/comptabilite/tva";
import { writeAudit, clientIp } from "@/lib/audit";

/**
 * Déclaration de TVA d'un mois, calculée depuis les livres.
 *
 * Le détail des comptes accompagne les totaux : c'est par là qu'on retrouve
 * l'écriture à l'origine d'un montant inattendu, sans quitter l'écran.
 */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const q = tvaQuerySchema.parse(searchParamsToObject(req.url));
  return ok(await getDeclarationTva(q.exerciceId, q.periode));
});

/**
 * Reporte le montant calculé sur la déclaration de TVA du suivi des
 * obligations.
 *
 * C'est une écriture dans le dossier fiscal du contribuable, pas une simple
 * consultation : elle exige la permission de modification et laisse une trace
 * d'audit. Le statut de la déclaration n'est pas touché — le montant est connu,
 * la déclaration n'est pas pour autant déposée.
 */
export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(
    await getSessionUser(),
    "comptabilite",
    "update",
  );
  const q = tvaQuerySchema.parse(await req.json());

  const { declaration, calcul } = await reporterTvaSurDeclaration(
    q.exerciceId,
    q.periode,
  );

  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "declarations",
    entiteId: declaration.id,
    diff: {
      apres: {
        periode: q.periode,
        montant: declaration.montant,
        source: "comptabilité",
      },
    },
    ip: clientIp(req),
  });

  return ok({ declaration, calcul });
});
