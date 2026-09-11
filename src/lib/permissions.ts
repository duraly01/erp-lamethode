import type { RolePermission } from "@/db/schema";

// Ré-exporté d'ici : les composants clients tiennent leurs permissions de ce
// module, sans avoir à passer par le schéma de base de données.
export type { RolePermission };

// Module client-safe : uniquement des types (effacés à la compilation) + logique pure.

export type Action = "read" | "create" | "update" | "delete";

export const ACTIONS: Action[] = ["read", "create", "update", "delete"];

export const ACTION_LABELS: Record<Action, string> = {
  read: "Consulter",
  create: "Créer",
  update: "Modifier",
  delete: "Supprimer",
};

/**
 * Catalogue des ressources protégées par le RBAC. C'est la source de vérité de
 * la matrice de permissions : toute ressource citée dans un `requirePermission`
 * doit y figurer, sinon l'administrateur ne peut pas l'accorder depuis l'écran
 * Rôles & permissions.
 */
export const RESSOURCES: {
  cle: string;
  label: string;
  description: string;
}[] = [
  {
    cle: "contribuables",
    label: "Contribuables",
    description: "Fiches clients du cabinet",
  },
  {
    cle: "declarations",
    label: "Déclarations",
    description: "Obligations fiscales et échéances",
  },
  {
    cle: "cnps",
    label: "CNPS",
    description: "Cotisations sociales",
  },
  {
    cle: "acf",
    label: "ACF",
    description: "Attestations de conformité fiscale",
  },
  {
    cle: "documents",
    label: "Documents",
    description: "Coffre documentaire",
  },
  {
    cle: "factures",
    label: "Facturation",
    description: "Factures d'honoraires et règlements",
  },
  {
    cle: "comptabilite",
    label: "Comptabilité générale",
    description:
      "Tenue des livres des contribuables. Consulter : balance et grand livre. " +
      "Créer : saisir un brouillon. Modifier : valider une écriture, lettrer. " +
      "Supprimer : jeter un brouillon, contre-passer une écriture validée.",
  },
  {
    cle: "analytics",
    label: "Analytics",
    description: "Tableaux de bord et statistiques",
  },
  {
    cle: "users",
    label: "Utilisateurs",
    description: "Comptes des collaborateurs",
  },
  {
    cle: "roles",
    label: "Rôles & permissions",
    description: "Attribution des droits d'accès",
  },
  {
    cle: "parametres",
    label: "Paramètres",
    description: "Réglages du cabinet, barèmes, automatisations",
  },
];

/** Permission « joker » : accès total à toutes les ressources. */
export const PERMISSION_TOTALE: RolePermission[] = [
  { ressource: "*", actions: ["*"] },
];

/** Un rôle a-t-il l'accès total (super-administrateur) ? */
export function isAccesTotal(permissions: RolePermission[] | undefined) {
  return !!permissions?.some(
    (p) => p.ressource === "*" && p.actions.includes("*"),
  );
}

/** Matrice ressource → actions cochées, pour l'écran d'administration. */
export type MatricePermissions = Record<string, Action[]>;

export function toMatrice(
  permissions: RolePermission[] | undefined,
): MatricePermissions {
  const m: MatricePermissions = {};
  for (const r of RESSOURCES) {
    m[r.cle] = ACTIONS.filter((a) => hasPermission(permissions, r.cle, a));
  }
  return m;
}

/** Inverse de `toMatrice` : ne conserve que les ressources réellement dotées. */
export function fromMatrice(matrice: MatricePermissions): RolePermission[] {
  return RESSOURCES.filter((r) => (matrice[r.cle] ?? []).length > 0).map(
    (r) => ({ ressource: r.cle, actions: [...matrice[r.cle]] }),
  );
}

/** Une permission couvre une ressource/action, avec support du joker "*". */
export function hasPermission(
  permissions: RolePermission[] | undefined,
  ressource: string,
  action: Action,
): boolean {
  if (!permissions) return false;
  return permissions.some(
    (p) =>
      (p.ressource === "*" || p.ressource === ressource) &&
      (p.actions.includes("*") || p.actions.includes(action)),
  );
}
