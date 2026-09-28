import { z } from "zod";
import { dateString, optionalText } from "./common";

// ---------------------------------------------------------------------------
// Schémas de validation du module Gestion commerciale & stocks (S1)
// ---------------------------------------------------------------------------

const idPositif = z.coerce.number().int().positive();
const idNullable = idPositif.nullable().optional();

/** Code d'un objet du référentiel : sans espace, lisible, saisi au clavier. */
const code = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9._-]+$/, "Le code n'accepte que lettres, chiffres, point, tiret et souligné.")
    .transform((v) => v.toUpperCase());

export const TYPES_DEPOT = ["ENTREPOT", "BOUTIQUE", "RESTAURANT", "TRANSIT"] as const;
export const TYPES_CODE_ARTICLE = ["EAN", "FOURNISSEUR", "INTERNE_ANCIEN"] as const;

export const parContribuableSchema = z.object({ contribuableId: idPositif });

// --- Dépôts ----------------------------------------------------------------

export const depotCreateSchema = z.object({
  contribuableId: idPositif,
  code: code(20),
  libelle: z.string().trim().min(1).max(200),
  type: z.enum(TYPES_DEPOT),
  responsableUserId: idNullable,
  sectionId: idNullable,
  politiqueNegatif: z.enum(["REFUSE", "TOLERE"]).default("REFUSE"),
});

export const depotUpdateSchema = depotCreateSchema
  .omit({ contribuableId: true, code: true })
  .partial()
  .extend({ actif: z.boolean().optional() });

// --- Familles --------------------------------------------------------------

const comptesParDefaut = {
  compteAchatId: idNullable,
  compteVenteId: idNullable,
  compteStockId: idNullable,
  compteVariationId: idNullable,
  taxeId: idNullable,
};

export const familleCreateSchema = z.object({
  contribuableId: idPositif,
  code: code(20),
  libelle: z.string().trim().min(1).max(200),
  parentId: idNullable,
  ...comptesParDefaut,
});

export const familleUpdateSchema = familleCreateSchema
  .omit({ contribuableId: true, code: true })
  .partial()
  .extend({ actif: z.boolean().optional() });

// --- Articles --------------------------------------------------------------

export const articleCreateSchema = z.object({
  contribuableId: idPositif,
  /** Omis, l'ERP attribue le code : c'est le cas normal. */
  code: code(40).optional(),
  libelle: z.string().trim().min(1).max(300),
  familleId: idNullable,
  unite: z.string().trim().min(1).max(10).default("U"),
  variante: optionalText(60),
  suiviLot: z.boolean().default(false),
  dureeVieMinJours: z.coerce.number().int().min(0).max(3650).nullable().optional(),
  ...comptesParDefaut,
});

export const articleUpdateSchema = articleCreateSchema
  .omit({ contribuableId: true })
  .partial()
  .extend({ actif: z.boolean().optional() });

export const articleListQuerySchema = z.object({
  contribuableId: idPositif,
  q: z.string().trim().max(200).optional(),
  familleId: idPositif.optional(),
  /** Par défaut la liste ne montre que les articles actifs. */
  inclureInactifs: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const articleCodeCreateSchema = z.object({
  type: z.enum(TYPES_CODE_ARTICLE),
  code: z.string().trim().min(1).max(80),
  tiersId: idNullable,
});

// --- Tarifs ----------------------------------------------------------------

export const tarifCreateSchema = z.object({
  contribuableId: idPositif,
  code: code(20),
  libelle: z.string().trim().min(1).max(200),
  typeDepotDefaut: z.enum(TYPES_DEPOT).nullable().optional(),
});

export const tarifUpdateSchema = tarifCreateSchema
  .omit({ contribuableId: true, code: true })
  .partial()
  .extend({ actif: z.boolean().optional() });

/**
 * Un changement de prix : à partir de quand, et combien.
 *
 * Le prix est reçu en francs, comme tout montant saisi, et converti en
 * centimes par le service. Pas de date de fin : elle se déduit de la période
 * suivante, s'il y en a une.
 */
export const prixChangeSchema = z.object({
  articleId: idPositif,
  aPartirDu: dateString,
  prixHt: z.union([z.string(), z.number()]),
});

export const prixListQuerySchema = z.object({
  articleId: idPositif.optional(),
  /** Prix en vigueur à cette date ; omise, tout l'historique. */
  aDate: dateString.optional(),
});
