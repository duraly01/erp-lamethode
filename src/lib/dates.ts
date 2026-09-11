// ---------------------------------------------------------------------------
// Le jour courant, au Cameroun
//
// Le cabinet, ses clients et l'administration fiscale sont tous à l'heure de
// Douala (UTC+1, sans heure d'été). Le serveur, lui, ne l'est pas : les
// hébergements mutualisés tournent en UTC, et `toISOString()` rendait donc la
// date de la veille entre 23 h et minuit — une écriture datée du mauvais jour,
// une déclaration passée en retard une heure trop tôt.
//
// Le fuseau est nommé ici explicitement plutôt que laissé à la configuration
// de la machine : le même calcul doit donner le même jour sur le serveur, dans
// le navigateur du collaborateur et dans les tests.
//
// Module client-safe : uniquement de la logique pure.
// ---------------------------------------------------------------------------

/** Fuseau de référence du cabinet. */
export const FUSEAU_CAMEROUN = "Africa/Douala";

// `en-CA` formate en « AAAA-MM-JJ », l'ordre attendu partout dans la base.
const FORMAT_JOUR = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSEAU_CAMEROUN,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Jour calendaire camerounais d'un instant, au format « AAAA-MM-JJ ».
 *
 * Sans argument : le jour d'aujourd'hui. Ce format se compare directement, en
 * chaînes, aux colonnes `date` de PostgreSQL — inutile de repasser par un
 * objet `Date`, dont l'interprétation dépendrait à nouveau du fuseau.
 */
export function jourAuCameroun(instant: Date = new Date()): string {
  return FORMAT_JOUR.format(instant);
}

/**
 * Jour situé `jours` après (ou avant, si négatif) un jour donné.
 *
 * Le calcul se fait à midi UTC : ainsi aucun décalage de fuseau ne peut faire
 * basculer le résultat sur la date voisine.
 */
export function ajouterJours(jourIso: string, jours: number): string {
  const d = new Date(`${jourIso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Jour invalide : ${jourIso} (attendu « AAAA-MM-JJ »).`);
  }
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}
