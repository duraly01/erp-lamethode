# Canaux de notification (Email / SMS / WhatsApp / Push)

**Statut :** livré & vérifié · Email pleinement fonctionnel · SMS/WhatsApp prêts à brancher (Twilio)

---

## 1. Architecture

Couche extensible dans [`src/lib/notifications/`](../src/lib/notifications) :

- **`types.ts`** — interface `NotificationChannel` (`name`, `isConfigured()`, `send()`).
- **`channels/email.ts`** — **nodemailer**. SMTP si configuré, sinon repli dev (email « rendu » et loggé).
- **`channels/sms.ts`** + **`channels/whatsapp.ts`** — **Twilio** (via `fetch`, sans SDK) — fonctionnels dès que les identifiants sont fournis.
- **`channels/push.ts`** — ossature (nécessite clés VAPID + stockage des abonnements).
- **`index.ts`** — registre + `channelStatus()` + `dispatchToChannels()` + **`createAndDispatchNotification()`** (insère la notif tableau de bord ET diffuse sur les autres canaux).

## 2. Intégration

Les **rappels d'échéance** ([`services/automations.ts`](../src/lib/services/automations.ts))
passent par `createAndDispatchNotification(... canaux: ["DASHBOARD","EMAIL"])` : chaque rappel
crée l'entrée tableau de bord **et** envoie un email au collaborateur assigné.

## 3. Configuration (`.env`)

| Canal | Variables |
|-------|-----------|
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM` |
| WhatsApp | idem Twilio + `TWILIO_WHATSAPP_FROM` |

Sans `SMTP_HOST`, les emails sont **rendus et loggés** (dev) mais non envoyés.

## 4. Interface

Écran **Paramètres** (admin) : état de chaque canal (`actif` / `à brancher`) + bouton
**« Email de test »**. Endpoints : `GET /api/notifications/channels`,
`POST /api/notifications/test-email`.

## 5. Vérifications

✅ Email de test → rendu + loggé (`[email:dev] → admin@lamethode.cm`) · ✅ rappel
d'automatisation → **email déclenché** au collaborateur assigné (« Rappel d'échéance… dans 7
jour(s) ») · ✅ statut des 5 canaux exposé · ✅ SMS/WhatsApp appellent réellement Twilio si
configurés (sinon « non configuré » propre) · ✅ `typecheck` 0 err · `lint` 0 err · **32/32** tests.

## 6. Pour activer en production

- **Email** : renseigner les variables SMTP (ex. Resend/SendGrid/serveur du cabinet).
- **SMS/WhatsApp** : créer un compte Twilio, renseigner les identifiants (+ modèles WhatsApp approuvés).
- **Push** : ajouter des clés VAPID et une table d'abonnements push (évolution).
