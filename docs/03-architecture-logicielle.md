# Architecture Logicielle & Arborescence — ERP LaMethode

**Version :** 1.0 (Phase 1) · **Statut :** à valider

---

## 1. Vue en couches

```
┌─────────────────────────────────────────────────────────────┐
│  Présentation (Next.js App Router)                           │
│  Server Components (lecture) · Client Components (interaction)│
│  Shadcn UI · TanStack Table · Recharts · Framer Motion       │
└───────────────┬─────────────────────────────────────────────┘
                │ appels
┌───────────────▼─────────────────────────────────────────────┐
│  API REST (Route Handlers /app/api/**)                       │
│  Auth (Auth.js) · RBAC · Validation Zod · Pagination/Filtres │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│  Services métier (src/lib/services)                          │
│  Règles : échéances, retard, pénalités, alertes              │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│  Repositories (src/lib/repositories) → Drizzle ORM           │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│  PostgreSQL                                                  │
└─────────────────────────────────────────────────────────────┘
```

**Règle d'or :** l'UI ne parle jamais directement à Drizzle. Elle passe par l'API (client) ou
par un service (Server Component). Les repositories sont les seuls à importer le schéma Drizzle.

---

## 2. Arborescence cible

```
taxpayer-management-dashboard-prompt/
├── docs/                          # ← livrables Phase 1 (ce dossier)
├── drizzle/                       # migrations générées
├── public/                        # logo LaMethode, favicons, assets statiques
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (app)/                 # layout protégé (sidebar + auth guard)
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── contribuables/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── declarations/page.tsx
│   │   │   ├── cnps/page.tsx
│   │   │   ├── acf/page.tsx
│   │   │   ├── blocages/page.tsx
│   │   │   ├── documents/page.tsx
│   │   │   ├── analytics/page.tsx
│   │   │   └── parametres/page.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── contribuables/route.ts + [id]/route.ts
│   │   │   ├── declarations/route.ts + [id]/route.ts + generate/route.ts
│   │   │   ├── cnps/route.ts + [id]/route.ts
│   │   │   ├── acf/route.ts + [id]/route.ts
│   │   │   ├── blocages/route.ts + [id]/route.ts
│   │   │   ├── documents/route.ts + [id]/route.ts
│   │   │   ├── analytics/route.ts
│   │   │   ├── users/route.ts + [id]/route.ts
│   │   │   └── health/route.ts
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                    # Shadcn (button, dialog, table, ...)
│   │   ├── data-table/            # tableau Excel-like réutilisable (TanStack)
│   │   ├── charts/                # wrappers Recharts
│   │   ├── forms/                 # formulaires RHF + Zod
│   │   ├── Sidebar.tsx
│   │   └── Badges.tsx
│   ├── db/
│   │   ├── index.ts               # connexion Drizzle
│   │   ├── schema.ts              # schéma complet
│   │   └── seed.ts                # données de démo
│   ├── lib/
│   │   ├── auth.ts                # config Auth.js
│   │   ├── rbac.ts                # rôles & permissions
│   │   ├── constants.ts           # référentiel métier (existant)
│   │   ├── schemas/               # schémas Zod par entité
│   │   ├── repositories/          # accès données (Drizzle)
│   │   ├── services/              # règles métier (échéances, pénalités…)
│   │   ├── exports/               # PDF / Excel / CSV
│   │   └── utils.ts
│   ├── hooks/                     # hooks React Query, etc.
│   └── middleware.ts              # auth guard + rate limiting
├── tests/                         # unit / integration / e2e
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── drizzle.config.json            # existant
├── next.config.ts                 # existant
└── package.json                   # existant
```

---

## 3. Découpage par responsabilité (extrait)

| Dossier | Responsabilité | Ne doit PAS |
|---------|----------------|-------------|
| `app/**` | Routing, layout, composition UI | contenir de la logique métier ou du SQL |
| `lib/services` | Règles métier pures, testables | connaître Next.js / HTTP |
| `lib/repositories` | Requêtes Drizzle typées | contenir de règles métier |
| `lib/schemas` | Validation Zod, types partagés | dépendre de la BDD |
| `components/data-table` | Tableau générique réutilisable | connaître un domaine précis |

---

## 4. Sessions de rendu

- **Server Components** par défaut (fiche contribuable, dashboard = lecture).
- **Client Components** ciblés : tableaux interactifs, formulaires, modales, graphiques.
- **React Query** côté client pour la synchro/optimistic updates après mutation.
