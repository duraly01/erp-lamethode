import "server-only";
import type {
  NotificationChannel,
  Recipient,
  OutboundNotification,
} from "@/lib/notifications/types";

// Push navigateur (Web Push) : ossature. Un envoi réel nécessite des clés VAPID
// et le stockage des abonnements push par utilisateur (table à ajouter).
export const pushChannel: NotificationChannel = {
  name: "PUSH",

  isConfigured() {
    return false; // nécessite VAPID + table d'abonnements (non encore en place)
  },

  async send(_recipient: Recipient, _notif: OutboundNotification) {
    throw new Error(
      "Push non configuré (nécessite des clés VAPID et le stockage des abonnements).",
    );
  },
};
