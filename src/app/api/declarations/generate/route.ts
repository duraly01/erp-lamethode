import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contribuables, declarations } from "@/db/schema";
import {
  obligationsPourRegime,
  echeanceAnnuelle,
  defaultEcheanceMensuelle,
} from "@/lib/constants";
import { echeanceTrimestre, periodeTrimestre } from "@/lib/igs";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, notFound, withApi } from "@/lib/http";
import { writeAudit, clientIp } from "@/lib/audit";

const generateSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("ANNUELLE"),
    contribuableId: z.coerce.number().int().positive(),
    annee: z.coerce.number().int().min(2000).max(2100),
  }),
  z.object({
    mode: z.literal("TRIMESTRIELLE"),
    contribuableId: z.coerce.number().int().positive(),
    annee: z.coerce.number().int().min(2000).max(2100),
    trimestre: z.coerce.number().int().min(1).max(4),
  }),
  z.object({
    mode: z.literal("MENSUELLE"),
    contribuableId: z.coerce.number().int().positive(),
    annee: z.coerce.number().int().min(2000).max(2100),
    mois: z.coerce.number().int().min(1).max(12),
  }),
]);

// Génère en masse les déclarations standards pour une période donnée.
// Idempotent : ne recrée pas une déclaration (contribuable, type, période) existante.
export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(
    await getSessionUser(),
    "declarations",
    "create",
  );
  const input = generateSchema.parse(await req.json());
  const { contribuableId } = input;

  // Les obligations dépendent du régime : un contribuable à l'IGS n'a que son
  // forfait trimestriel, un contribuable au Réel a ses déclarations classiques.
  const [ctb] = await db
    .select({
      regimeFiscal: contribuables.regimeFiscal,
      igsClasse: contribuables.igsClasse,
    })
    .from(contribuables)
    .where(eq(contribuables.id, contribuableId));
  if (!ctb) throw notFound("Contribuable introuvable.");

  const obligations = obligationsPourRegime(ctb.regimeFiscal, ctb.igsClasse);
  const types =
    input.mode === "ANNUELLE"
      ? obligations.annuelles
      : input.mode === "TRIMESTRIELLE"
        ? obligations.trimestrielles
        : obligations.mensuelles;

  const periode =
    input.mode === "ANNUELLE"
      ? String(input.annee)
      : input.mode === "TRIMESTRIELLE"
        ? periodeTrimestre(input.annee, input.trimestre)
        : `${input.annee}-${String(input.mois).padStart(2, "0")}`;

  // En annuel, l'échéance dépend du type : 15 mars pour la DSF au Réel,
  // 15 avril pour la déclaration annuelle IGS, 15 mai pour la DSF d'un
  // dossier IGS. Elle est donc calculée par type dans la boucle.
  const echeanceCommune =
    input.mode === "TRIMESTRIELLE"
      ? echeanceTrimestre(input.annee, input.trimestre)
      : input.mode === "MENSUELLE"
        ? defaultEcheanceMensuelle(input.annee, input.mois)
        : null;

  const createdRows = [];
  for (const type of types) {
    const existing = await db
      .select({ id: declarations.id })
      .from(declarations)
      .where(
        and(
          eq(declarations.contribuableId, contribuableId),
          eq(declarations.type, type),
          eq(declarations.periode, periode),
        ),
      );
    if (existing.length > 0) continue;

    const [row] = await db
      .insert(declarations)
      .values({
        contribuableId,
        type,
        periodicite: input.mode,
        periode,
        dateEcheance:
          echeanceCommune ??
          echeanceAnnuelle(type, input.annee, ctb.regimeFiscal),
        statut: "A_FAIRE",
      })
      .returning();
    createdRows.push(row);
  }

  await writeAudit({
    userId: user.id,
    action: "GENERATE",
    entite: "declarations",
    entiteId: contribuableId,
    diff: { apres: { periode, count: createdRows.length } },
    ip: clientIp(req),
  });

  return created({ created: createdRows.length, rows: createdRows });
});
