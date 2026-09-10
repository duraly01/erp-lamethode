import "dotenv/config";

// ---------------------------------------------------------------------------
// Banc de vérification de la comptabilité générale (E1)
//
//   docker compose up -d db
//   npm run db:migrate:node
//   npm run verify:comptabilite
//
// Éprouve contre une vraie base PostgreSQL tout ce que les tests unitaires ne
// peuvent pas atteindre : les contraintes du schéma, les transactions, et la
// numérotation des pièces sous validations simultanées.
//
// Le script travaille sur un contribuable dédié, créé puis supprimé à la fin.
// Il ne touche à aucune donnée existante.
// ---------------------------------------------------------------------------

import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import {
  contribuables,
  cptaComptes,
  cptaEcritures,
  cptaExercices,
  cptaJournaux,
  cptaLettrages,
  cptaLignesEcriture,
  cptaSequences,
  cptaTaxes,
  cptaTiers,
} from "@/db/schema";
import { HttpError } from "@/lib/http";
import { formatMontantAffichage, parseMontant } from "@/lib/comptable/money";
import { ouvrirExercice } from "@/lib/services/comptabilite/exercices";
import {
  creerBrouillon,
  modifierBrouillon,
  validerEcritureEnBase,
  contrepasserEcriture,
} from "@/lib/services/comptabilite/ecritures";
import { lettrerLignes } from "@/lib/services/comptabilite/lettrage";
import { getBalance } from "@/lib/services/comptabilite/restitutions";

const NOM_TEMOIN = "ZZ VERIFICATION COMPTABLE (temporaire)";

let reussis = 0;
let echoues = 0;

function verifier(libelle: string, condition: boolean, detail?: string) {
  if (condition) {
    reussis++;
    console.log(`  ok   ${libelle}`);
  } else {
    echoues++;
    console.log(`  ECHEC ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
}

function egal<T>(libelle: string, obtenu: T, attendu: T) {
  verifier(
    libelle,
    obtenu === attendu,
    `obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`,
  );
}

/** Exécute une opération censée échouer, et rend le code d'erreur obtenu. */
async function attendreRefus(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "AUCUNE_ERREUR";
  } catch (e) {
    if (e instanceof HttpError) return e.code;
    const pg = e as { code?: string };
    return pg.code ?? "INCONNUE";
  }
}

async function main() {
  console.log("\n=== Vérification de la comptabilité générale ===\n");

  await nettoyer(); // au cas où une exécution précédente aurait échoué

  // -------------------------------------------------------------------------
  console.log("1. Ouverture d'exercice et dépôt du référentiel");

  const [ctb] = await db
    .insert(contribuables)
    .values({ nom: NOM_TEMOIN, niu: "ZZVERIF0000001", regimeFiscal: "REEL" })
    .returning();

  const exercice = await ouvrirExercice({
    contribuableId: ctb.id,
    libelle: "Exercice 2026",
    dateDebut: "2026-01-01",
    dateFin: "2026-12-31",
  });

  const comptes = await db
    .select()
    .from(cptaComptes)
    .where(eq(cptaComptes.contribuableId, ctb.id));
  const journaux = await db
    .select()
    .from(cptaJournaux)
    .where(eq(cptaJournaux.contribuableId, ctb.id));
  const taxes = await db
    .select()
    .from(cptaTaxes)
    .where(eq(cptaTaxes.contribuableId, ctb.id));
  const sequences = await db
    .select()
    .from(cptaSequences)
    .where(eq(cptaSequences.exerciceId, exercice.id));

  egal("plan comptable déposé (181 comptes)", comptes.length, 181);
  egal("journaux créés", journaux.length, 6);
  egal("taxes datées créées", taxes.length, 5);
  egal("un compteur par journal", sequences.length, 6);
  egal("exercice ouvert", exercice.statut, "OUVERT");

  const parNumero = new Map(comptes.map((c) => [c.numero, c]));
  const journalParCode = new Map(journaux.map((j) => [j.code, j]));

  const c601 = parNumero.get("601")!;
  const c4452 = parNumero.get("4452")!;
  const c401 = parNumero.get("401")!;
  const c521 = parNumero.get("5211")!;

  verifier("401 est bien collectif et lettrable", c401.collectif && c401.lettrable);
  verifier("5211 est bien rapprochable", c521.rapprochable);

  // Un exercice qui chevauche le premier doit être refusé.
  const codeChevauchement = await attendreRefus(() =>
    ouvrirExercice({
      contribuableId: ctb.id,
      libelle: "Exercice qui chevauche",
      dateDebut: "2026-06-01",
      dateFin: "2027-05-31",
    }),
  );
  egal("chevauchement d'exercices refusé", codeChevauchement, "conflict");

  const [tiers] = await db
    .insert(cptaTiers)
    .values({
      contribuableId: ctb.id,
      code: "F001",
      raisonSociale: "Fournisseur de vérification",
      types: ["FOURNISSEUR"],
      compteId: c401.id,
    })
    .returning();

  // -------------------------------------------------------------------------
  console.log("\n2. Contraintes portées par la base");

  const [brouillonSonde] = await db
    .insert(cptaEcritures)
    .values({
      exerciceId: exercice.id,
      journalId: journalParCode.get("OD")!.id,
      dateEcriture: "2026-02-01",
      libelle: "Sonde de contrainte",
    })
    .returning();

  const codeSens = await attendreRefus(() =>
    db.insert(cptaLignesEcriture).values({
      ecritureId: brouillonSonde.id,
      compteId: c601.id,
      debit: "100.00",
      credit: "100.00", // débit ET crédit : interdit
    }),
  );
  egal("une ligne ne peut porter débit et crédit (23514)", codeSens, "23514");

  const codeNegatif = await attendreRefus(() =>
    db.insert(cptaLignesEcriture).values({
      ecritureId: brouillonSonde.id,
      compteId: c601.id,
      debit: "-100.00",
      credit: "0.00",
    }),
  );
  egal("un montant négatif est refusé (23514)", codeNegatif, "23514");

  const codeBrouillonNumerote = await attendreRefus(() =>
    db
      .update(cptaEcritures)
      .set({ numeroPiece: "OD2026-00001" })
      .where(eq(cptaEcritures.id, brouillonSonde.id)),
  );
  egal(
    "un brouillon ne peut pas porter de numéro de pièce (23514)",
    codeBrouillonNumerote,
    "23514",
  );

  await db.delete(cptaEcritures).where(eq(cptaEcritures.id, brouillonSonde.id));

  // -------------------------------------------------------------------------
  console.log("\n3. Validation d'écriture");

  const achat = (date: string) => ({
    exerciceId: exercice.id,
    journalId: journalParCode.get("AC")!.id,
    dateEcriture: date,
    libelle: `Facture fournisseur du ${date}`,
    lignes: [
      { compteId: c601.id, debit: "10000.00" },
      { compteId: c4452.id, debit: "1925.00" },
      { compteId: c401.id, tiersId: tiers.id, credit: "11925.00" },
    ],
  });

  const desequilibre = await creerBrouillon(
    {
      ...achat("2026-03-01"),
      lignes: [
        { compteId: c601.id, debit: "10000.00" },
        { compteId: c401.id, tiersId: tiers.id, credit: "9000.00" },
      ],
    },
    null,
  );
  const codeDesequilibre = await attendreRefus(() =>
    validerEcritureEnBase(desequilibre.id, null),
  );
  egal("écriture déséquilibrée refusée", codeDesequilibre, "ecriture_invalide");

  const sansTiers = await creerBrouillon(
    {
      ...achat("2026-03-02"),
      lignes: [
        { compteId: c601.id, debit: "100.00" },
        { compteId: c401.id, credit: "100.00" }, // compte collectif sans tiers
      ],
    },
    null,
  );
  egal(
    "compte collectif sans tiers refusé",
    await attendreRefus(() => validerEcritureEnBase(sansTiers.id, null)),
    "ecriture_invalide",
  );

  const horsExercice = await creerBrouillon(
    { ...achat("2026-03-03"), dateEcriture: "2025-12-31" },
    null,
  );
  egal(
    "date hors exercice refusée",
    await attendreRefus(() => validerEcritureEnBase(horsExercice.id, null)),
    "ecriture_invalide",
  );

  const premiere = await creerBrouillon(achat("2026-03-15"), null);
  const validee = await validerEcritureEnBase(premiere.id, null);
  egal("première pièce numérotée", validee.numeroPiece, "AC2026-00001");
  egal("statut validé", validee.statut, "VALIDEE");
  verifier("date de validation renseignée", validee.valideLe !== null);

  const seconde = await creerBrouillon(achat("2026-03-16"), null);
  const validee2 = await validerEcritureEnBase(seconde.id, null);
  egal("deuxième pièce numérotée à la suite", validee2.numeroPiece, "AC2026-00002");

  egal(
    "une écriture validée ne se modifie plus",
    await attendreRefus(() =>
      modifierBrouillon(validee.id, {
        journalId: journalParCode.get("AC")!.id,
        dateEcriture: "2026-04-01",
        libelle: "Tentative de modification",
        lignes: [],
      }),
    ),
    "conflict",
  );

  egal(
    "une écriture ne se valide pas deux fois",
    await attendreRefus(() => validerEcritureEnBase(validee.id, null)),
    "conflict",
  );

  // -------------------------------------------------------------------------
  console.log("\n4. Numérotation sous validations simultanées");

  // Le cœur de la vérification : vingt écritures validées en parallèle, sur
  // des connexions distinctes du pool. Un SELECT suivi d'un UPDATE produirait
  // ici des doublons ; l'UPSERT atomique ne le peut pas.
  const N = 20;
  const brouillons = [];
  for (let i = 0; i < N; i++) {
    brouillons.push(await creerBrouillon(achat("2026-05-02"), null));
  }

  const validees = await Promise.all(
    brouillons.map((b) => validerEcritureEnBase(b.id, null)),
  );

  const numeros = validees.map((v) => v.numeroPiece!);
  const distincts = new Set(numeros);
  egal(`${N} validations simultanées, ${N} numéros distincts`, distincts.size, N);

  const suffixes = numeros
    .map((n) => Number(n.split("-")[1]))
    .sort((a, b) => a - b);
  const attendus = Array.from({ length: N }, (_, i) => i + 3); // après 1 et 2
  verifier(
    "série continue, sans trou ni doublon",
    JSON.stringify(suffixes) === JSON.stringify(attendus),
    `obtenu ${suffixes.join(",")}`,
  );

  // Un échec de validation ne doit pas consommer de numéro.
  const [avant] = await db
    .select({ n: cptaSequences.dernierNumero })
    .from(cptaSequences)
    .where(
      and(
        eq(cptaSequences.exerciceId, exercice.id),
        eq(cptaSequences.journalId, journalParCode.get("AC")!.id),
      ),
    );
  const rate = await creerBrouillon(
    {
      ...achat("2026-05-03"),
      lignes: [
        { compteId: c601.id, debit: "100.00" },
        { compteId: c401.id, tiersId: tiers.id, credit: "80.00" },
      ],
    },
    null,
  );
  await attendreRefus(() => validerEcritureEnBase(rate.id, null));
  const [apres] = await db
    .select({ n: cptaSequences.dernierNumero })
    .from(cptaSequences)
    .where(
      and(
        eq(cptaSequences.exerciceId, exercice.id),
        eq(cptaSequences.journalId, journalParCode.get("AC")!.id),
      ),
    );
  egal("une validation refusée ne consomme aucun numéro", apres.n, avant.n);

  // -------------------------------------------------------------------------
  console.log("\n5. Contre-passation");

  const balanceAvant = await getBalance(exercice.id);
  const contre = await contrepasserEcriture(validee2.id, null, "2026-06-01");
  const [origineApres] = await db
    .select()
    .from(cptaEcritures)
    .where(eq(cptaEcritures.id, validee2.id));

  egal("l'origine passe à CONTREPASSEE", origineApres.statut, "CONTREPASSEE");
  verifier("la contre-passation est numérotée", contre.numeroPiece !== null);
  egal("elle référence l'écriture d'origine", contre.contrepasseEcritureId, validee2.id);

  const balanceApres = await getBalance(exercice.id);
  const soldeAchats = (b: Awaited<ReturnType<typeof getBalance>>) =>
    b.lignes.find((l) => l.compteNumero === "601")!.soldeDebiteur;

  egal(
    "le solde du 601 revient de la valeur de l'écriture annulée",
    soldeAchats(balanceAvant) - soldeAchats(balanceApres),
    parseMontant("10000"),
  );
  verifier("la balance reste équilibrée", balanceApres.totaux.equilibree);

  // -------------------------------------------------------------------------
  console.log("\n6. Lettrage");

  const reglement = await creerBrouillon(
    {
      exerciceId: exercice.id,
      journalId: journalParCode.get("BQ")!.id,
      dateEcriture: "2026-04-10",
      libelle: "Règlement fournisseur",
      lignes: [
        { compteId: c401.id, tiersId: tiers.id, debit: "11925.00" },
        { compteId: c521.id, credit: "11925.00" },
      ],
    },
    null,
  );
  const reglementValide = await validerEcritureEnBase(reglement.id, null);

  // On désigne précisément les deux lignes à apparier — celle du 401 dans la
  // facture, celle du 401 dans le règlement — plutôt que de les deviner par
  // leur montant : le compte 401 porte à ce stade une vingtaine de lignes du
  // même montant, et un appariement approximatif ne prouverait rien.
  const ligneDu401 = async (ecritureId: number) => {
    const [l] = await db
      .select({ id: cptaLignesEcriture.id, credit: cptaLignesEcriture.credit })
      .from(cptaLignesEcriture)
      .where(
        and(
          eq(cptaLignesEcriture.ecritureId, ecritureId),
          eq(cptaLignesEcriture.compteId, c401.id),
        ),
      );
    return l;
  };

  const ligneFacture = await ligneDu401(validee.id);
  const ligneReglement = await ligneDu401(reglementValide.id);

  const lettrage = await lettrerLignes(
    c401.id,
    [ligneFacture.id, ligneReglement.id],
    null,
  );
  egal("premier code de lettrage", lettrage.code, "A");

  const [ligneApres] = await db
    .select({ lettrage: cptaLignesEcriture.lettrage })
    .from(cptaLignesEcriture)
    .where(eq(cptaLignesEcriture.id, ligneReglement.id));
  egal("le code est posé sur la ligne", ligneApres.lettrage, "A");

  // Deux lignes au crédit ne se compensent pas : le lettrage doit être refusé,
  // faute de quoi une dette réelle disparaîtrait des postes ouverts.
  const autreFacture = await ligneDu401(validees[0].id);
  const autreFacture2 = await ligneDu401(validees[1].id);
  egal(
    "un groupe qui ne se solde pas est refusé",
    await attendreRefus(() =>
      lettrerLignes(c401.id, [autreFacture.id, autreFacture2.id], null),
    ),
    "lettrage_invalide",
  );

  egal(
    "une ligne déjà lettrée ne se relettre pas",
    await attendreRefus(() =>
      lettrerLignes(c401.id, [ligneFacture.id, ligneReglement.id], null),
    ),
    "lettrage_invalide",
  );

  egal(
    "un compte non lettrable refuse le lettrage",
    await attendreRefus(() => lettrerLignes(c601.id, [1, 2], null)),
    "conflict",
  );

  // -------------------------------------------------------------------------
  console.log("\n7. Balance générale");

  const balance = await getBalance(exercice.id);
  verifier("balance équilibrée", balance.totaux.equilibree);
  egal(
    "total débit = total crédit",
    balance.totaux.totalDebit,
    balance.totaux.totalCredit,
  );
  console.log(
    `       total mouvementé : ${formatMontantAffichage(balance.totaux.totalDebit)}`,
  );
  console.log(`       comptes mouvementés : ${balance.lignes.length}`);

  // -------------------------------------------------------------------------
  await nettoyer();

  console.log(`\n=== ${reussis} vérifications réussies, ${echoues} échouées ===\n`);
  if (echoues > 0) process.exitCode = 1;
}

/** Supprime toute trace du contribuable témoin, dans l'ordre des dépendances. */
async function nettoyer() {
  const temoins = await db
    .select({ id: contribuables.id })
    .from(contribuables)
    .where(eq(contribuables.nom, NOM_TEMOIN));
  if (temoins.length === 0) return;

  for (const { id } of temoins) {
    const exercices = await db
      .select({ id: cptaExercices.id })
      .from(cptaExercices)
      .where(eq(cptaExercices.contribuableId, id));

    for (const ex of exercices) {
      await db.delete(cptaSequences).where(eq(cptaSequences.exerciceId, ex.id));
      // Les lignes suivent les écritures par ON DELETE CASCADE ; il faut
      // d'abord détacher les contre-passations, qui se référencent entre elles.
      await db
        .update(cptaEcritures)
        .set({ contrepasseEcritureId: null })
        .where(eq(cptaEcritures.exerciceId, ex.id));
      await db.delete(cptaEcritures).where(eq(cptaEcritures.exerciceId, ex.id));
    }

    const comptesDu = await db
      .select({ id: cptaComptes.id })
      .from(cptaComptes)
      .where(eq(cptaComptes.contribuableId, id));
    for (const c of comptesDu) {
      await db.delete(cptaLettrages).where(eq(cptaLettrages.compteId, c.id));
    }

    await db.delete(cptaExercices).where(eq(cptaExercices.contribuableId, id));
    await db.delete(cptaTaxes).where(eq(cptaTaxes.contribuableId, id));
    await db.delete(cptaJournaux).where(eq(cptaJournaux.contribuableId, id));
    await db.delete(cptaTiers).where(eq(cptaTiers.contribuableId, id));
    await db.delete(cptaComptes).where(eq(cptaComptes.contribuableId, id));
    await db.delete(contribuables).where(eq(contribuables.id, id));
  }
}

main()
  .catch((e) => {
    console.error("\nInterrompu :", e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
