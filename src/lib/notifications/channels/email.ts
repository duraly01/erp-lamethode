import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import type {
  NotificationChannel,
  Recipient,
  OutboundNotification,
} from "@/lib/notifications/types";

/** Envoi SMTP réel activé uniquement si l'hôte ET le mot de passe sont fournis. */
function smtpReady(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_PASS);
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  if (smtpReady()) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER ?? process.env.SMTP_FROM,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Repli dev : n'envoie rien réellement mais produit le message (loggé).
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

const SUBJECTS: Record<string, string> = {
  RAPPEL: "Rappel d'échéance — LaMethode",
  ALERTE: "Alerte — LaMethode",
  INFO: "Information — LaMethode",
};

export const emailChannel: NotificationChannel = {
  name: "EMAIL",

  isConfigured() {
    return smtpReady();
  },

  async send(recipient: Recipient, notif: OutboundNotification) {
    if (!recipient.email) throw new Error("Destinataire sans email.");

    const from = process.env.SMTP_FROM ?? "ERP LaMethode <no-reply@lamethode.cm>";
    const subject = notif.subject ?? SUBJECTS[notif.type] ?? "Notification LaMethode";
    const info = await getTransporter().sendMail({
      from,
      to: recipient.email,
      subject,
      text: notif.message,
      html: renderHtml(recipient.nom ?? "", notif.message),
    });

    // En repli dev (jsonTransport), on trace le message généré.
    if (!smtpReady()) {
      console.log(
        `[email:dev] → ${recipient.email} | ${subject} | ${notif.message}`,
      );
    }
    void info;
  },
};

function renderHtml(nom: string, message: string) {
  return `<div style="font-family:sans-serif;max-width:520px">
    <div style="border-bottom:3px solid #59b233;padding-bottom:8px;margin-bottom:16px">
      <strong style="font-size:18px;color:#111827">La<span style="color:#59b233">M</span>ethode</strong>
    </div>
    <p style="color:#111827">Bonjour ${nom || ""},</p>
    <p style="color:#334155">${message}</p>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">ERP Fiscal &amp; Social — Cabinet LaMethode SARL</p>
  </div>`;
}
