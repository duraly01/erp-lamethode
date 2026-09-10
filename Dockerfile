# ---------------------------------------------------------------------------
# ERP LaMethode — image de production Next.js 16
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm install (plutôt que `npm ci`) pour réconcilier les dépendances optionnelles
# multi-plateformes (esbuild) lors d'un build Linux depuis un lock généré ailleurs.
RUN npm install --no-audit --no-fund

# --- Build ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL factice au build : la connexion n'est jamais ouverte ici,
# mais le module de connexion exige que la variable soit définie.
ARG DATABASE_URL="postgres://placeholder:placeholder@localhost:5432/placeholder"
ENV DATABASE_URL=$DATABASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Runtime ---
# On conserve toutes les dépendances (dont drizzle-kit) pour permettre les
# migrations au démarrage et les scripts (seed, automations) via `docker exec`.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src ./src

# Coffre documentaire persistant.
RUN mkdir -p /app/storage && chown -R nextjs:nodejs /app/storage
USER nextjs

EXPOSE 3000
ENV PORT=3000

# Applique les migrations (idempotent) puis démarre le serveur.
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
