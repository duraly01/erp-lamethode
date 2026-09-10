# Phase 7 — Exports (Excel & PDF)

**Statut :** livré & vérifié · **Excel :** exceljs · **PDF :** pdfkit (Node, sans navigateur)

---

## 1. Exports disponibles

| Export | Endpoint | Format | Contenu |
|--------|----------|--------|---------|
| Portefeuille contribuables | `GET /api/exports/contribuables` | **Excel** | tous les contribuables actifs (nom, NIU, régime, centre, contacts, statut) |
| Échéancier déclarations | `GET /api/exports/declarations?type=&statut=&periode=&contribuableId=` | **Excel** | déclarations filtrées, statut effectif (retard calculé), montants formatés |
| Fiche contribuable | `GET /api/exports/contribuable/[id]` | **PDF** | infos + échéancier des déclarations + demandes d'ACF |

- En-têtes Excel stylés à la charte (vert `#59B233`), ligne figée, colonnes dimensionnées.
- PDF en-tête « LaMethode » + tableaux paginés + pied de page daté.
- Tous **authentifiés** et soumis à la permission `read` de la ressource concernée.

## 2. Helpers

- [`lib/exports/excel.ts`](../src/lib/exports/excel.ts) — `buildWorkbookBuffer`, `styleHeaderRow`.
- [`lib/exports/pdf.ts`](../src/lib/exports/pdf.ts) — `buildPdfBuffer`, `pdfHeader`, `pdfTable`, `pdfFooter`.
- [`lib/exports/response.ts`](../src/lib/exports/response.ts) — réponse de téléchargement typée.

## 3. Point technique — pdfkit + Next

pdfkit charge ses polices `.afm` depuis `node_modules` à l'exécution ; le bundler de Next ne
les incluait pas (`ENOENT Helvetica.afm`). Résolu en externalisant pdfkit du bundle serveur :

```ts
// next.config.ts
serverExternalPackages: ["pdfkit"],
```

## 4. Interface

- **Contribuables** : bouton « Excel » (barre d'outils) + icône « Fiche PDF » par ligne.
- **Déclarations** : bouton « Excel » qui **respecte les filtres** actifs (type / statut / période).

## 5. Vérifications

✅ Excel contribuables (fichier `Microsoft Excel 2007+` valide, 7,4 Ko) · ✅ Excel déclarations
filtré (statut EN_RETARD) · ✅ PDF fiche (`PDF 1.3`, 3 pages, après le fix pdfkit) · ✅ export
non authentifié → **401** · ✅ `typecheck` vert.

---

## ⏸️ Reste au plan
Phase 8 — Tests (unitaires règles métier, intégration API + RBAC, e2e parcours critiques).
