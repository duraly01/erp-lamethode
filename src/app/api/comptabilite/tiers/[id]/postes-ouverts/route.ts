import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cptaTiers } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, notFound, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { getPostesOuverts } from "@/lib/services/comptabilite/lettrage";

/**
 * Postes ouverts d'un tiers sur son compte collectif : les factures qu'il
 * doit encore, ou qu'on lui doit. C'est ce qu'un règlement peut solder.
 */
export const GET = withApi(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    requirePermission(await getSessionUser(), "comptabilite", "read");
    const { id } = idParamSchema.parse(await params);

    const [tiers] = await db.select().from(cptaTiers).where(eq(cptaTiers.id, id));
    if (!tiers) throw notFound("Tiers introuvable.");
    // Sans compte collectif, rien ne peut lui être imputé : la liste est vide,
    // et ce n'est pas une erreur.
    if (!tiers.compteId) return ok([]);

    return ok(await getPostesOuverts(tiers.compteId, tiers.id));
  },
);
