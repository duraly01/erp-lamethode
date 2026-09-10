// ---------------------------------------------------------------------------
// Alignement du journal de migrations sur une base déjà en production.
//
//   npm run db:baseline
//
// Contexte : le schéma de production a été créé sans passer par les migrations
// (vraisemblablement `drizzle-kit push` lors de la mise en ligne initiale). La
// table `drizzle.__drizzle_migrations` est donc vide, et le migrateur veut
// rejouer 0000 sur une base qui contient déjà tout — d'où l'erreur
// « type declaration_type already exists ».
//
// Ce script n'exécute AUCUN DDL. Il se contente de constater ce qui est déjà
// en place, puis d'inscrire les migrations correspondantes au journal pour que
// le migrateur reprenne au bon endroit. Idempotent : relancé, il ne fait rien.
// ---------------------------------------------------------------------------

import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const dossier = join(racine, "drizzle");

/**
 * Migrations susceptibles d'être déjà en base, avec la preuve à chercher.
 * On ne marque une migration comme appliquée que si sa trace est constatée.
 */
const CANDIDATES = [
  {
    tag: "0000_wandering_radioactive_man",
    description: "schéma initial",
    // Le type d'énumération créé par 0000 : c'est lui qui faisait échouer le rejeu.
    preuve: `select 1 from pg_type where typname = 'declaration_type'`,
  },
  {
    tag: "0001_married_red_wolf",
    description: "colonne users.telephone",
    preuve: `select 1 from information_schema.columns
              where table_name = 'users' and column_name = 'telephone'`,
  },
];

const url = process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL absent de l'environnement.");
  process.exit(1);
}

const veutSsl = /sslmode=(require|verify|prefer)/.test(url);
const pool = new pg.Pool({
  connectionString: url.replace(/[?&]sslmode=[^&]*/g, (m) =>
    m.startsWith("?") ? "?" : "",
  ),
  ssl: veutSsl ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 15_000,
  max: 1,
});

async function main() {
  const journal = JSON.parse(
    readFileSync(join(dossier, "meta", "_journal.json"), "utf8"),
  );

  // Table de suivi, au format attendu par le migrateur de drizzle-orm.
  await pool.query(`create schema if not exists "drizzle"`);
  await pool.query(
    `create table if not exists "drizzle"."__drizzle_migrations" (
       id serial primary key,
       hash text not null,
       created_at bigint
     )`,
  );

  const { rows: deja } = await pool.query(
    `select count(*)::int as n from "drizzle"."__drizzle_migrations"`,
  );
  if (deja[0].n > 0) {
    console.log(
      `✔️  Le journal contient déjà ${deja[0].n} entrée(s) : rien à aligner.`,
    );
    console.log("   Enchaînez avec `npm run db:migrate:node`.");
    return;
  }

  console.log("📋 Journal vide — vérification de ce qui est déjà en base :\n");

  const aInscrire = [];
  for (const c of CANDIDATES) {
    const entree = journal.entries.find((e) => e.tag === c.tag);
    if (!entree) {
      console.log(`   ? ${c.tag} — absent du journal de fichiers, ignoré`);
      continue;
    }
    const { rowCount } = await pool.query(c.preuve);
    if (rowCount > 0) {
      console.log(`   ✅ ${c.tag} — ${c.description} : déjà en base`);
      aInscrire.push(entree);
    } else {
      console.log(
        `   ⬜ ${c.tag} — ${c.description} : absent, sera appliqué normalement`,
      );
      // Dès qu'une migration manque, les suivantes doivent être jouées :
      // on arrête l'alignement ici pour ne pas créer de trou.
      break;
    }
  }

  if (aInscrire.length === 0) {
    console.log(
      "\n   Aucune migration à inscrire : la base est vierge, `db:migrate:node` peut tout appliquer.",
    );
    return;
  }

  for (const e of aInscrire) {
    // Le migrateur de drizzle-orm calcule le hash sur le contenu intégral du
    // fichier SQL ; on reproduit exactement ce calcul.
    const sql = readFileSync(join(dossier, `${e.tag}.sql`), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    await pool.query(
      `insert into "drizzle"."__drizzle_migrations" (hash, created_at) values ($1, $2)`,
      [hash, e.when],
    );
  }

  console.log(
    `\n✅ ${aInscrire.length} migration(s) inscrite(s) au journal, sans aucune modification du schéma.`,
  );
  console.log("👉 Lancez maintenant `npm run db:migrate:node`.");
}

main()
  .catch((err) => {
    console.error(`\n❌ Échec : ${err?.message ?? err}`);
    if (err?.code) console.error(`   code SQL : ${err.code}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
