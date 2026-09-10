import { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db } from "@/db";
import { contribuables } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ok, badRequest, withApi } from "@/lib/http";
import { writeAudit, clientIp } from "@/lib/audit";
import {
  contribuableUpdateSchema,
  normaliseClasseIgs,
} from "@/lib/schemas/contribuables";
import {
  COLONNES,
  LIBELLES,
  analyseLigne,
  colonnePourEntete,
  ligneVide,
  type CleImport,
  type Colonne,
} from "@/lib/import/contribuables";

export const runtime = "nodejs";

const TAILLE_MAX = 5 * 1024 * 1024; // 5 Mo : un portefeuille tient très en deçà
const LIGNES_MAX = 2000;

type Fiche = typeof contribuables.$inferSelect;

type Changement = { champ: string; avant: string; apres: string };

type LigneRapport = {
  ligne: number;
  id: number;
  nom: string;
  changements: Changement[];
};

type LigneErreur = { ligne: number; repere: string; messages: string[] };

/** Rendu lisible d'une valeur, pour l'aperçu avant/après. */
function affiche(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  return String(v);
}

/** La valeur du fichier change-t-elle réellement ce qui est en base ? */
function differe(cle: CleImport, avant: unknown, apres: unknown): boolean {
  if (avant === null || avant === undefined) {
    return !(apres === null || apres === undefined || apres === "");
  }
  if (typeof apres === "boolean" || typeof avant === "boolean") {
    return Boolean(avant) !== Boolean(apres);
  }
  // Les colonnes numériques reviennent de Postgres en chaîne (« 10000.00 ») :
  // on compare des nombres, sinon toute ligne paraîtrait modifiée.
  const na = Number(avant);
  const nb = Number(apres);
  if (Number.isFinite(na) && Number.isFinite(nb) && cle !== "niu" && cle !== "telephone") {
    return na !== nb;
  }
  return String(avant).trim() !== String(apres).trim();
}

/**
 * Import Excel du portefeuille — **modification seule**.
 *
 * Deux temps : sans `appliquer`, la requête se borne à analyser le fichier et
 * à décrire ce qui changerait ; avec `appliquer`, elle écrit. Rien n'est
 * modifié tant que l'utilisateur n'a pas vu le détail et validé.
 *
 * Trois règles gouvernent la lecture :
 * - une cellule vide ne modifie rien, afin qu'un fichier partiel ne puisse
 *   jamais effacer des données ;
 * - une ligne qui ne correspond à aucune fiche est signalée, jamais créée ;
 * - une ligne fautive est rejetée seule, sans empêcher les autres de passer.
 */
export const POST = withApi(async (req: NextRequest) => {
  const user = requirePermission(
    await getSessionUser(),
    "contribuables",
    "update",
  );

  if (!(req.headers.get("content-type") || "").includes("multipart/form-data")) {
    throw badRequest("Requête multipart/form-data attendue.");
  }
  const form = await req.formData();
  const fichier = form.get("file");
  const appliquer = String(form.get("appliquer") ?? "") === "true";

  if (!(fichier instanceof File) || fichier.size === 0) {
    throw badRequest("Aucun fichier reçu.");
  }
  if (fichier.size > TAILLE_MAX) {
    throw badRequest("Fichier trop volumineux (5 Mo maximum).");
  }

  const classeur = new ExcelJS.Workbook();
  try {
    await classeur.xlsx.load(await fichier.arrayBuffer());
  } catch {
    throw badRequest(
      "Fichier illisible. Attendu : un classeur Excel (.xlsx), tel que produit par l'export.",
    );
  }

  const feuille = classeur.worksheets[0];
  if (!feuille || feuille.rowCount < 2) {
    throw badRequest("Le classeur est vide : aucune ligne à importer.");
  }

  // --- Les colonnes : on suit les en-têtes, jamais les positions -----------
  const parIndice = new Map<number, Colonne>();
  const reconnues: string[] = [];
  const ignorees: string[] = [];
  feuille.getRow(1).eachCell((cell, indice) => {
    const colonne = colonnePourEntete(cell.value);
    if (colonne) {
      parIndice.set(indice, colonne);
      reconnues.push(colonne.entete);
    } else {
      const brut = String(cell.value ?? "").trim();
      if (brut) ignorees.push(brut);
    }
  });

  if (parIndice.size === 0) {
    throw badRequest(
      "Aucune colonne reconnue. Partez du fichier produit par le bouton Excel, sans renommer les en-têtes.",
    );
  }
  const aIdentifiant = [...parIndice.values()].some((c) => c.cle === null);
  const aNiu = [...parIndice.values()].some((c) => c.cle === "niu");
  if (!aIdentifiant && !aNiu) {
    throw badRequest(
      "Ni colonne « ID » ni colonne « NIU » : impossible de savoir quelle fiche modifier.",
    );
  }

  // --- Les fiches existantes, lues une fois --------------------------------
  const fiches = await db
    .select()
    .from(contribuables)
    .where(isNull(contribuables.deletedAt));
  const parId = new Map<number, Fiche>(fiches.map((f) => [f.id, f]));
  const parNiu = new Map<string, Fiche[]>();
  for (const f of fiches) {
    const niu = (f.niu ?? "").trim().toUpperCase();
    if (!niu) continue;
    parNiu.set(niu, [...(parNiu.get(niu) ?? []), f]);
  }

  const aModifier: LigneRapport[] = [];
  const erreurs: LigneErreur[] = [];
  const patchs = new Map<number, Record<string, unknown>>();
  let inchangees = 0;
  let lues = 0;

  for (let n = 2; n <= feuille.rowCount; n++) {
    if (lues >= LIGNES_MAX) break;
    const rangee = feuille.getRow(n);

    const cellules = new Map<Colonne, unknown>();
    for (const [indice, colonne] of parIndice) {
      cellules.set(colonne, rangee.getCell(indice).value);
    }

    const analysee = analyseLigne(n, cellules);
    if (ligneVide(analysee)) continue;
    lues++;

    const repere =
      (analysee.valeurs.nom as string | undefined) ??
      analysee.niu ??
      (analysee.id ? `ID ${analysee.id}` : `ligne ${n}`);

    if (analysee.erreurs.length > 0) {
      erreurs.push({ ligne: n, repere, messages: analysee.erreurs });
      continue;
    }

    // --- Appariement : l'identifiant d'abord, le NIU à défaut -------------
    let fiche: Fiche | undefined;
    if (analysee.id !== undefined) {
      fiche = parId.get(analysee.id);
      if (!fiche) {
        erreurs.push({
          ligne: n,
          repere,
          messages: [`Aucune fiche ne porte l'identifiant ${analysee.id}.`],
        });
        continue;
      }
    } else if (analysee.niu) {
      const candidats = parNiu.get(analysee.niu.trim().toUpperCase()) ?? [];
      if (candidats.length === 0) {
        erreurs.push({
          ligne: n,
          repere,
          messages: [
            "Aucune fiche ne porte ce NIU. L'import ne crée pas de contribuable.",
          ],
        });
        continue;
      }
      if (candidats.length > 1) {
        erreurs.push({
          ligne: n,
          repere,
          messages: [
            `Ce NIU désigne ${candidats.length} fiches. Ajoutez la colonne « ID » pour lever l'ambiguïté.`,
          ],
        });
        continue;
      }
      fiche = candidats[0];
    } else {
      erreurs.push({
        ligne: n,
        repere,
        messages: ["Ni identifiant ni NIU : impossible de savoir quelle fiche modifier."],
      });
      continue;
    }

    // --- Ce qui change réellement ------------------------------------------
    const changements: Changement[] = [];
    const patch: Record<string, unknown> = {};
    for (const [cle, apres] of Object.entries(analysee.valeurs) as [
      CleImport,
      unknown,
    ][]) {
      const avant = (fiche as unknown as Record<string, unknown>)[cle];
      if (!differe(cle, avant, apres)) continue;
      changements.push({
        champ: LIBELLES[cle],
        avant: affiche(avant),
        apres: affiche(apres),
      });
      patch[cle] = apres;
    }

    if (changements.length === 0) {
      inchangees++;
      continue;
    }

    // --- Mêmes contrôles qu'à la saisie manuelle ---------------------------
    const controle = contribuableUpdateSchema.safeParse(patch);
    if (!controle.success) {
      erreurs.push({
        ligne: n,
        repere,
        messages: controle.error.issues.map((i) => {
          const champ = i.path.find((p) => typeof p === "string") as
            | CleImport
            | undefined;
          const nom = champ ? (LIBELLES[champ] ?? champ) : "";
          return `${nom ? `${nom} : ` : ""}${i.message}`;
        }),
      });
      continue;
    }

    aModifier.push({ ligne: n, id: fiche.id, nom: fiche.nom, changements });
    patchs.set(
      fiche.id,
      normaliseClasseIgs(
        controle.data,
        (controle.data.regimeFiscal ?? fiche.regimeFiscal) as "REEL" | "IGS",
      ) as Record<string, unknown>,
    );
  }

  // --- Application ---------------------------------------------------------
  let modifiees = 0;
  if (appliquer && patchs.size > 0) {
    await db.transaction(async (tx) => {
      for (const [id, patch] of patchs) {
        await tx
          .update(contribuables)
          .set({ ...patch, updatedAt: new Date() })
          .where(and(eq(contribuables.id, id), isNull(contribuables.deletedAt)));
        modifiees++;
      }
    });

    await writeAudit({
      userId: user.id,
      action: "IMPORT",
      entite: "contribuables",
      diff: {
        apres: {
          fichier: fichier.name,
          modifiees,
          inchangees,
          erreurs: erreurs.length,
        },
      },
      ip: clientIp(req),
    });
  }

  return ok({
    fichier: fichier.name,
    applique: appliquer,
    colonnesReconnues: reconnues,
    colonnesIgnorees: ignorees,
    lignesLues: lues,
    inchangees,
    modifiees,
    aModifier: aModifier.slice(0, 300),
    erreurs: erreurs.slice(0, 300),
    tronque: aModifier.length > 300 || erreurs.length > 300,
  });
});
