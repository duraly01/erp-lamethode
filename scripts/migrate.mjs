// ---------------------------------------------------------------------------
// Migration des schémas, exécutable sur un hébergement contraint.
//
//   npm run db:migrate:node
//
// Pourquoi ce script « maison » plutôt que drizzle-orm/migrator :
//   1. drizzle-kit migrate charge un module WebAssembly → bloqué par LVE
//   2. drizzle-orm/migrator exécute  CREATE SCHEMA IF NOT EXISTS "drizzle"
//      → bloqué par l'hébergement mutualisé qui ne donne pas le privilège
//      CREATE sur la base.
//
// Ce script reproduit exactement la logique du migrateur Drizzle (lecture du
// journal, hash SHA-256, application dans une transaction, table de suivi),
// mais stocke la table de suivi dans le schéma « public » au lieu de créer
// un schéma « drizzle ».  Le format de la table reste identique : si un jour
// l'hébergeur accorde le privilège, on peut revenir au migrateur standard.
//
// Fichier .mjs volontairement : ni TypeScript ni tsx.
// ---------------------------------------------------------------------------

import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const dossierMigrations = join(racine, "drizzle");

const url = process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL absent de l'environnement.");
  process.exit(1);
}

/** Masque le mot de passe : cette sortie est destinée à être recopiée. */
const masquee = url.replace(/:\/\/([^:@/]+):[^@]*@/, "://$1:***@");

const veutSsl = /sslmode=(require|verify|prefer)/.test(url);
const urlPropre = url.replace(/[?&]sslmode=[^&]*/g, (m) =>
  m.startsWith("?") ? "?" : "",
);

// ---------------------------------------------------------------------------
// Garde-fou : ce script préfère DATABASE_URL_MIGRATION à DATABASE_URL, et le
// `.env` de développement y met l'adresse du serveur. Lancé sans réfléchir
// depuis un poste de travail, il vise donc la production — alors que tout le
// reste de l'outillage (`npm run dev`, les tests) reste sur la base locale.
//
// Viser une base distante doit être un acte délibéré, jamais un défaut. Même
// principe que `tests/integration-setup.ts`, appliqué à l'outil qui écrit.
// ---------------------------------------------------------------------------
const HOTES_LOCAUX = ["localhost", "127.0.0.1", "::1", "db"];
let hote = "";
try {
  hote = new URL(urlPropre).hostname;
} catch {
  hote = "";
}
const estLocal = HOTES_LOCAUX.includes(hote);
const confirme =
  process.argv.includes("--distant") ||
  process.env.MIGRATION_HOTE_DISTANT === hote;

if (!estLocal && !confirme) {
  console.error(`\n⛔ Cible distante refusée : « ${hote} »`);
  console.error(`   ${masquee}`);
  console.error(
    "\n   Ce n'est pas une base locale. Une migration y est irréversible.\n" +
      "   Si c'est bien l'intention, confirmez la cible explicitement :\n" +
      `\n     node scripts/migrate.mjs --distant\n` +
      `     MIGRATION_HOTE_DISTANT=${hote} npm run db:migrate:node\n` +
      "\n   Pour migrer la base locale, surchargez la variable :\n" +
      '     DATABASE_URL_MIGRATION="postgresql://postgres:postgres@127.0.0.1:5432/app_db" node scripts/migrate.mjs\n',
  );
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: urlPropre,
  ssl: veutSsl ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 15_000,
  max: 1,
});

// ---------------------------------------------------------------------------
// Lecture des migrations (identique à readMigrationFiles de drizzle-orm)
// ---------------------------------------------------------------------------
function lireMigrations() {
  const journalPath = join(dossierMigrations, "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    throw new Error("Fichier meta/_journal.json introuvable.");
  }
  const journal = JSON.parse(readFileSync(journalPath, "utf-8"));
  return journal.entries.map((entry) => {
    const fichier = join(dossierMigrations, `${entry.tag}.sql`);
    const sql = readFileSync(fichier, "utf-8");
    return {
      sql: sql.split("--> statement-breakpoint"),
      folderMillis: entry.when,
      hash: createHash("sha256").update(sql).digest("hex"),
      tag: entry.tag,
    };
  });
}

/**
 * Reprend le suivi laissé par le migrateur standard dans `drizzle`.
 *
 * Une base déjà migrée par drizzle-orm a son historique dans
 * `drizzle.__drizzle_migrations`. Sans cette reprise, le nouveau suivi part
 * vide et le script conclut qu'aucune migration n'a jamais été appliquée :
 * il rejoue alors la totalité du dossier sur une base qui a déjà toutes ses
 * tables. La transaction annule les dégâts, mais l'échec est incompréhensible
 * — et il tombe en pleine mise en production.
 *
 * L'absence du schéma `drizzle` est le cas normal sur l'hébergement contraint,
 * et un refus de lecture se traite comme une absence : dans les deux cas il
 * n'y a rien à reprendre.
 */
async function reprendreSuiviHerite() {
  const heritees = await pool
    .query(`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)
    .then((r) => r.rows[0].n)
    .catch(() => 0);
  if (heritees === 0) return 0;

  await pool.query(
    `INSERT INTO public.__drizzle_migrations (hash, created_at)
       SELECT hash, created_at FROM drizzle.__drizzle_migrations`,
  );
  return heritees;
}

// ---------------------------------------------------------------------------
// Application des migrations (logique de pg-core/dialect.js, sans CREATE SCHEMA)
// ---------------------------------------------------------------------------
async function appliquerMigrations() {
  // Table de suivi dans public (pas besoin de CREATE SCHEMA)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  // Uniquement sur un suivi vide : une fois repris, il fait autorité, et
  // réimporter écraserait l'avancement acquis depuis.
  const { rows: compte } = await pool.query(
    `SELECT count(*)::int AS n FROM public.__drizzle_migrations`,
  );
  if (compte[0].n === 0) {
    const reprises = await reprendreSuiviHerite();
    if (reprises > 0) {
      console.log(`   ↻ suivi repris depuis drizzle.__drizzle_migrations (${reprises} migration(s))`);
    }
  }

  const { rows: dbMigrations } = await pool.query(
    `SELECT id, hash, created_at FROM public.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`,
  );
  const derniere = dbMigrations[0];

  const migrations = lireMigrations();
  let appliquees = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const migration of migrations) {
      if (!derniere || Number(derniere.created_at) < migration.folderMillis) {
        console.log(`   ▸ ${migration.tag}`);
        for (const stmt of migration.sql) {
          const trimmed = stmt.trim();
          if (trimmed) await client.query(trimmed);
        }
        await client.query(
          `INSERT INTO public.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
          [migration.hash, migration.folderMillis],
        );
        appliquees++;
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return appliquees;
}

// ---------------------------------------------------------------------------
// Diagnostic avant / après
// ---------------------------------------------------------------------------
async function etat(titre) {
  console.log(`\n── ${titre} ${"─".repeat(Math.max(0, 50 - titre.length))}`);

  const v = await pool
    .query(`SHOW server_version`)
    .then((r) => r.rows[0].server_version)
    .catch(() => "?");
  console.log(`   PostgreSQL            : ${v}`);

  const appliquees = await pool
    .query(`SELECT count(*)::int AS n FROM public.__drizzle_migrations`)
    .then((r) => r.rows[0].n)
    .catch(() => 0);
  console.log(`   migrations appliquées : ${appliquees}`);

  const tables = await pool.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  console.log(`   tables dans public    : ${tables.rows[0].n}`);

  const regimes = await pool
    .query(
      `SELECT regime_fiscal::text AS r, count(*)::int AS n
         FROM contribuables GROUP BY 1 ORDER BY 1`,
    )
    .then((r) => r.rows)
    .catch(() => null);
  if (regimes) {
    const total = regimes.reduce((s, x) => s + x.n, 0);
    console.log(
      `   contribuables         : ${total} (${regimes.map((x) => `${x.r}=${x.n}`).join(", ")})`,
    );
  }

  const facturation = await pool
    .query(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('factures','facture_lignes','reglements')`,
    )
    .then((r) => r.rows[0].n);
  console.log(`   tables de facturation : ${facturation}/3`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`🔌 ${masquee}`);
  console.log(`🎯 cible : ${hote} ${estLocal ? "(locale)" : "⚠️  DISTANTE — confirmée"}`);
  console.log(`📁 migrations : ${dossierMigrations}`);

  await etat("AVANT");

  console.log("\n⏳ Application des migrations en attente…");
  const n = await appliquerMigrations();
  console.log(`✅ ${n} migration(s) appliquée(s).`);

  await etat("APRÈS");
  console.log("");
}

main()
  .catch((err) => {
    console.error("\n❌ Échec de la migration :");
    console.error(`   ${err?.message ?? err}`);

    let cause = err?.cause;
    for (let i = 0; i < 5 && cause; i++) {
      console.error(`\n   ↳ cause : ${cause.message ?? cause}`);
      if (cause.code) console.error(`     code SQL : ${cause.code}`);
      if (cause.detail) console.error(`     détail   : ${cause.detail}`);
      if (cause.hint) console.error(`     piste    : ${cause.hint}`);
      cause = cause.cause;
    }
    if (err?.code) console.error(`   code SQL : ${err.code}`);
    if (err?.detail) console.error(`   détail   : ${err.detail}`);
    console.error(
      "\n   Aucune migration partielle : chacune s'exécute dans une transaction,\n" +
        "   annulée en bloc en cas d'erreur.",
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
