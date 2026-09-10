import { NextRequest } from "next/server";
import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { contribuables, factures } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { created, withApi } from "@/lib/http";
import { generationMensuelleSchema } from "@/lib/schemas/factures";
import { creerFacture, lignesProposees } from "@/lib/services/factures";
import { jourCalendaire } from "@/lib/facturation";
import { writeAudit, clientIp } from "@/lib/audit";

/**
 * Prépare les factures du mois **en brouillon**. Rien n'est envoyé : les
 * montants varient d'un mois à l'autre et doivent être relus avant émission.
 *
 * Qui est concerné :
 * - sans sélection, les seuls contribuables en **facturation automatique** —
 *   le mode de la fiche gouverne ce qui part tout seul ;
 * - avec une sélection nominative, ceux-là et eux seuls, quel que soit leur
 *   mode : c'est le moyen de facturer à la demande.
 *
 * Idempotent : l'unicité (contribuable, période) empêche tout doublon, les
 * contribuables déjà facturés sur la période sont simplement ignorés.
 */
export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(await getSessionUser(), "factures", "create");
  const input = generationMensuelleSchema.parse(await req.json());
  const dateEmission = input.dateEmission ?? jourCalendaire(new Date());

  const filtres: SQL[] = [
    isNull(contribuables.deletedAt),
    eq(contribuables.actif, true),
  ];
  if (input.contribuableIds?.length) {
    filtres.push(inArray(contribuables.id, input.contribuableIds));
  } else {
    filtres.push(eq(contribuables.facturationAuto, true));
  }

  const cibles = await db
    .select({ id: contribuables.id, nom: contribuables.nom })
    .from(contribuables)
    .where(and(...filtres));

  // Périodes déjà facturées : évite un aller-retour en base par contribuable.
  const dejaFactures = new Set(
    (
      await db
        .select({ contribuableId: factures.contribuableId })
        .from(factures)
        .where(eq(factures.periode, input.periode))
    ).map((f) => f.contribuableId),
  );

  const creees: { id: number; numero: string; contribuable: string }[] = [];
  const ignores: string[] = [];
  const sansMontant: string[] = [];

  for (const ctb of cibles) {
    if (dejaFactures.has(ctb.id)) {
      ignores.push(ctb.nom);
      continue;
    }

    const lignes = await lignesProposees(ctb.id, input.periode);
    // Les lignes sont toujours proposées, fût-ce à zéro, pour que le formulaire
    // ne parte jamais d'un tableau vide. En génération de masse en revanche,
    // une facture entièrement à zéro n'aurait aucun sens : ni honoraires
    // convenus, ni échéance chiffrée. On la signale plutôt que de la créer.
    const totalHt = lignes.reduce((somme, l) => somme + l.montantHt, 0);
    if (totalHt <= 0) {
      sansMontant.push(ctb.nom);
      continue;
    }

    const facture = await creerFacture({
      contribuableId: ctb.id,
      periode: input.periode,
      dateEmission,
      lignes,
      createdBy: user.id,
    });
    creees.push({
      id: facture.id,
      numero: facture.numero,
      contribuable: ctb.nom,
    });
  }

  await writeAudit({
    userId: user.id,
    action: "GENERATE",
    entite: "factures",
    diff: {
      apres: {
        periode: input.periode,
        creees: creees.length,
        ignorees: ignores.length,
        sansMontant: sansMontant.length,
      },
    },
    ip: clientIp(req),
  });

  return created({
    periode: input.periode,
    creees,
    dejaFacturees: ignores,
    sansMontant,
  });
});
