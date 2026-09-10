import { z } from "zod";
import {
  listQuerySchema,
  dateString,
  optionalText,
} from "@/lib/schemas/common";

const statutAcf = z.enum(["EN_COURS", "BLOQUE", "DELIVRE", "REJETE"]);

export const acfCreateSchema = z.object({
  contribuableId: z.coerce.number().int().positive(),
  objet: z.string().trim().min(1, "L'objet est requis.").max(300),
  dateDemande: dateString,
  statut: statutAcf.default("EN_COURS"),
  motifBlocage: optionalText(1000),
  solution: optionalText(1000),
  dateResolution: dateString.optional().nullable(),
  dateValidite: dateString.optional().nullable(),
  responsable: optionalText(200),
  notes: optionalText(2000),
});

export const acfUpdateSchema = acfCreateSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, {
    message: "Aucun champ à mettre à jour.",
  });

export const acfListQuerySchema = listQuerySchema.extend({
  contribuableId: z.coerce.number().int().positive().optional(),
  statut: statutAcf.optional(),
});
