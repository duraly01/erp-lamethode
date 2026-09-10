import { NextRequest } from "next/server";
import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, withApi } from "@/lib/http";

// Marque toutes les notifications visibles de l'utilisateur comme lues.
export const POST = withApi(async (_req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) throw unauthorized();

  const mine = or(
    eq(notifications.userId, user.id),
    isNull(notifications.userId),
  ) as SQL;

  await db
    .update(notifications)
    .set({ lu: true })
    .where(and(mine, eq(notifications.lu, false)));

  return ok({ ok: true });
});
