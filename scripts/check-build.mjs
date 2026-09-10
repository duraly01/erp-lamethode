// ---------------------------------------------------------------------------
// L'application peut-elle démarrer ?
//
//   npm run check:build
//
// À lancer quand le site renvoie 503. Vérifie que le build compilé est bien en
// place, que les dépendances nécessaires au démarrage sont installées et que
// l'environnement est complet. N'écrit rien, ne se connecte à rien.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
console.log(`📂 Racine applicative : ${racine}\n`);

let bloquant = 0;
const ok = (m) => console.log(`   ✅ ${m}`);
const ko = (m) => {
  console.log(`   ❌ ${m}`);
  bloquant++;
};

// --- Le build compilé -------------------------------------------------------
console.log("── BUILD ──────────────────────────────────────────");
const next = join(racine, ".next");

if (!existsSync(next)) {
  ko("`.next` est absent — l'application ne peut pas démarrer.");
  // Cause la plus fréquente : l'archive a été extraite sans renommer.
  if (existsSync(join(racine, "dotnext"))) {
    console.log(
      "\n   ⚠️  Un dossier « dotnext » est présent : il doit être RENOMMÉ en « .next ».",
    );
  }
  const suspects = readdirSync(racine).filter((f) =>
    /next/i.test(f) && f !== "next.config.ts" && f !== "next-env.d.ts",
  );
  if (suspects.length) {
    console.log(`   Dossiers ressemblants trouvés : ${suspects.join(", ")}`);
  }
} else {
  ok("`.next` présent");
  for (const attendu of ["BUILD_ID", "server", "static"]) {
    const p = join(next, attendu);
    if (existsSync(p)) {
      ok(`.next/${attendu}`);
    } else {
      ko(`.next/${attendu} manquant — build incomplet`);
    }
  }
  const buildId = join(next, "BUILD_ID");
  if (existsSync(buildId)) {
    console.log(
      `      identifiant de build : ${readFileSync(buildId, "utf8").trim()}`,
    );
    console.log(
      `      compilé le           : ${statSync(buildId).mtime.toLocaleString("fr-FR")}`,
    );
  }
}

// --- Les dépendances --------------------------------------------------------
console.log("\n── DÉPENDANCES ────────────────────────────────────");
const modules = join(racine, "node_modules");
if (!existsSync(modules)) {
  ko("`node_modules` absent — lancez « Run NPM Install ».");
} else {
  ok("`node_modules` présent");
  for (const paquet of ["next", "react", "drizzle-orm", "pg", "next-auth", "pdfkit"]) {
    if (existsSync(join(modules, paquet))) ok(paquet);
    else ko(`${paquet} manquant — relancez « Run NPM Install »`);
  }
}

// --- L'environnement --------------------------------------------------------
console.log("\n── ENVIRONNEMENT ──────────────────────────────────");
console.log(`   Node : ${process.version}`);

const env = join(racine, ".env");
if (!existsSync(env)) {
  ko("`.env` absent");
} else {
  ok("`.env` présent");
  const contenu = readFileSync(env, "utf8");
  // On ne montre jamais les valeurs : uniquement la présence des clés.
  for (const cle of ["DATABASE_URL", "AUTH_SECRET", "AUTH_URL"]) {
    const trouve = new RegExp(`^\\s*${cle}\\s*=\\s*\\S`, "m").test(contenu);
    trouve ? ok(`${cle} renseigné`) : ko(`${cle} absent ou vide`);
  }
}

const startup = join(racine, "server.js");
existsSync(startup) ? ok("server.js présent") : ko("server.js absent");

// --- Verdict ----------------------------------------------------------------
console.log("\n── VERDICT ────────────────────────────────────────");
if (bloquant === 0) {
  console.log("   Rien ne manque : l'échec vient d'ailleurs.");
  console.log("   Consultez le journal d'erreurs de l'application (stderr.log).");
} else {
  console.log(`   ${bloquant} problème(s) bloquant(s) — voir les ❌ ci-dessus.`);
}
console.log("");
