import "server-only";
import type {
  NotificationChannel,
  Recipient,
  OutboundNotification,
} from "@/lib/notifications/types";
import { sendTwilioMessage, hasTwilioCreds } from "./_twilio";

export const smsChannel: NotificationChannel = {
  name: "SMS",

  isConfigured() {
    return hasTwilioCreds() && !!process.env.TWILIO_SMS_FROM;
  },

  async send(recipient: Recipient, notif: OutboundNotification) {
    if (!recipient.telephone) throw new Error("Destinataire sans téléphone.");
    if (!this.isConfigured()) {
      throw new Error(
        "SMS non configuré (renseigner TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SMS_FROM).",
      );
    }
    await sendTwilioMessage(
      process.env.TWILIO_SMS_FROM!,
      recipient.telephone,
      notif.message,
    );
  },
};
