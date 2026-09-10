// ---------------------------------------------------------------------------
// Pourquoi l'écran Facturation est-il vide ?
//
//   npm run db:facturation
//
// Établit les faits avant toute correction : combien de factures existent, et
// de quoi l'ERP dispose pour en proposer les lignes (honoraires convenus,
// échéances chiffrées, paramètres du cabinet). Lecture seule : n'écrit rien.
// ---------------------------------------------------------------------------

import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL absent de l'environnement.");
  process.exit(1);
}

const veutSsl = /sslmode=(require|verify|prefer)/.test(url);
const pool = new pg.Pool({
  connectionString: url.replace(/[?&]sslmode=[^&]*/g, (m) =>
    m.startsWith("?") ? "?" : "",
  ),
  ssl: veutSsl ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 15_000,
  max: 1,
});

const un = async (sql, params) => (await pool.query(sql, params)).rows[0];

/** Période du mois écoulé, au format AAAA-MM. */
function moisEcoule() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  const periode = moisEcoule();

  // --- Les factures ---------------------------------------------------------
  console.log("\n── FACTURES ───────────────────────────────────────");
  const f = await un(`select count(*)::int as total from factures`);
  console.log(`   factures en base : ${f.total}`);
  if (f.total > 0) {
    const { rows } = await pool.query(
      `select statut, count(*)::int as n from factures group by statut order by statut`,
    );
    for (const r of rows) console.log(`      ${r.statut.padEnd(12)} ${r.n}`);
  } else {
    console.log(
      "   → L'écran affiche « Aucune facture. » : il est vide parce qu'aucune",
    );
    console.log("     facture n'a encore été créée, non parce qu'il est en panne.");
  }

  // --- De quoi remplir les lignes ------------------------------------------
  console.log("\n── HONORAIRES CONVENUS ────────────────────────────");
  const h = await un(
    `select count(*)::int as actifs,
            count(*) filter (where honoraire_mensuel is not null
                               and honoraire_mensuel > 0)::int as avec,
            coalesce(sum(honoraire_mensuel), 0)::numeric as cumul
       from contribuables
      where deleted_at is null and actif = true`,
  );
  console.log(`   contribuables actifs        : ${h.actifs}`);
  console.log(`   avec un honoraire mensuel   : ${h.avec}`);
  console.log(`   sans honoraire mensuel      : ${h.actifs - h.avec}`);
  if (h.avec > 0) {
    console.log(`   cumul mensuel facturable    : ${Number(h.cumul).toLocaleString("fr-FR")} FCFA`);
  }
  if (h.avec === 0) {
    console.log(
      "   ⚠️  Aucun honoraire n'est enregistré : le formulaire de facture ne peut",
    );
    console.log(
      "      rien proposer, et la génération mensuelle ne produirait rien.",
    );
  }

  // --- Refacturation des impôts et cotisations ------------------------------
  console.log(`\n── ÉCHÉANCES CHIFFRÉES — période ${periode} ─────────`);
  const d = await un(
    `select count(*)::int as total,
            count(*) filter (where montant is not null and montant > 0)::int as chiffrees
       from declarations where periode = $1`,
    [periode],
  );
  console.log(`   déclarations sur la période : ${d.total}`);
  console.log(`   dont un montant renseigné   : ${d.chiffrees}`);

  // --- Paramètres du cabinet ------------------------------------------------
  console.log("\n── PARAMÈTRES DE FACTURATION ──────────────────────");
  const { rows: params } = await pool.query(
    `select cle, valeur from parametres
      where cle in ('cabinet_identite','facturation_numerotation','facturation_delai_paiement')
      order by cle`,
  );
  const attendus = [
    "cabinet_identite",
    "facturation_delai_paiement",
    "facturation_numerotation",
  ];
  for (const cle of attendus) {
    const p = params.find((x) => x.cle === cle);
    console.log(
      p
        ? `   ✅ ${cle.padEnd(28)} ${JSON.stringify(p.valeur).slice(0, 60)}`
        : `   ❌ ${cle.padEnd(28)} absent`,
    );
  }

  // --- Verdict --------------------------------------------------------------
  console.log("\n── VERDICT ────────────────────────────────────────");
  if (f.total === 0 && h.avec === 0) {
    console.log(
      "   L'écran est vide et le restera : aucune facture, et aucun honoraire",
    );
    console.log(
      "   convenu à partir duquel en proposer une. Il faut d'abord renseigner",
    );
    console.log("   les honoraires sur les fiches contribuables.");
  } else if (f.total === 0) {
    console.log(
      `   Aucune facture créée à ce jour, mais ${h.avec} contribuable(s) ont un`,
    );
    console.log("   honoraire convenu : la génération mensuelle a de quoi travailler.");
  } else {
    console.log(`   ${f.total} facture(s) en base — l'écran devrait les afficher.`);
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
