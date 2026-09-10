import { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, withApi } from "@/lib/http";
import { searchParamsToObject } from "@/lib/schemas/common";
import { lignesProposees } from "@/lib/services/factures";

const querySchema = z.object({
  contribuableId: z.coerce.number().int().positive(),
  periode: z
    .string()
    .trim()
    .regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, "Période attendue : 2026-01 ou 2026."),
});

/**
 * Lignes proposées pour une facture (honoraires convenus + impôts et
 * cotisations de la période). Alimente le formulaire, où elles restent
 * entièrement modifiables.
 */
export const GET = withApi(async (req: NextRequest) => {
  requirePermission(await getSessionUser(), "factures", "create");
  const { contribuableId, periode } = querySchema.parse(
    searchParamsToObject(req.url),
  );
  return ok({ lignes: await lignesProposees(contribuableId, periode) });
});
