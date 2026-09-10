import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Les tests d'intégration exigent une base PostgreSQL en service : ils ont
    // leur propre configuration (`npm run test:api`), pour que cette suite-ci
    // reste exécutable partout, y compris en CI sans base.
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
  },
});
