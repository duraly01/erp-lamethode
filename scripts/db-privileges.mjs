// ---------------------------------------------------------------------------
// Qui possède quoi dans la base ?
//
//   npm run db:privileges
//
// La migration a échoué sur « must be owner of type declaration_type » : le
// rôle applicatif n'est pas propriétaire des objets. Ce script établit l'état
// exact des propriétés et des appartenances de rôles, pour choisir la parade.
// Lecture seule.
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

const tableau = (lignes, colonnes) => {
  const l = colonnes.map((c) =>
    Math.max(c.length, ...lignes.map((r) => String(r[c] ?? "").length)),
  );
  console.log("   " + colonnes.map((c, i) => c.padEnd(l[i])).join("  "));
  console.log("   " + l.map((n) => "─".repeat(n)).join("  "));
  for (const r of lignes) {
    console.log(
      "   " + colonnes.map((c, i) => String(r[c] ?? "").padEnd(l[i])).join("  "),
    );
  }
};

async function main() {
  const { rows: qui } = await pool.query(
    `select current_user as utilisateur,
            current_database() as base,
            (select rolsuper from pg_roles where rolname = current_user) as superutilisateur`,
  );
  console.log(`\n👤 Connecté en tant que « ${qui[0].utilisateur} »`);
  console.log(`   superutilisateur : ${qui[0].superutilisateur ? "oui" : "non"}`);

  const { rows: proprioBase } = await pool.query(
    `select pg_get_userbyid(datdba) as proprietaire from pg_database where datname = current_database()`,
  );
  console.log(`   propriétaire de la base : ${proprioBase[0].proprietaire}`);

  // --- Rôles dont l'utilisateur est membre --------------------------------
  const { rows: membre } = await pool.query(
    `select r.rolname as role
       from pg_auth_members m
       join pg_roles r on r.oid = m.roleid
       join pg_roles u on u.oid = m.member
      where u.rolname = current_user`,
  );
  console.log(
    `\n🎭 Membre des rôles : ${membre.length ? membre.map((r) => r.role).join(", ") : "(aucun)"}`,
  );

  // --- Propriétaires des tables -------------------------------------------
  const { rows: tables } = await pool.query(
    `select tablename as table, tableowner as proprietaire
       from pg_tables where schemaname = 'public' order by tablename`,
  );
  console.log("\n📋 Tables du schéma public :");
  tableau(tables, ["table", "proprietaire"]);

  // --- Propriétaires des types énumérés ------------------------------------
  const { rows: types } = await pool.query(
    `select t.typname as type, pg_get_userbyid(t.typowner) as proprietaire
       from pg_type t
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typtype = 'e'
      order by t.typname`,
  );
  console.log("\n🔤 Types énumérés du schéma public :");
  tableau(types, ["type", "proprietaire"]);

  // --- Verdict --------------------------------------------------------------
  const moi = qui[0].utilisateur;
  const rolesPossedes = new Set([moi, ...membre.map((r) => r.role)]);
  const typesEtrangers = types.filter((t) => !rolesPossedes.has(t.proprietaire));
  const tablesEtrangeres = tables.filter(
    (t) => !rolesPossedes.has(t.proprietaire),
  );

  console.log("\n── VERDICT ────────────────────────────────────────");
  if (qui[0].superutilisateur) {
    console.log("   Superutilisateur : toutes les migrations passeront.");
  } else if (typesEtrangers.length === 0 && tablesEtrangeres.length === 0) {
    console.log("   Tous les objets appartiennent au rôle courant (ou à un rôle");
    console.log("   dont il est membre) : les migrations peuvent s'exécuter.");
  } else {
    console.log(
      `   ${tablesEtrangeres.length} table(s) et ${typesEtrangers.length} type(s) appartiennent à un autre rôle.`,
    );
    const proprios = [
      ...new Set(
        [...tablesEtrangeres, ...typesEtrangers].map((x) => x.proprietaire),
      ),
    ];
    console.log(`   Propriétaire(s) concerné(s) : ${proprios.join(", ")}`);
    console.log("\n   Deux issues possibles :");
    console.log(
      `   • se connecter avec le rôle « ${proprios[0]} » pour la migration ;`,
    );
    console.log(
      `   • ou, depuis ce rôle, exécuter : GRANT ${proprios[0]} TO ${moi};`,
    );
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error(`\n❌ Échec : ${err?.message ?? err}`);
    if (err?.code) console.error(`   code SQL : ${err.code}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
