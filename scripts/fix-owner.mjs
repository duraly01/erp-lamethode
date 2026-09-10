// ---------------------------------------------------------------------------
// Rend les types énumérés au rôle propriétaire de la base.
//
//   npm run db:fix-owner
//
// Contexte : les tables appartiennent à `lamethode_erp`, dont l'utilisateur
// applicatif est membre, mais les types énumérés appartiennent à `lamethode`.
// Les migrations qui font évoluer une énumération sont donc refusées
// (« must be owner of type … »).
//
// Ce script tente `ALTER TYPE ... OWNER TO <propriétaire de la base>` pour
// chaque type concerné, et rapporte type par type. Il ne modifie aucune donnée
// ni aucune structure : seule la propriété change. S'il échoue, c'est que
// l'opération demande l'intervention de l'hébergeur — voir le message final.
// ---------------------------------------------------------------------------

import "dotenv/config";
import pg from "pg";

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
  // Cible : le rôle qui possède déjà la base et les tables.
  const { rows: base } = await pool.query(
    `select pg_get_userbyid(datdba) as proprietaire
       from pg_database where datname = current_database()`,
  );
  const cible = base[0].proprietaire;
  console.log(`🎯 Propriétaire visé pour les types : « ${cible} »\n`);

  const { rows: types } = await pool.query(
    `select t.typname as nom, pg_get_userbyid(t.typowner) as proprietaire
       from pg_type t
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typtype = 'e'
      order by t.typname`,
  );

  let corriges = 0;
  let refuses = 0;
  const echecs = [];

  for (const t of types) {
    if (t.proprietaire === cible) {
      console.log(`   ✔️  ${t.nom.padEnd(20)} déjà à « ${cible} »`);
      continue;
    }
    try {
      // Chaque type dans sa propre transaction implicite : un refus sur l'un
      // n'empêche pas les autres d'aboutir.
      await pool.query(
        `alter type "public"."${t.nom}" owner to "${cible}"`,
      );
      console.log(`   ✅ ${t.nom.padEnd(20)} ${t.proprietaire} → ${cible}`);
      corriges++;
    } catch (err) {
      console.log(`   ❌ ${t.nom.padEnd(20)} refusé : ${err.message}`);
      echecs.push(t.nom);
      refuses++;
    }
  }

  console.log(
    `\n── BILAN ──────────────────────────────────────────\n   ${corriges} type(s) corrigé(s), ${refuses} refusé(s).`,
  );

  if (refuses === 0) {
    console.log("\n👉 Enchaînez avec `npm run db:migrate:node`.");
  } else {
    console.log(
      "\n   L'opération demande le rôle propriétaire actuel ou un superutilisateur.\n" +
        "   Demandez à votre hébergeur d'exécuter, en tant que superutilisateur :\n",
    );
    for (const nom of echecs) {
      console.log(`     ALTER TYPE public.${nom} OWNER TO ${cible};`);
    }
    console.log("");
  }
}

main()
  .catch((err) => {
    console.error(`\n❌ Échec : ${err?.message ?? err}`);
    if (err?.code) console.error(`   code SQL : ${err.code}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
