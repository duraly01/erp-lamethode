import { z } from "zod";
import { optionalText } from "@/lib/schemas/common";
import { ACTIONS, RESSOURCES } from "@/lib/permissions";

const RESSOURCES_CONNUES = RESSOURCES.map((r) => r.cle);

/**
 * Une permission accordée à un rôle. La ressource doit appartenir au catalogue
 * (ou être le joker `*`) : accorder un droit sur une ressource inexistante ne
 * protège rien et masquerait une faute de frappe.
 */
const permission = z.object({
  ressource: z
    .string()
    .refine(
      (v) => v === "*" || RESSOURCES_CONNUES.includes(v),
      "Ressource inconnue : elle ne fait pas partie du catalogue RBAC.",
    ),
  // Le joker « * » est accepté au même titre que les actions nommées : c'est la
  // forme que prend l'accès total.
  actions: z
    .array(z.enum(["read", "create", "update", "delete", "*"]))
    .min(1, "Au moins une action est requise.")
    .refine(
      (a) => new Set(a).size === a.length,
      "Actions en double dans la permission.",
    ),
});

/** Nom de rôle : identifiant court, en majuscules, sans espace. */
const nomRole = z
  .string()
  .trim()
  .min(2, "Le nom du rôle est requis.")
  .max(50)
  .regex(
    /^[A-Z][A-Z0-9_]*$/,
    "Utilisez des majuscules, chiffres et tirets bas (ex. CHEF_MISSION).",
  );

export const roleCreateSchema = z.object({
  nom: nomRole,
  description: optionalText(200),
  permissions: z.array(permission).default([]),
});

export const roleUpdateSchema = z
  .object({
    nom: nomRole.optional(),
    description: optionalText(200),
    permissions: z.array(permission).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "Aucun champ à mettre à jour.",
  });

export type RoleCreate = z.infer<typeof roleCreateSchema>;
export type RoleUpdate = z.infer<typeof roleUpdateSchema>;
