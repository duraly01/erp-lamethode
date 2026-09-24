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
