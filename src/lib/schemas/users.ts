import { z } from "zod";
import { listQuerySchema, booleanParam, optionalText } from "@/lib/schemas/common";

export const userCreateSchema = z.object({
  nom: z.string().trim().min(1, "Le nom est requis.").max(200),
  email: z.string().trim().email("Email invalide").max(255),
  telephone: optionalText(50),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum.").max(200),
  roleId: z.coerce.number().int().positive().optional().nullable(),
  actif: z.boolean().default(true),
});

export const userUpdateSchema = z
  .object({
    nom: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(255).optional(),
    telephone: optionalText(50),
    password: z.string().min(8).max(200).optional(),
    roleId: z.coerce.number().int().positive().optional().nullable(),
    actif: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "Aucun champ à mettre à jour.",
  });

export const userListQuerySchema = listQuerySchema.extend({
  roleId: z.coerce.number().int().positive().optional(),
  actif: booleanParam.optional(),
});
