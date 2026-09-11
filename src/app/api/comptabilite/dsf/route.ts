import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { dsfQuerySchema } from "@/lib/schemas/comptabilite";
import { parseMontant } from "@/lib/comptable/money";
import { getDsf, reporterDsfSurDeclaration } from "@/lib/services/comptabilite/dsf";
import { writeAudit, clientIp } from "@/lib/audit";

/** Les retraitements arrivent en francs saisis ; le moteur travaille en centimes. */
function retraitements(q: {
  reintegrations?: string | number | null;
  deductions?: string | number | null;
}) {
  return {
    reintegrations: parseMontant(q.reintegrations ?? 0),
    deductions: parseMontant(q.deductions ?? 0),
  };
}

/**
 * DSF de l'exercice : la liasse et la liquidation de l'impôt sur le résultat.
 *
 * `liquidation.baremeManquant` vaut vrai tant que le barème n'est pas
 * paramétré. Tout ce qui dépend d'un taux vaut alors `null` — et non zéro, qui
 * se lirait « rien à payer ». L'écran doit renvoyer vers les paramètres.
 */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "comptabilite", "read");
  const q = dsfQuerySchema.parse(searchParamsToObject(req.url));
  return ok(await getDsf(q.exerciceId, retraitements(q)));
});

/**
 * Reporte le solde d'impôt sur la déclaration DSF du suivi des obligations.
 *
 * Refusé tant que le barème manque : mieux vaut ne rien écrire qu'un zéro qui
 * passerait pour un montant liquidé.
 */
export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(
    await getSessionUser(),
    "comptabilite",
    "update",
  );
  const q = dsfQuerySchema.parse(await req.json());

  const { declaration, dsf } = await reporterDsfSurDeclaration(
    q.exerciceId,
    retraitements(q),
  );

  await writeAudit({
    userId: user.id,
    action: "UPDATE",
    entite: "declarations",
    entiteId: declaration.id,
    diff: {
      apres: {
        periode: dsf.annee,
        montant: declaration.montant,
        resultatFiscal: dsf.liquidation.resultatFiscal,
        minimumApplique: dsf.liquidation.minimumApplique,
        source: "comptabilité",
      },
    },
    ip: clientIp(req),
  });

  return ok({ declaration, dsf });
});
