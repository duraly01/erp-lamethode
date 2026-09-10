// ---------------------------------------------------------------------------
// Migration de la base de DÉVELOPPEMENT.
//
//   npm run db:migrate:local
//
// Pourquoi ce fichier plutôt qu'un appel direct à `db:migrate:node` :
// `scripts/migrate.mjs` lit `DATABASE_URL_MIGRATION ?? DATABASE_URL`, et le
// `.env` du projet renseigne `DATABASE_URL_MIGRATION` avec l'adresse de la
// PRODUCTION. Lancer le migrateur pour éprouver un schéma en local viserait
// donc la production sans le moindre avertissement.
//
// Ce script neutralise la variable de production, vérifie que la cible est
// bien locale, puis délègue au migrateur habituel — les deux appliquent le
// même dossier `drizzle/` et tiennent le même journal.
// ---------------------------------------------------------------------------

import "dotenv/config";

delete process.env.DATABASE_URL_MIGRATION;

const url = process.env.DATABASE_URL ?? "";
let hote = "";
try {
  hote = new URL(url).hostname;
} catch {
  hote = "";
}

if (!["localhost", "127.0.0.1", "::1", "db"].includes(hote)) {
  console.error(
    `❌ Refus : DATABASE_URL vise « ${hote || "?"} », qui n'est pas une base locale.`,
  );
  console.error(
    "   Pour migrer la production, utilisez `npm run db:migrate:node` en connaissance de cause.",
  );
  process.exit(1);
}

console.log(`Migration de la base locale (${hote})…`);
await import("./migrate.mjs");
