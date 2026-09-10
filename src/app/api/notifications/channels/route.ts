import { getSessionUser } from "@/lib/session";
import { ok, unauthorized, withApi } from "@/lib/http";
import { channelStatus } from "@/lib/notifications";

export const runtime = "nodejs";

// État de configuration des canaux de notification.
export const GET = withApi(async () => {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return ok({ channels: channelStatus() });
});
