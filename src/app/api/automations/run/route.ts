import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { ok, forbidden, withApi } from "@/lib/http";
import { runDailyAutomations } from "@/lib/services/automations";
import { writeAudit, clientIp } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Déclenche les automatisations quotidiennes.
 * Autorisé si : header `x-cron-secret` valide (cron), OU session avec la
 * permission d'écriture sur « parametres » (administrateur).
 */
export const POST = withApi(async (req: NextRequest) => {
  const cronSecret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  const viaCron = !!cronSecret && provided === cronSecret;

  let userId: number | null = null;
  if (!viaCron) {
    const user = await getSessionUser();
    if (!user || !hasPermission(user.permissions, "parametres", "update")) {
      throw forbidden("Réservé aux administrateurs (ou au cron).");
    }
    userId = user.id;
  }

  const result = await runDailyAutomations();

  await writeAudit({
    userId,
    action: "AUTOMATIONS_RUN",
    entite: "system",
    diff: { apres: result },
    ip: clientIp(req),
  });

  return ok(result);
});
