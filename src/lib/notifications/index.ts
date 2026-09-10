import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, notifications } from "@/db/schema";
import { emailChannel } from "@/lib/notifications/channels/email";
import { smsChannel } from "@/lib/notifications/channels/sms";
import { whatsappChannel } from "@/lib/notifications/channels/whatsapp";
import { pushChannel } from "@/lib/notifications/channels/push";
import type {
  NotificationCanal,
  NotificationType,
  OutboundNotification,
  Recipient,
  ChannelSendResult,
} from "@/lib/notifications/types";

const CHANNELS = [emailChannel, smsChannel, whatsappChannel, pushChannel];

/** État de configuration de chaque canal (pour l'écran Paramètres). */
export function channelStatus() {
  return [
    { name: "DASHBOARD" as NotificationCanal, configured: true },
    ...CHANNELS.map((c) => ({ name: c.name, configured: c.isConfigured() })),
  ];
}

async function resolveRecipient(userId: number | null): Promise<Recipient> {
  if (!userId) return { userId: null };
  const [u] = await db
    .select({ nom: users.nom, email: users.email, telephone: users.telephone })
    .from(users)
    .where(eq(users.id, userId));
  return {
    userId,
    nom: u?.nom ?? null,
    email: u?.email ?? null,
    telephone: u?.telephone ?? null,
  };
}

/** Envoie une notification sur les canaux demandés (hors DASHBOARD). */
export async function dispatchToChannels(
  recipient: Recipient,
  notif: OutboundNotification,
  canaux: NotificationCanal[],
): Promise<ChannelSendResult[]> {
  const results: ChannelSendResult[] = [];
  for (const canal of canaux) {
    if (canal === "DASHBOARD") continue;
    const ch = CHANNELS.find((c) => c.name === canal);
    if (!ch) {
      results.push({ canal, ok: false, detail: "canal inconnu" });
      continue;
    }
    // EMAIL fonctionne même sans SMTP (repli dev) ; les autres exigent leur config.
    if (canal !== "EMAIL" && !ch.isConfigured()) {
      results.push({ canal, ok: false, skipped: true, detail: "non configuré" });
      continue;
    }
    try {
      await ch.send(recipient, notif);
      results.push({ canal, ok: true });
    } catch (e) {
      results.push({
        canal,
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

/**
 * Crée la notification tableau de bord (en base) ET la diffuse sur les autres
 * canaux configurés. Point d'entrée unique utilisé par les automatisations.
 */
export async function createAndDispatchNotification(params: {
  userId: number | null;
  type: NotificationType;
  message: string;
  subject?: string;
  ressourceType?: string | null;
  ressourceId?: number | null;
  canaux?: NotificationCanal[];
}): Promise<ChannelSendResult[]> {
  const canaux = params.canaux ?? ["DASHBOARD", "EMAIL"];

  if (canaux.includes("DASHBOARD")) {
    await db.insert(notifications).values({
      userId: params.userId,
      type: params.type,
      canal: "DASHBOARD",
      ressourceType: params.ressourceType ?? null,
      ressourceId: params.ressourceId ?? null,
      message: params.message,
    });
  }

  const others = canaux.filter((c) => c !== "DASHBOARD");
  if (others.length === 0 || params.userId == null) return [];

  const recipient = await resolveRecipient(params.userId);
  return dispatchToChannels(
    recipient,
    {
      type: params.type,
      message: params.message,
      subject: params.subject,
      ressourceType: params.ressourceType,
      ressourceId: params.ressourceId,
    },
    others,
  );
}
