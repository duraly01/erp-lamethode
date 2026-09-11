import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  declarations,
  contribuables,
  penalites,
  notifications,
  parametres,
} from "@/db/schema";
import { DECLARATION_TYPES, formatDateFR } from "@/lib/constants";
import { ajouterJours, jourAuCameroun } from "@/lib/dates";
import { computePenalty, DEFAULT_BAREME, type Bareme } from "@/lib/penalty";
import { createAndDispatchNotification } from "@/lib/notifications";
import { lireParametreOu } from "@/lib/services/parametres";
import type { NotificationCanal } from "@/lib/notifications/types";

// ---------------------------------------------------------------------------
// Service d'automatisation métier — exécuté par /api/automations/run ou le cron
// ---------------------------------------------------------------------------

const getParam = lireParametreOu;

function today(): string {
  return jourAuCameroun();
}

/**
 * Passe les déclarations échues (A_FAIRE, échéance dépassée) en EN_RETARD et
 * crée une pénalité estimée pour chacune (sans doublon).
 */
export async function processOverdue() {
  const now = today();

  const overdue = await db
    .update(declarations)
    .set({ statut: "EN_RETARD", updatedAt: new Date() })
    .where(
      and(
        eq(declarations.statut, "A_FAIRE"),
        sql`${declarations.dateEcheance} < ${now}`,
      ),
    )
    .returning();

  const bareme = await getParam<Bareme>("penalite_bareme", DEFAULT_BAREME);
  let penaltiesCreated = 0;

  for (const d of overdue) {
    const [existing] = await db
      .select({ id: penalites.id })
      .from(penalites)
      .where(eq(penalites.declarationId, d.id))
      .limit(1);
    if (existing) continue;

    const montant = computePenalty(bareme, d.montant);
    await db.insert(penalites).values({
      declarationId: d.id,
      montant: montant.toFixed(2),
      baseCalcul:
        bareme.type === "fixe" ? `fixe:${bareme.valeur}` : `pct:${bareme.valeur}`,
      statut: "ESTIMEE",
      notes: "Pénalité estimée automatiquement au passage en retard.",
    });
    penaltiesCreated++;
  }

  return { markedOverdue: overdue.length, penaltiesCreated };
}

/**
 * Crée des rappels (notifications) pour les échéances à J-15 / J-7 / J-1
 * (jours configurables), sans re-notifier une échéance déjà signalée non lue.
 */
export async function generateReminders() {
  const days = await getParam<number[]>("rappels_jours", [15, 7, 1]);
  const canaux = await getParam<NotificationCanal[]>("rappels_canaux", [
    "DASHBOARD",
    "EMAIL",
  ]);
  const base = today();
  let created = 0;

  for (const dd of days) {
    // Les échéances sont des jours calendaires : on compte en jours depuis
    // aujourd'hui au Cameroun, et non en tranches de 24 heures depuis
    // l'instant présent.
    const targetStr = ajouterJours(base, dd);

    const due = await db
      .select({
        id: declarations.id,
        type: declarations.type,
        periode: declarations.periode,
        assignedTo: declarations.assignedTo,
        contribuableNom: contribuables.nom,
      })
      .from(declarations)
      .innerJoin(
        contribuables,
        eq(declarations.contribuableId, contribuables.id),
      )
      .where(
        and(
          eq(declarations.statut, "A_FAIRE"),
          eq(declarations.dateEcheance, targetStr),
        ),
      );

    for (const d of due) {
      const [ex] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.ressourceType, "declaration"),
            eq(notifications.ressourceId, d.id),
            eq(notifications.type, "RAPPEL"),
            eq(notifications.lu, false),
          ),
        )
        .limit(1);
      if (ex) continue;

      // Insère la notification tableau de bord ET diffuse par email (si configuré).
      await createAndDispatchNotification({
        userId: d.assignedTo ?? null,
        type: "RAPPEL",
        message: `Échéance ${DECLARATION_TYPES[d.type]?.label ?? d.type} ${d.periode} — ${d.contribuableNom} : dans ${dd} jour(s) (${formatDateFR(targetStr)}).`,
        ressourceType: "declaration",
        ressourceId: d.id,
        canaux,
      });
      created++;
    }
  }

  return { remindersCreated: created };
}

/** Orchestrateur : exécute l'ensemble des automatisations quotidiennes. */
export async function runDailyAutomations() {
  const overdue = await processOverdue();
  const reminders = await generateReminders();

  // Notification de synthèse (diffusée) si quelque chose s'est produit.
  if (overdue.markedOverdue > 0 || reminders.remindersCreated > 0) {
    await db.insert(notifications).values({
      userId: null,
      type: "INFO",
      canal: "DASHBOARD",
      message: `Automatisations : ${overdue.markedOverdue} passée(s) en retard, ${overdue.penaltiesCreated} pénalité(s), ${reminders.remindersCreated} rappel(s).`,
    });
  }

  return { ...overdue, ...reminders, ranAt: new Date().toISOString() };
}
