import { NextRequest } from "next/server";
import { and, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, withApi } from "@/lib/http";

// Notifications visibles par l'utilisateur : les siennes + les diffusées (userId null).
export const GET = withApi(async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) throw unauthorized();

  const unreadOnly = new URL(req.url).searchParams.get("unread") === "true";
  const mine = or(
    eq(notifications.userId, user.id),
    isNull(notifications.userId),
  ) as SQL;
  const where = unreadOnly
    ? and(mine, eq(notifications.lu, false))
    : mine;

  const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(30);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(mine, eq(notifications.lu, false)));

  return ok({ data: rows, unreadCount: count });
});
