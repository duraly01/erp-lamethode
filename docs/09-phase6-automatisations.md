# Phase 6 — Automatisations

**Statut :** livré & vérifié de bout en bout

---

## 1. Service métier

[`src/lib/services/automations.ts`](../src/lib/services/automations.ts) :

- **`processOverdue()`** — passe les déclarations `A_FAIRE` échues en `EN_RETARD` et crée une
  **pénalité estimée** par déclaration (barème lu dans `parametres.penalite_bareme` :
  `pct` × montant avec minimum, ou `fixe`). Sans doublon (une pénalité par déclaration).
- **`generateReminders()`** — crée des **rappels** (notifications) pour les échéances à
  J-15 / J-7 / J-1 (jours configurables via `parametres.rappels_jours`), adressés au
  collaborateur assigné (ou diffusés). Pas de re-notification tant que le rappel n'est pas lu.
- **`runDailyAutomations()`** — orchestre les deux + notification de synthèse.

Toutes les opérations sont **idempotentes** (relancer ne recrée rien).

## 2. Déclenchement

| Voie | Détail |
|------|--------|
| **Endpoint** | `POST /api/automations/run` — autorisé par header `x-cron-secret` (cron) **ou** session administrateur |
| **Script** | `npm run automations` ([`src/scripts/automations.ts`](../src/scripts/automations.ts)) — appelle l'endpoint avec le secret |
| **Bouton UI** | « Lancer maintenant » dans **Paramètres** (admin) |

### Planification (production)
Ajouter au cron du serveur (exécution quotidienne à 7h, serveur démarré) :
```
0 7 * * *  cd /chemin/app && npm run automations >> /var/log/lamethode-cron.log 2>&1
```
Le secret est défini dans `.env` (`CRON_SECRET`, cf. `.env.example`).

## 3. Notifications

- API : [`GET /api/notifications`](../src/app/api/notifications/route.ts) (siennes + diffusées,
  `unreadCount`), `PATCH /api/notifications/[id]` (marquer lu), `POST /api/notifications/read-all`.
- UI : **cloche** dans la barre du haut ([`NotificationBell`](../src/components/shell/NotificationBell.tsx))
  avec compteur de non-lus, panneau déroulant, marquage lu, rafraîchissement automatique (60 s).

## 4. Vérifications

✅ 28 déclarations échues → `EN_RETARD` · ✅ 27 pénalités créées (barème) · ✅ **idempotence**
(2ᵉ run : 0/0) · ✅ rappel J-7 généré sur une échéance test · ✅ notifications listées avec
`unreadCount` · ✅ cloche UI avec badge + panneau · ✅ `POST /run` sans secret ni session → **403**
· ✅ dashboard « En retard » mis à jour · ✅ `typecheck` vert.

---

## ⏸️ Reste au plan
Phase 7 — Exports (PDF/Excel) · Phase 8 — Tests (unitaires règles métier, intégration API, e2e).
