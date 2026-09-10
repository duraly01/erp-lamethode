import type { Paginated } from "@/lib/http";

export type { Paginated };

/** Erreur API normalisée côté client. */
export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function toError(res: Response): Promise<ApiClientError> {
  let code = "error";
  let message = `Erreur ${res.status}`;
  let details: unknown;
  try {
    const body = await res.json();
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
    }
  } catch {
    /* corps non-JSON */
  }
  return new ApiClientError(res.status, code, message, details);
}

/** Nom lisible des champs, pour que l'erreur désigne ce que l'on voit à l'écran. */
const LIBELLES_CHAMPS: Record<string, string> = {
  adresseFacturation: "Adresse de facturation",
  categorie: "Nature",
  contribuableId: "Contribuable",
  dateEcheance: "Échéance",
  dateEmission: "Date d'émission",
  delaiPaiementJours: "Délai de paiement",
  email: "Email",
  honoraireMensuel: "Honoraires mensuels",
  igsClasse: "Classe IGS",
  libelle: "Désignation",
  montant: "Montant",
  montantHt: "Montant HT",
  niu: "NIU",
  nom: "Nom",
  periode: "Période",
  remisePct: "Remise",
  tauxTva: "TVA",
  telephone: "Téléphone",
};

type ProblemeValidation = { path?: unknown[]; message?: string };

/**
 * Message d'erreur destiné à l'utilisateur.
 *
 * Le serveur renvoie « Données invalides. » accompagné du détail des champs
 * fautifs. Sans ce détail, l'utilisateur ne sait pas quoi corriger : on le
 * remet donc en français, en désignant la ligne et le champ concernés.
 */
export function messageErreur(err: unknown): string {
  // Volontairement sans `instanceof` : une panne réseau, une réponse illisible
  // ou une erreur de rendu ne produisent pas une ApiClientError, et l'utilisateur
  // se retrouvait alors devant un « Une erreur est survenue. » qui n'apprend
  // rien. On lit ce qui est lisible, quelle que soit la nature de l'erreur.
  const e = err as { details?: unknown; message?: unknown } | null | undefined;

  const problemes = e?.details as ProblemeValidation[] | undefined;
  if (Array.isArray(problemes) && problemes.length > 0) {
    const vus = new Set<string>();
    const phrases: string[] = [];
    for (const p of problemes) {
      const chemin = Array.isArray(p.path) ? p.path : [];
      const champ = [...chemin]
        .reverse()
        .find((seg): seg is string => typeof seg === "string");
      const rang = chemin.find((seg): seg is number => typeof seg === "number");

      const prefixe = rang === undefined ? "" : `Ligne ${rang + 1} — `;
      const nom = champ ? (LIBELLES_CHAMPS[champ] ?? champ) : "";
      const phrase = `${prefixe}${nom ? `${nom} : ` : ""}${p.message ?? "valeur invalide"}`;
      if (!vus.has(phrase)) {
        vus.add(phrase);
        phrases.push(phrase);
      }
    }
    const montrees = phrases.slice(0, 4);
    const reste = phrases.length - montrees.length;
    return montrees.join(" · ") + (reste > 0 ? ` · et ${reste} autre(s).` : "");
  }

  if (typeof e?.message === "string" && e.message.trim()) return e.message;
  return "Une erreur est survenue.";
}

/**
 * `fetch` dont l'échec réseau porte un message compréhensible. Une requête qui
 * n'atteint jamais le serveur rejette avec un « Failed to fetch » qui n'aide
 * personne, alors que la cause est presque toujours la connexion.
 */
async function fetchOuReseau(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiClientError(
      0,
      "reseau",
      "La requête n'a pas atteint le serveur. Vérifiez votre connexion, puis réessayez : rien n'a été enregistré.",
    );
  }
}

/**
 * Envoi d'un fichier (multipart), avec la même normalisation des erreurs que
 * les autres appels. On ne pose pas de `Content-Type` : le navigateur doit le
 * composer lui-même pour y placer la frontière du multipart.
 */
export async function apiUpload<T>(url: string, form: FormData): Promise<T> {
  const res = await fetchOuReseau(url, { method: "POST", body: form });
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<T>;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetchOuReseau(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<T>;
}

export async function apiSend<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T | null> {
  const res = await fetchOuReseau(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return null;
  return res.json() as Promise<T>;
}

/** Construit une query string en ignorant les valeurs vides. */
export function qs(params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
