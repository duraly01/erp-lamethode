import "dotenv/config";

// Script d'exécution des automatisations (pour cron / tâche planifiée).
// Appelle l'endpoint sécurisé avec le secret cron. Le serveur doit tourner.
//   npm run automations
async function main() {
  const base = process.env.APP_URL || "http://localhost:3000";
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(
      "❌ CRON_SECRET manquant dans .env — requis pour l'exécution non interactive.",
    );
    process.exit(1);
  }

  const res = await fetch(`${base}/api/automations/run`, {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`❌ Échec (${res.status}) :`, body);
    process.exit(1);
  }
  console.log("✅ Automatisations exécutées :", body);
}

main().catch((e) => {
  console.error("❌ Erreur :", e);
  process.exit(1);
});
