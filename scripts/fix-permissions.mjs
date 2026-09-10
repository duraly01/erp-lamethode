// ---------------------------------------------------------------------------
// Rétablit les permissions Unix après extraction d'une archive ZIP.
//
//   npm run fix:perms
//
// Les archives produites sous Windows ne transportent pas les bits de
// permission Unix. À l'extraction, certains dossiers se retrouvent sans le bit
// d'exécution, qui est ce qui autorise à *parcourir* un répertoire — d'où un
// démarrage en « EACCES: permission denied, scandir '.next/static/chunks' ».
//
// Le script remet 755 sur les dossiers et 644 sur les fichiers. Il corrige le
// dossier avant de le lire, afin de pouvoir descendre dans ceux qui sont
// justement devenus inaccessibles.
// ---------------------------------------------------------------------------

import { chmodSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");

const DOSSIERS = [".next", "src", "scripts", "drizzle", "docs", "public"];
const MODE_DOSSIER = 0o755;
const MODE_FICHIER = 0o644;

let dossiers = 0;
let fichiers = 0;
let erreurs = 0;

function corrige(chemin) {
  let infos;
  try {
    infos = statSync(chemin);
  } catch {
    erreurs++;
    return;
  }

  if (infos.isDirectory()) {
    // On corrige AVANT de lire : sans le bit d'exécution, readdir échouerait.
    try {
      chmodSync(chemin, MODE_DOSSIER);
      dossiers++;
    } catch {
      erreurs++;
      return;
    }
    let entrees;
    try {
      entrees = readdirSync(chemin);
    } catch {
      erreurs++;
      return;
    }
    for (const e of entrees) corrige(join(chemin, e));
  } else {
    try {
      chmodSync(chemin, MODE_FICHIER);
      fichiers++;
    } catch {
      erreurs++;
    }
  }
}

console.log(`📂 ${racine}\n`);
for (const d of DOSSIERS) {
  const chemin = join(racine, d);
  if (!existsSync(chemin)) {
    console.log(`   ⬜ ${d} — absent, ignoré`);
    continue;
  }
  const avantD = dossiers;
  const avantF = fichiers;
  corrige(chemin);
  console.log(
    `   ✅ ${d.padEnd(10)} ${dossiers - avantD} dossier(s), ${fichiers - avantF} fichier(s)`,
  );
}

// server.js doit rester lisible : il est le point d'entrée de l'application.
for (const f of ["server.js", "package.json", "next.config.ts"]) {
  const chemin = join(racine, f);
  if (existsSync(chemin)) {
    try {
      chmodSync(chemin, MODE_FICHIER);
      fichiers++;
    } catch {
      erreurs++;
    }
  }
}

console.log(
  `\n── BILAN ──────────────────────────────────────────\n` +
    `   ${dossiers} dossier(s) en 755, ${fichiers} fichier(s) en 644` +
    (erreurs ? `, ${erreurs} inaccessible(s)` : ""),
);
console.log(
  erreurs
    ? "\n   ⚠️  Certains éléments n'ont pas pu être corrigés — signalez-le.\n"
    : "\n👉 Redémarrez l'application depuis Setup Node.js App.\n",
);
