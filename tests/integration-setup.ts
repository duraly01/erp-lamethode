import "dotenv/config";

// ---------------------------------------------------------------------------
// Garde-fou des tests d'intégration.
//
// Ces tests créent et suppriment des données. Le `.env` du projet contient
// aussi l'adresse de la production : la confusion est trop facile pour reposer
// sur la vigilance.
// ---------------------------------------------------------------------------

const url = process.env.DATABASE_URL ?? "";
let hote = "";
try {
  hote = new URL(url).hostname;
} catch {
  hote = "";
}

if (!["localhost", "127.0.0.1", "::1", "db"].includes(hote)) {
  throw new Error(
    "Tests d'integration refuses : DATABASE_URL vise « " +
      (hote || "?") +
      " », qui n'est pas une base locale.",
  );
}
