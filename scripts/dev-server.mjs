// ---------------------------------------------------------------------------
// Lancement du serveur de développement.
//
//   npm run dev:safe        (ou via .claude/launch.json)
//
// Pourquoi ce script plutôt qu'un `next dev` direct :
//
// 1. Node et npm sont installés dans « C:\Program Files\nodejs ». Les
//    lanceurs qui composent une ligne de commande sans guillemets échouent sur
//    l'espace du chemin (« 'C:\Program' n'est pas reconnu »). En passant par
//    `process.execPath` et un `spawn` sans shell, le chemin est transmis tel
//    quel, quels que soient les espaces qu'il contient.
//
// 2. Le `.env` du projet renseigne aussi l'adresse de la PRODUCTION. Démarrer
//    un serveur de développement branché sur la base de production est une
//    erreur silencieuse et coûteuse : le script refuse de le faire.
//
// 3. Une base absente donne sinon une cascade d'erreurs illisibles au premier
//    écran. Mieux vaut le dire tout de suite, avec la commande qui répare.
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Le script se replace lui-même à la racine du projet. Il peut ainsi être
// appelé depuis n'importe où — y compris par un chemin court 8.3, seul moyen
// pour certains lanceurs Windows de désigner un dossier dont le nom contient
// un espace ou un accent.
//
// `realpathSync.native` réétend ce chemin court en son nom complet. C'est
// indispensable : le surveillant de fichiers de Next compare les noms longs
// que lui rend Windows au répertoire qu'il surveille, et si celui-ci est resté
// sous sa forme courte, libuv s'arrête sur une assertion
// (« Assertion failed: !_wcsnicmp(filename, dir, dirlen) ») quelques secondes
// après le démarrage, sans message exploitable.
const RACINE = realpathSync.native(
  resolve(dirname(fileURLToPath(import.meta.url)), ".."),
);
process.chdir(RACINE);

// Chargé après le chdir, pour que le .env du projet soit bien celui lu.
await import("dotenv/config");
const pg = (await import("pg")).default;

const HOTES_LOCAUX = ["localhost", "127.0.0.1", "::1", "db"];
const NEXT_BIN = join(RACINE, "node_modules", "next", "dist", "bin", "next");

function hoteDe(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

async function verifierBase() {
  const url = process.env.DATABASE_URL ?? "";
  const hote = hoteDe(url);

  if (!hote) {
    console.error("❌ DATABASE_URL est absent ou illisible dans .env.");
    process.exit(1);
  }

  if (!HOTES_LOCAUX.includes(hote)) {
    console.error(
      `❌ Refus de démarrer : DATABASE_URL vise « ${hote} », qui n'est pas une base locale.`,
    );
    console.error(
      "   Un serveur de développement ne doit pas écrire dans la base de production.",
    );
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 4000,
  });

  try {
    await client.connect();
    const { rows } = await client.query(
      "select current_database() as base, (select count(*)::int from information_schema.tables where table_schema='public') as tables",
    );
    await client.end();
    console.log(
      `Base : ${rows[0].base} sur ${hote} — ${rows[0].tables} tables.`,
    );
    if (rows[0].tables === 0) {
      console.log(
        "   Base vide : lancez `npm run db:migrate:local` puis `npm run db:seed`.",
      );
    }
  } catch (e) {
    await client.end().catch(() => {});
    console.error(`❌ Base injoignable sur ${hote} : ${e.message}`);
    console.error("   Démarrez-la avec :  docker compose up -d --wait db");
    process.exit(1);
  }
}

async function main() {
  if (!existsSync(NEXT_BIN)) {
    console.error(
      `❌ ${NEXT_BIN} introuvable. Lancez \`npm install\` à la racine du projet.`,
    );
    process.exit(1);
  }

  await verifierBase();

  const args = [NEXT_BIN, "dev", ...process.argv.slice(2)];
  console.log("Démarrage de Next.js…\n");

  // `spawn` sans shell : chaque argument est transmis tel quel, sans que les
  // espaces du chemin de Node aient à être échappés.
  const serveur = spawn(process.execPath, args, { stdio: "inherit" });

  // Ctrl+C et arrêt du lanceur doivent arrêter Next, pas laisser un orphelin
  // qui garderait le port 3000 occupé.
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => serveur.kill(signal));
  }

  serveur.on("exit", (code, signal) => {
    process.exit(signal ? 1 : (code ?? 0));
  });
}

main();
