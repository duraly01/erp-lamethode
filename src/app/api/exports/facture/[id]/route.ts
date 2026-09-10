import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contribuables, factureLignes, factures } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { notFound, withApi } from "@/lib/http";
import { idParamSchema } from "@/lib/schemas/common";
import { fileResponse } from "@/lib/exports/response";
import {
  buildFacturePdf,
  IDENTITE_CABINET_DEFAUT,
  type IdentiteCabinet,
} from "@/lib/exports/facture-pdf";
import { lireParametre } from "@/lib/services/parametres";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi(async (_req: NextRequest, { params }: Ctx) => {
  requirePermission(await getSessionUser(), "factures", "read");
  const { id } = idParamSchema.parse(await params);

  const [facture] = await db
    .select({
      numero: factures.numero,
      contribuableNom: contribuables.nom,
      contribuableNiu: contribuables.niu,
      contribuableAdresse: contribuables.adresseFacturation,
      periode: factures.periode,
      objet: factures.objet,
      dateEmission: factures.dateEmission,
      dateEcheance: factures.dateEcheance,
      totalHt: factures.totalHt,
      totalTva: factures.totalTva,
      totalTtc: factures.totalTtc,
    })
    .from(factures)
    .innerJoin(contribuables, eq(factures.contribuableId, contribuables.id))
    .where(eq(factures.id, id));
  if (!facture) throw notFound("Facture introuvable.");

  const lignes = await db
    .select({
      categorie: factureLignes.categorie,
      libelle: factureLignes.libelle,
      montantHt: factureLignes.montantHt,
      tauxTva: factureLignes.tauxTva,
    })
    .from(factureLignes)
    .where(eq(factureLignes.factureId, id))
    .orderBy(asc(factureLignes.ordre), asc(factureLignes.id));

  // Les mentions légales viennent des paramètres : le pied du papier entête
  // fourni porte un NIU et un RCCM erronés et n'est pas repris.
  const identite = {
    ...IDENTITE_CABINET_DEFAUT,
    ...((await lireParametre<Partial<IdentiteCabinet>>("cabinet_identite")) ??
      {}),
  };

  const buf = await buildFacturePdf({ ...facture, lignes }, identite);
  return fileResponse(
    buf,
    `${facture.numero}.pdf`,
    "application/pdf",
  );
});
