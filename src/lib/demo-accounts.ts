// ---------------------------------------------------------------------------
// Comptes de démonstration
//
// Source unique du jeu de comptes créé par `npm run db:seed` et de l'encart
// affiché sur la page de connexion. Les deux avaient divergé : l'encart
// annonçait encore « admin@lamethode.cm », adresse supprimée lorsque le compte
// administrateur a été renommé, si bien que la page proposait un identifiant
// qui ne fonctionnait plus.
//
// Module client-safe : uniquement des données, aucune dépendance serveur.
// ---------------------------------------------------------------------------

/** Mot de passe commun aux comptes de démonstration, haché à l'insertion. */
export const DEMO_PASSWORD = "Lamethode2026!";

export type CompteDemo = {
  nom: string;
  email: string;
  /** Nom du rôle, tel que créé par le seed. */
  role: "ADMIN" | "MANAGER" | "COLLABORATEUR" | "LECTURE";
  telephone?: string;
};

/**
 * L'ordre est significatif : le seed insère ces comptes tels quels et
 * s'appuie sur leur position pour rattacher les données de démonstration.
 */
export const COMPTES_DEMO: CompteDemo[] = [
  {
    nom: "Dominique Foudé",
    email: "foude.dominique@gmail.com",
    role: "ADMIN",
    telephone: "+237699591975",
  },
  { nom: "Nadège Manager", email: "nadege@lamethode.cm", role: "MANAGER" },
  { nom: "Yannick Collab", email: "yannick@lamethode.cm", role: "COLLABORATEUR" },
  { nom: "Aïcha Collab", email: "aicha@lamethode.cm", role: "COLLABORATEUR" },
];
