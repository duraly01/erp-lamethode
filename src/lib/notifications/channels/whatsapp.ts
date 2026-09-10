import "server-only";
import type {
  NotificationChannel,
  Recipient,
  OutboundNotification,
} from "@/lib/notifications/types";
import { sendTwilioMessage, hasTwilioCreds } from "./_twilio";

export const whatsappChannel: NotificationChannel = {
  name: "WHATSAPP",

  isConfigured() {
    return hasTwilioCreds() && !!process.env.TWILIO_WHATSAPP_FROM;
  },

  async send(recipient: Recipient, notif: OutboundNotification) {
    if (!recipient.telephone) throw new Error("Destinataire sans téléphone.");
    if (!this.isConfigured()) {
      throw new Error(
        "WhatsApp non configuré (TWILIO_WHATSAPP_FROM + identifiants Twilio requis).",
      );
    }
    // Twilio attend le préfixe « whatsapp: » sur les deux numéros.
    await sendTwilioMessage(
      `whatsapp:${process.env.TWILIO_WHATSAPP_FROM!}`,
      `whatsapp:${recipient.telephone}`,
      notif.message,
    );
  },
};
