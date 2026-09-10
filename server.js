// Point d'entrée pour l'hébergement cPanel (Node.js Selector / Passenger).
// Démarre le serveur Next.js en production. Passenger fournit le port via PORT.
require("dotenv").config(); // charge les variables du fichier .env
const { createServer } = require("http");
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
