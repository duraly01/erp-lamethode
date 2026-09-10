# Déploiement — ERP LaMethode

Déploiement conteneurisé (Docker) sur un **VPS Ubuntu**, derrière **Nginx**.

---

## 1. Fichiers de déploiement

| Fichier | Rôle |
|---------|------|
| [`Dockerfile`](../Dockerfile) | Image de production (build multi-étapes ; migrations au démarrage) |
| [`docker-compose.prod.yml`](../docker-compose.prod.yml) | Stack complète : `app` + `db` (PostgreSQL) + `nginx` |
| [`nginx/nginx.conf`](../nginx/nginx.conf) | Reverse proxy (port 80, upload jusqu'à 12 Mo) |
| [`.env.production.example`](../.env.production.example) | Modèle des variables de production |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | CI : lint + typecheck + tests + build |

## 2. Prérequis serveur

```bash
# Docker + Compose (Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # puis se reconnecter
```

## 3. Mise en production

```bash
# 1. Récupérer le code
git clone <votre-dépôt> lamethode-erp && cd lamethode-erp

# 2. Configurer l'environnement
cp .env.production.example .env.production
#   → renseigner POSTGRES_PASSWORD, AUTH_SECRET (openssl rand -base64 32),
#     CRON_SECRET (openssl rand -hex 24), AUTH_URL (votre domaine)

# 3. Construire et démarrer (l'app applique les migrations automatiquement)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# 4. (Première fois) charger des données de démonstration — OPTIONNEL
docker compose -f docker-compose.prod.yml exec app npm run db:seed
```

L'application est servie par Nginx sur le **port 80**. Créez ensuite un compte admin réel
(via le seed puis modification, ou en insérant un utilisateur avec un mot de passe haché).

## 4. HTTPS (recommandé)

Utiliser un reverse proxy TLS (Caddy, Traefik) ou ajouter Certbot :

```bash
sudo apt install certbot python3-certbot-nginx
# Pointer un Nginx hôte vers le port publié, ou terminer le TLS en amont.
```

Mettre `AUTH_URL="https://votre-domaine"` dans `.env.production`.

## 5. Automatisations (cron)

Le calcul des retards/pénalités et les rappels s'exécutent via l'endpoint sécurisé.
Ajouter au cron de l'hôte (tous les jours à 7h) :

```bash
0 7 * * * curl -s -X POST http://localhost/api/automations/run \
  -H "x-cron-secret: <VOTRE_CRON_SECRET>" >> /var/log/lamethode-cron.log 2>&1
```

## 6. Exploitation

```bash
# Logs
docker compose -f docker-compose.prod.yml logs -f app

# Sauvegarde de la base
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup_$(date +%F).sql

# Mise à jour applicative
git pull && docker compose -f docker-compose.prod.yml up -d --build
```

Les documents uploadés persistent dans le volume `storage` ; la base dans `pgdata`.

## 7. Notes techniques

- **Migrations** : appliquées au démarrage du conteneur (`drizzle-kit migrate`, idempotent).
  `drizzle.config.ts` lit `DATABASE_URL` de l'environnement.
- **pdfkit** : conservé hors bundle (`serverExternalPackages`) — ses polices `.afm` sont dans
  `node_modules`, présent dans l'image.
- **Build** : un `DATABASE_URL` factice est injecté au build (aucune connexion n'est ouverte).

## 8. Alternative — Vercel

Le frontend/API peut aussi tourner sur **Vercel** (base PostgreSQL managée : Neon/Supabase).
Définir `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `CRON_SECRET` dans les variables Vercel, et
utiliser **Vercel Cron** pour appeler `/api/automations/run`. Le stockage documentaire local
devra alors passer sur un service S3-compatible (prévu via `STORAGE_DRIVER`).
