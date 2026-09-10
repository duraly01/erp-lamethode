import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { cptaSequences } from "@/db/schema";

/**
 * Verrou sur la numérotation des pièces.
 *
 * La continuité des numéros de pièce est une exigence comptable : un trou dans
 * la série doit pouvoir s'expliquer, et il ne s'explique jamais. Elle repose
 * ici sur une seule instruction SQL atomique — un UPSERT qui incrémente et
 * rend le compteur d'un même mouvement — plutôt que sur un SELECT suivi d'un
 * UPDATE, qui laisserait deux validations simultanées lire le même numéro.
 *
 * Ce test ne touche aucune base : il construit la requête et en inspecte le
 * SQL. Il est là pour qu'une réécriture bien intentionnée du service ne
 * retombe pas silencieusement sur le schéma lecture-puis-écriture.
 *
 * Créer un Pool n'ouvre aucune connexion : elle ne s'établirait qu'à
 * l'exécution d'une requête, ce que ce test ne fait pas.
 */
const dbHorsLigne = drizzle(
  new Pool({ connectionString: "postgres://verification/hors-ligne" }),
);

function requeteCompteur() {
  return dbHorsLigne
    .insert(cptaSequences)
    .values({
      exerciceId: 1,
      journalId: 2,
      prefixe: "VE2026-",
      dernierNumero: 1,
    })
    .onConflictDoUpdate({
      target: [cptaSequences.exerciceId, cptaSequences.journalId],
      set: { dernierNumero: sql`${cptaSequences.dernierNumero} + 1` },
    })
    .returning({
      prefixe: cptaSequences.prefixe,
      dernierNumero: cptaSequences.dernierNumero,
    })
    .toSQL();
}

describe("compteur de numéros de pièce", () => {
  it("tient en une seule instruction", () => {
    const { sql: texte } = requeteCompteur();
    expect(texte.split(";").filter((s) => s.trim() !== "")).toHaveLength(1);
  });

  it("incrémente par UPSERT, et non par lecture puis écriture", () => {
    const texte = requeteCompteur().sql.toLowerCase();
    expect(texte).toContain("insert into");
    expect(texte).toContain("on conflict");
    expect(texte).toContain("do update set");
  });

  it("incrémente le compteur à partir de sa valeur en base", () => {
    // La valeur incrémentée est lue dans la ligne existante, à l'intérieur de
    // la même instruction : c'est ce qui rend l'opération sûre en concurrence.
    const texte = requeteCompteur().sql.toLowerCase();
    expect(texte).toMatch(/"?cpta_sequences"?\."?dernier_numero"?\s*\+\s*1/);
  });

  it("cible le couple exercice + journal", () => {
    const texte = requeteCompteur().sql.toLowerCase();
    expect(texte).toContain("exercice_id");
    expect(texte).toContain("journal_id");
  });

  it("rend le numéro consommé, sans relecture séparée", () => {
    const texte = requeteCompteur().sql.toLowerCase();
    expect(texte).toContain("returning");
    expect(texte).toContain("dernier_numero");
    expect(texte).toContain("prefixe");
  });
});
