import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, badRequest, withApi } from "@/lib/http";
import { dispatchToChannels } from "@/lib/notifications";
import { emailChannel } from "@/lib/notifications/channels/email";

export const runtime = "nodejs";

// Envoie un email de test au compte administrateur courant.
export const POST = withApi(async (_req: NextRequest) => {
  const user = requirePermission(await getSessionUser(), "parametres", "update");
  if (!user.email) throw badRequest("Votre compte n'a pas d'adresse email.");

  const results = await dispatchToChannels(
    { userId: user.id, nom: user.nom, email: user.email, telephone: null },
    {
      type: "INFO",
      subject: "Test — ERP LaMethode",
      message:
        "Ceci est un email de test envoyé depuis les paramètres de l'ERP LaMethode. Si vous le recevez, le canal email est opérationnel.",
    },
    ["EMAIL"],
  );

  const emailResult = results[0];
  return ok({
    sent: emailResult?.ok ?? false,
    detail: emailResult?.detail,
    // Vrai envoi seulement si l'hôte ET le mot de passe SMTP sont présents ;
    // sinon l'email est rendu et loggé côté serveur (repli dev).
    smtpConfigured: emailChannel.isConfigured(),
    to: user.email,
  });
});
