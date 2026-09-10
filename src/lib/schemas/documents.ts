import { z } from "zod";
import { listQuerySchema, optionalText } from "@/lib/schemas/common";

export const documentCreateSchema = z.object({
  contribuableId: z.coerce.number().int().positive(),
  nomFichier: z.string().trim().min(1, "Le nom du fichier est requis.").max(300),
  typeMime: optionalText(100),
  taille: z.coerce.number().int().nonnegative().optional().nullable(),
  cheminStockage: z.string().trim().min(1).max(500),
  categorie: optionalText(100),
  tags: z.array(z.string().trim().max(50)).max(30).default([]),
  version: z.coerce.number().int().positive().default(1),
  parentDocumentId: z.coerce.number().int().positive().optional().nullable(),
  declarationId: z.coerce.number().int().positive().optional().nullable(),
  acfId: z.coerce.number().int().positive().optional().nullable(),
});

export const documentUpdateSchema = z
  .object({
    nomFichier: z.string().trim().min(1).max(300).optional(),
    categorie: optionalText(100),
    tags: z.array(z.string().trim().max(50)).max(30).optional(),
    declarationId: z.coerce.number().int().positive().optional().nullable(),
    acfId: z.coerce.number().int().positive().optional().nullable(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "Aucun champ à mettre à jour.",
  });

export const documentListQuerySchema = listQuerySchema.extend({
  contribuableId: z.coerce.number().int().positive().optional(),
  categorie: z.string().trim().max(100).optional(),
});
