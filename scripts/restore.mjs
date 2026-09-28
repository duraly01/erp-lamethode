// ---------------------------------------------------------------------------
// Restauration d'une sauvegarde SQL, exécutable sur un hébergement contraint.
//
//   node scripts/restore.mjs sauvegarde.sql
//
// Pourquoi ce script plutôt que l'import du panneau : sur ce serveur, la seule
// voie d'exécution dont on soit certain est « Exécuter les commandes Node.js »
// — ni SSH, ni terminal, et l'import de base de données n'est pas offert par
// toutes les versions de Plesk. Le script ne dépend que du pilote `pg`, déjà
// installé pour l'application.
//
// Le fichier attendu est du SQL simple, avec des INSERT et non des COPY : le
// pilote ne sait pas alimenter un COPY FROM stdin. Produire un tel fichier :
//
//   pg_dump --inserts --no-owner --no-privileges -f sauvegarde.sql <base>
//
// Tout passe dans une transaction unique. Une restauration à moitié faite
// serait pire que pas de restauration du tout : on ne saurait pas où elle
// s'est arrêtée.
// ---------------------------------------------------------------------------

import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import pg from "pg";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const force = process.argv.includes("--force");

const fichier = args[0];
if (!fichier) {
  console.error("❌ Usage : node scripts/restore.mjs <sauvegarde.sql> [--force]");
  process.exit(1);
}
const chemin = isAbsolute(fichier) ? fichier : join(process.cwd(), fichier);
if (!existsSync(chemin)) {
  console.error(`❌ Fichier introuvable : ${chemin}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL_RESTORE ?? process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL absent de l'environnement.");
  process.exit(1);
}

const masquee = url.replace(/:\/\/([^:@/]+):[^@]*@/, "://$1:***@");
const veutSsl = /sslmode=(require|verify|prefer)/.test(url);
const urlPropre = url.replace(/[?&]sslmode=[^&]*/g, (m) => (m.startsWith("?") ? "?" : ""));

// Même garde-fou que le migrateur : viser une base distante doit être un acte
// délibéré. Une restauration écrase, et elle écrase tout.
const HOTES_LOCAUX = ["localhost", "127.0.0.1", "::1", "db"];
let hote = "";
try {
  hote = new URL(urlPropre).hostname;
} catch {
  hote = "";
}
const estLocal = HOTES_LOCAUX.includes(hote);
if (!estLocal && !process.argv.includes("--distant") && process.env.RESTORE_HOTE_DISTANT !== hote) {
  console.error(`\n⛔ Cible distante refusée : « ${hote} »`);
  console.error(`   ${masquee}`);
  console.error(
    "\n   Une restauration écrase la base visée. Si c'est bien l'intention :\n" +
      `     node scripts/restore.mjs ${fichier} --distant\n`,
  );
  process.exit(1);
}

// `sslmode` est retiré de l'URL et la vérification du certificat désactivée,
// comme dans `migrate.mjs` : les versions récentes du pilote assimilent
// `sslmode=require` à `verify-full`, qui échoue sur le certificat auto-signé
// de l'hébergeur. Sans conséquence ici — la restauration vise la base locale
// du serveur (`localhost`), où la liaison ne sort pas de la machine. Viser une
// base distante exige de toute façon `--distant`, ci-dessus.
const pool = new pg.Pool({
  connectionString: urlPropre,
  ssl: veutSsl ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 15_000,
  max: 1,
});

async function main() {
  console.log(`🔌 ${masquee}`);
  console.log(`🎯 cible : ${hote} ${estLocal ? "(locale)" : "⚠️  DISTANTE — confirmée"}`);
  console.log(`📄 ${chemin}`);

  const sql = readFileSync(chemin, "utf-8");
  const inserts = (sql.match(/^INSERT INTO/gm) ?? []).length;
  const tables = (sql.match(/^CREATE TABLE/gm) ?? []).length;
  console.log(`   ${tables} table(s), ${inserts} insertion(s)\n`);

  if (/^COPY .+ FROM stdin;/m.test(sql)) {
    throw new Error(
      "Ce fichier contient des COPY FROM stdin, que le pilote ne sait pas exécuter.\n" +
        "   Régénérez-le avec `pg_dump --inserts`.",
    );
  }

  // Une base déjà peuplée ne se réécrit pas par inadvertance.
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  const existantes = rows[0].n;
  console.log(`   tables déjà présentes : ${existantes}`);
  if (existantes > 0 && !force) {
    throw new Error(
      `La base contient déjà ${existantes} table(s). Restaurer par-dessus écraserait ce qui s'y trouve.\n` +
        "   Videz-la, ou relancez avec --force si c'est bien l'intention.",
    );
  }

  console.log("\n⏳ Restauration…");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log("✅ Restauration terminée.\n");

  // Le dump pose `search_path = ''` pour la session, et le pool réutilise la
  // même connexion : sans schéma explicite, les contrôles ci-dessous
  // échoueraient et laisseraient croire à une restauration ratée.
  const compte = async (requete, defaut = "—") =>
    pool
      .query(requete)
      .then((r) => r.rows[0].n)
      .catch(() => defaut);

  console.log("── CONTRÔLE ───────────────────────────────────────");
  console.log(`   contribuables         : ${await compte("SELECT count(*)::int AS n FROM public.contribuables")}`);
  console.log(`   utilisateurs          : ${await compte("SELECT count(*)::int AS n FROM public.users")}`);
  console.log(`   déclarations          : ${await compte("SELECT count(*)::int AS n FROM public.declarations")}`);
  console.log(`   factures              : ${await compte("SELECT count(*)::int AS n FROM public.factures")}`);
  console.log(
    `   suivi des migrations  : ${await compte("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations", 0)}`,
  );
  console.log(
    `   tables dans public    : ${await compte("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'")}`,
  );
  console.log(
    "\n   Étape suivante : npm run db:migrate:node — qui reprendra le suivi\n" +
      "   hérité et appliquera les migrations manquantes.\n",
  );
}

main()
  .catch((err) => {
    console.error("\n❌ Échec de la restauration :");
    console.error(`   ${err?.message ?? err}`);
    if (err?.code) console.error(`   code SQL : ${err.code}`);
    if (err?.detail) console.error(`   détail   : ${err.detail}`);
    if (err?.hint) console.error(`   piste    : ${err.hint}`);
    console.error("\n   Rien n'a été écrit : la restauration est une transaction unique.");
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
