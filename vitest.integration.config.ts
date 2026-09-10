import { defineConfig } from "vitest/config";
import path from "node:path";

// ---------------------------------------------------------------------------
// Tests d'intégration de l'API : handlers réels, base réelle.
//
// Séparés de `vitest.config.ts` parce qu'ils exigent une base PostgreSQL en
// service. La suite unitaire doit rester exécutable partout, y compris en
// intégration continue sans base.
//
//   docker compose up -d --wait db
//   npm run test:api
// ---------------------------------------------------------------------------

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      // « server-only » est un module marqueur que Next résout à la
      // compilation ; hors de Next il faut le neutraliser (même procédé que
      // tsconfig.scripts.json).
      "server-only": path.resolve(
        process.cwd(),
        "node_modules/next/dist/compiled/server-only/empty.js",
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.integration.test.ts", "tests/**/*.integration.test.ts"],
    setupFiles: ["tests/integration-setup.ts"],
    // Les fichiers partagent une base : les exécuter en parallèle les ferait
    // se marcher dessus.
    fileParallelism: false,
    testTimeout: 30000,
  },
});
