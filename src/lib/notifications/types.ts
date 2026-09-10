// Types de la couche de notification multi-canal (module pur).

export type NotificationCanal =
  | "DASHBOARD"
  | "EMAIL"
  | "SMS"
  | "WHATSAPP"
  | "PUSH";

export type NotificationType = "RAPPEL" | "ALERTE" | "INFO";

export type Recipient = {
  userId: number | null;
  nom?: string | null;
  email?: string | null;
  telephone?: string | null;
};

export type OutboundNotification = {
  type: NotificationType;
  message: string;
  subject?: string;
  ressourceType?: string | null;
  ressourceId?: number | null;
};

export type ChannelSendResult = {
  canal: NotificationCanal;
  ok: boolean;
  skipped?: boolean;
  detail?: string;
};

/** Contrat qu'implémente chaque canal d'envoi. */
export interface NotificationChannel {
  readonly name: NotificationCanal;
  /** true si le canal dispose des identifiants/config nécessaires à un envoi réel. */
  isConfigured(): boolean;
  /** Envoie la notification ; lève une erreur en cas d'échec. */
  send(recipient: Recipient, notif: OutboundNotification): Promise<void>;
}
