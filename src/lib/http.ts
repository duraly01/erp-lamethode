import { NextResponse } from "next/server";
import { ZodError } from "zod";

// ---------------------------------------------------------------------------
// Réponses API uniformes
// ---------------------------------------------------------------------------

export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json<ApiErrorBody>(
    { error: { code, message, details } },
    { status },
  );
}

export type Paginated<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
) {
  return NextResponse.json<Paginated<T>>({
    data,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

// ---------------------------------------------------------------------------
// Erreurs métier typées (levées dans les handlers, converties par withApi)
// ---------------------------------------------------------------------------

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (message = "Ressource introuvable.") =>
  new HttpError(404, "not_found", message);
export const unauthorized = (message = "Authentification requise.") =>
  new HttpError(401, "unauthorized", message);
export const forbidden = (message = "Accès refusé.") =>
  new HttpError(403, "forbidden", message);
export const conflict = (message = "Conflit.") =>
  new HttpError(409, "conflict", message);
export const badRequest = (message = "Requête invalide.") =>
  new HttpError(400, "bad_request", message);

// ---------------------------------------------------------------------------
// Enveloppe des handlers : capture ZodError / HttpError / erreurs Postgres
// ---------------------------------------------------------------------------

type Handler = (...args: never[]) => Promise<Response>;

export function withApi<H extends Handler>(handler: H): H {
  return (async (...args: Parameters<H>) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ZodError) {
        return apiError("validation", "Données invalides.", 422, err.issues);
      }
      if (err instanceof HttpError) {
        return apiError(err.code, err.message, err.status, err.details);
      }
      // Drizzle enveloppe l'erreur pg ; le code SQLSTATE peut être sur `cause`.
      const pg = findPgError(err);
      if (pg?.code === "23505") {
        return apiError(
          "conflict",
          "Cette valeur existe déjà (contrainte d'unicité).",
          409,
        );
      }
      if (pg?.code === "23503") {
        return apiError(
          "foreign_key",
          "Référence invalide vers une entité inexistante.",
          422,
        );
      }
      console.error("[API] Erreur non gérée :", err);
      return apiError("internal", "Erreur interne du serveur.", 500);
    }
  }) as H;
}

/** Remonte la chaîne des `cause` pour trouver une erreur PostgreSQL (code SQLSTATE). */
function findPgError(err: unknown): { code: string } | null {
  let cur = err;
  for (let i = 0; i < 5 && cur; i++) {
    if (
      typeof cur === "object" &&
      cur !== null &&
      "code" in cur &&
      typeof (cur as { code: unknown }).code === "string"
    ) {
      return cur as { code: string };
    }
    cur = (cur as { cause?: unknown })?.cause;
  }
  return null;
}
