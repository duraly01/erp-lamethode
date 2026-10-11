// Point d'entrée pour l'hébergement cPanel / Plesk (Passenger).
// Démarre le serveur Next.js en production. Passenger fournit le port via PORT.
require("dotenv").config(); // charge les variables du fichier .env
const fs = require("fs");
const path = require("path");
const { createServer } = require("http");

// ---------------------------------------------------------------------------
// Réparation des paquets externes de Turbopack.
//
// Next 16 (Turbopack) ne charge pas `pg` ou `pdfkit` par leur nom : il passe
// par un alias haché, `.next/node_modules/pg-587764f78a6c7a9c`, qu'il crée en
// lien symbolique vers `node_modules/pg`. Un build fait sous Windows écrit ce
// lien en chemin ABSOLU (`C:/Users/…/node_modules/pg`) : une fois l'archive
// extraite sur le serveur Linux, il ne mène nulle part, et toute page qui
// touche la base répond 500 (« Cannot find package 'pg-…' »). Constaté le
// 10 octobre 2026.
//
// Les noms hachés changent à chaque build. On les relit donc dans les traces
// du build (`*.nft.json`) — fiables même si l'archive a perdu les liens — et
// dans `.next/node_modules`, puis on recrée en relatif chaque lien cassé.
// Un lien qui fonctionne n'est pas touché ; un paquet absent de
// `node_modules` est signalé, pas inventé.
// ---------------------------------------------------------------------------
const ALIAS = /^(?:(@[^/]+)\/)?([^/@]+)-([0-9a-f]{16})$/;

function aliasDesTraces(racineNext, dossierAlias) {
  const noms = new Set();
  const parcourir = (dossier) => {
    let entrees;
    try {
      entrees = fs.readdirSync(dossier, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      const chemin = path.join(dossier, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else if (e.name.endsWith(".nft.json")) {
        let fichiers = [];
        try {
          fichiers = JSON.parse(fs.readFileSync(chemin, "utf8")).files || [];
        } catch {
          continue;
        }
        for (const f of fichiers) {
          const relatif = path.relative(dossierAlias, path.resolve(dossier, f));
          if (relatif.startsWith("..") || path.isAbsolute(relatif)) continue;
          const parties = relatif.split(path.sep);
          const nom = parties[0].startsWith("@") ? parties.slice(0, 2).join("/") : parties[0];
          if (ALIAS.test(nom)) noms.add(nom);
        }
      }
    }
  };
  parcourir(path.join(racineNext, "server"));
  return noms;
}

function aliasPresents(dossierAlias) {
  const noms = new Set();
  let entrees = [];
  try {
    entrees = fs.readdirSync(dossierAlias);
  } catch {
    return noms;
  }
  for (const e of entrees) {
    if (e.startsWith("@")) {
      try {
        for (const s of fs.readdirSync(path.join(dossierAlias, e))) noms.add(`${e}/${s}`);
      } catch {
        // dossier de portée illisible : ignoré
      }
    } else noms.add(e);
  }
  return noms;
}

function reparerAliasTurbopack(racine) {
  const racineNext = path.join(racine, ".next");
  const dossierAlias = path.join(racineNext, "node_modules");
  const noms = new Set([...aliasDesTraces(racineNext, dossierAlias), ...aliasPresents(dossierAlias)]);

  for (const nom of noms) {
    const m = ALIAS.exec(nom);
    if (!m) continue;
    const paquet = m[1] ? `${m[1]}/${m[2]}` : m[2];
    const lien = path.join(dossierAlias, nom);

    if (fs.existsSync(lien)) continue; // le lien mène quelque part : rien à faire

    const cible = path.join(racine, "node_modules", paquet);
    if (!fs.existsSync(cible)) {
      console.error(`⚠️  ${nom} : paquet « ${paquet} » absent de node_modules — lancer NPM install.`);
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(lien), { recursive: true });
      fs.rmSync(lien, { force: true }); // un lien cassé existe encore pour lstat
      fs.symlinkSync(path.relative(path.dirname(lien), cible), lien, "dir");
      console.log(`🔗 ${nom} → node_modules/${paquet} (lien recréé)`);
    } catch (err) {
      console.error(`⚠️  ${nom} : réparation impossible — ${err.message}`);
    }
  }
}

reparerAliasTurbopack(__dirname);

const next = require("next");

const port = process.env.PORT || 3000;
const app = next({ dev: false });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => handle(req, res)).listen(port, () => {
      console.log(`ERP LaMethode démarré sur le port ${port}`);
    });
  })
  .catch((err) => {
    console.error("Échec du démarrage de Next.js :", err);
    process.exit(1);
  });
