// ---------------------------------------------------------------------------
// Migration des schémas, exécutable sur un hébergement contraint.
//
//   npm run db:migrate:node
//
// Pourquoi ce script plutôt que `drizzle-kit migrate` : drizzle-kit instancie
// un module WebAssembly pour lire `drizzle.config.ts`, ce que les limites LVE
// de CloudLinux refusent (« Cannot allocate Wasm memory »). Le migrateur de
// drizzle-orm fait le même travail en JavaScript pur, lit le même dossier
// `drizzle/` et tient à jour la même table `drizzle.__drizzle_migrations` :
// les deux outils restent interchangeables.
//
// Fichier .mjs volontairement : ni TypeScript ni tsx, donc aucun transpileur
// à charger au démarrage.
// ---------------------------------------------------------------------------

import "dotenv/config";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const dossierMigrations = join(racine, "drizzle");

const url = process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL absent de l'environnement.");
  process.exit(1);
}

/** Masque le mot de passe : cette sortie est destinée à être recopiée. */
const masquee = url.replace(/:\/\/([^:@/]+):[^@]*@/, "://$1:***@");

// `sslmode` est retiré de l'URL : les versions récentes du pilote l'assimilent
// à `verify-full`, ce qui échoue sur un certificat auto-signé.
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

/** Photographie de l'état de la base, avant et après. */
async function etat(titre) {
  console.log(`\n── ${titre} ${"─".repeat(Math.max(0, 50 - titre.length))}`);

  // La version conditionne ce que PostgreSQL accepte dans une transaction.
  const v = await pool
    .query(`show server_version`)
    .then((r) => r.rows[0].server_version)
    .catch(() => "?");
  console.log(`   PostgreSQL            : ${v}`);

  const appliquees = await pool
    .query(
      `select count(*)::int as n from drizzle.__drizzle_migrations`,
    )
    .then((r) => r.rows[0].n)
    .catch(() => 0);
  console.log(`   migrations appliquées : ${appliquees}`);

  const tables = await pool.query(
    `select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
  );
  console.log(`   tables dans public    : ${tables.rows[0].n}`);

  const regimes = await pool
    .query(
      `select regime_fiscal::text as r, count(*)::int as n
         from contribuables group by 1 order by 1`,
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
      `select count(*)::int as n from information_schema.tables
        where table_schema = 'public' and table_name in ('factures','facture_lignes','reglements')`,
    )
    .then((r) => r.rows[0].n);
  console.log(`   tables de facturation : ${facturation}/3`);
}

async function main() {
  console.log(`🔌 ${masquee}`);
  console.log(`📁 migrations : ${dossierMigrations}`);

  const db = drizzle(pool);

  await etat("AVANT");

  console.log("\n⏳ Application des migrations en attente…");
  await migrate(db, { migrationsFolder: dossierMigrations });
  console.log("✅ Migrations appliquées.");

  await etat("APRÈS");
  console.log("");
}

main()
  .catch((err) => {
    console.error("\n❌ Échec de la migration :");
    console.error(`   ${err?.message ?? err}`);

    // drizzle enveloppe l'erreur PostgreSQL : sans remonter la chaîne des
    // `cause`, on ne voit que la requête fautive, jamais le motif du refus.
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
