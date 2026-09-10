import { NextRequest } from "next/server";
import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";

type Ctx = { params: Promise<{ id: string }> };

// Marque une notification comme lue.
export const PATCH = withApi(async (_req: NextRequest, { params }: Ctx) => {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  const { id } = idParamSchema.parse(await params);

  const mine = or(
    eq(notifications.userId, user.id),
    isNull(notifications.userId),
  ) as SQL;

  await db
    .update(notifications)
    .set({ lu: true })
    .where(and(eq(notifications.id, id), mine));

  return ok({ ok: true });
});
