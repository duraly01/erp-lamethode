import "dotenv/config";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Diagnostic de connexion à la base — à lancer AVANT toute migration.
//
//   npm run db:check
//
// Vérifie que la base est joignable, affiche son état et ce que la migration
// 0002 va convertir. N'écrit rien.
// ---------------------------------------------------------------------------

const url = process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;

/** Masque le mot de passe : cette sortie peut être copiée dans un ticket. */
function urlMasquee(u: string): string {
  return u.replace(/:\/\/([^:@/]+):[^@]*@/, "://$1:***@");
}

async function main() {
  if (!url) {
    console.error(
      "❌ Ni DATABASE_URL_MIGRATION ni DATABASE_URL n'est défini dans .env",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`🔌 Connexion à ${urlMasquee(url)}`);

  // `sslmode` est retiré de l'URL : les versions récentes du pilote le
  // traitent comme `verify-full`, ce qui échoue sur les certificats
  // auto-signés des hébergeurs mutualisés. On chiffre la liaison en passant
  // l'option explicitement, sans exiger une chaîne de confiance vérifiable.
  const veutSsl = /sslmode=(require|verify|prefer)/.test(url);
  const urlSansSslmode = url.replace(/[?&]sslmode=[^&]*/g, (m) =>
    m.startsWith("?") ? "?" : "",
  );

  const pool = new Pool({
    connectionString: urlSansSslmode,
    connectionTimeoutMillis: 10_000,
    ssl: veutSsl ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const { rows: info } = await pool.query<{
      version: string;
      base: string;
      utilisateur: string;
    }>(
      "select version() as version, current_database() as base, current_user as utilisateur",
    );
    console.log(`✅ Connecté — base « ${info[0].base} », rôle « ${info[0].utilisateur} »`);
    console.log(`   ${info[0].version.split(",")[0]}`);

    // --- Migrations déjà appliquées ---------------------------------------
    const { rows: migrations } = await pool.query<{ hash: string; created_at: string }>(
      `select hash, to_timestamp(created_at / 1000)::text as created_at
         from drizzle.__drizzle_migrations
        order by created_at`,
    ).catch(() => ({ rows: [] as { hash: string; created_at: string }[] }));

    console.log(`\n📜 Migrations appliquées : ${migrations.length}`);
    for (const m of migrations) {
      console.log(`   • ${m.created_at}  ${m.hash.slice(0, 12)}…`);
    }

    // --- État avant migration ---------------------------------------------
    const { rows: tables } = await pool.query<{ n: string }>(
      "select count(*)::text as n from information_schema.tables where table_schema = 'public'",
    );
    console.log(`\n🗂  Tables dans « public » : ${tables[0].n}`);

    const contribuables = await pool
      .query<{ regime: string; n: string }>(
        "select regime_fiscal::text as regime, count(*)::text as n from contribuables group by 1 order by 1",
      )
      .catch(() => null);

    if (contribuables) {
      const total = contribuables.rows.reduce((s, r) => s + Number(r.n), 0);
      console.log(`\n👥 Contribuables : ${total}`);
      for (const r of contribuables.rows) {
        console.log(`   • ${r.regime.padEnd(12)} ${r.n}`);
      }
      const aConvertir = contribuables.rows
        .filter((r) => r.regime === "SIMPLIFIE" || r.regime === "IFU")
        .reduce((s, r) => s + Number(r.n), 0);
      console.log(
        aConvertir > 0
          ? `\n⚠️  ${aConvertir} contribuable(s) SIMPLIFIE/IFU seront convertis en IGS (classe à renseigner ensuite).`
          : "\n✔️  Aucun contribuable SIMPLIFIE/IFU : la conversion de régime n'aura rien à reprendre.",
      );
    } else {
      console.log(
        "\nℹ️  Table `contribuables` absente ou colonne déjà migrée — voir les migrations ci-dessus.",
      );
    }

    console.log("\n👉 Si tout est cohérent : sauvegardez, puis `npm run db:migrate`.");
  } catch (err) {
    const e = err as { code?: string; message?: string };
    console.error(`\n❌ Échec : ${e.message ?? String(err)}`);
    if (e.code === "ETIMEDOUT" || e.code === "ECONNREFUSED") {
      console.error(
        "   → Le port 5432 n'est pas joignable. Vérifiez que votre IP publique est\n" +
          "     autorisée dans cPanel (Remote Database Access) et que l'hébergeur\n" +
          "     expose bien PostgreSQL vers l'extérieur.",
      );
    }
    if (e.code === "28P01") {
      console.error("   → Identifiants refusés : vérifiez utilisateur et mot de passe.");
    }
    if (e.code === "3D000") {
      console.error("   → Base inconnue : vérifiez le nom en fin d'URL.");
    }
    if (/self.signed|certificate/i.test(e.message ?? "")) {
      console.error("   → Certificat TLS : ajoutez `?sslmode=require` à la fin de l'URL.");
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
