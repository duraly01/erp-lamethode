import { defineConfig } from "drizzle-kit";
import "dotenv/config";

/**
 * Cible des migrations.
 *
 * `DATABASE_URL_MIGRATION` a la priorité et n'est lue QUE par drizzle-kit :
 * l'application (`src/db/index.ts`) continue d'utiliser `DATABASE_URL`. On peut
 * donc pointer les migrations sur la base de production sans qu'un
 * `npm run dev` lancé distraitement n'y écrive.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL_MIGRATION ??
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});
