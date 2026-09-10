import { asc } from "drizzle-orm";
import { db } from "@/db";
import { parametres } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { unauthorized, ok, withApi } from "@/lib/http";

// Liste des paramètres du cabinet (lecture pour tout utilisateur authentifié).
export const GET = withApi(async () => {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  const rows = await db
    .select()
    .from(parametres)
    .orderBy(asc(parametres.cle));
  return ok(rows);
});
