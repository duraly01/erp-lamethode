import { describe, it, expect } from "vitest";
import { listQuerySchema } from "@/lib/schemas/common";
import {
  contribuableCreateSchema,
} from "@/lib/schemas/contribuables";
import { declarationCreateSchema } from "@/lib/schemas/declarations";
import { factureCreateSchema } from "@/lib/schemas/factures";

describe("contribuableCreateSchema", () => {
  it("accepte un contribuable minimal et applique les défauts", () => {
    const r = contribuableCreateSchema.parse({ nom: "ACME SARL" });
    expect(r.regimeFiscal).toBe("REEL");
    expect(r.actif).toBe(true);
    expect(r.niu).toBeNull();
  });

  it("rejette un nom vide", () => {
    expect(contribuableCreateSchema.safeParse({ nom: "" }).success).toBe(false);
  });

  it("rejette un email invalide", () => {
    expect(
      contribuableCreateSchema.safeParse({ nom: "X", email: "pas-un-email" })
        .success,
    ).toBe(false);
  });

  it("email vide est normalisé en null", () => {
    const r = contribuableCreateSchema.parse({ nom: "X", email: "" });
    expect(r.email).toBeNull();
  });

  it("rejette un régime inconnu", () => {
    expect(
      contribuableCreateSchema.safeParse({ nom: "X", regimeFiscal: "AUTRE" })
        .success,
    ).toBe(false);
  });
});

describe("listQuerySchema", () => {
  it("applique les défauts", () => {
    const r = listQuerySchema.parse({});
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(20);
    expect(r.order).toBe("desc");
  });

  it("coerce les chaînes en nombres", () => {
    const r = listQuerySchema.parse({ page: "3", pageSize: "50" });
    expect(r.page).toBe(3);
    expect(r.pageSize).toBe(50);
  });

  it("borne pageSize à 100", () => {
    expect(listQuerySchema.safeParse({ pageSize: "500" }).success).toBe(false);
  });

  it("refuse un ordre invalide", () => {
    expect(listQuerySchema.safeParse({ order: "sideways" }).success).toBe(false);
  });
});

describe("declarationCreateSchema", () => {
  const valid = {
    contribuableId: 1,
    type: "TVA" as const,
    periodicite: "MENSUELLE" as const,
    periode: "2026-01",
    dateEcheance: "2026-02-15",
  };

  it("accepte une déclaration valide + statut par défaut", () => {
    const r = declarationCreateSchema.parse(valid);
    expect(r.statut).toBe("A_FAIRE");
  });

  it("rejette une date mal formée (jj/mm/aaaa)", () => {
    expect(
      declarationCreateSchema.safeParse({
        ...valid,
        dateEcheance: "15/02/2026",
      }).success,
    ).toBe(false);
  });

  it("convertit le montant number en chaîne à 2 décimales", () => {
    const r = declarationCreateSchema.parse({ ...valid, montant: 1500 });
    expect(r.montant).toBe("1500.00");
  });

  it("rejette un contribuableId non entier positif", () => {
    expect(
      declarationCreateSchema.safeParse({ ...valid, contribuableId: -3 }).success,
    ).toBe(false);
  });
});

describe("contribuableCreateSchema — paramètres de facturation", () => {
  it("laisse vides les paramètres non convenus avec le client", () => {
    const r = contribuableCreateSchema.parse({ nom: "ACME SARL" });
    expect(r.remisePct).toBeNull();
    expect(r.delaiPaiementJours).toBeNull();
    expect(r.adresseFacturation).toBeNull();
  });

  it("n'active jamais la facturation automatique par défaut", () => {
    const r = contribuableCreateSchema.parse({ nom: "ACME SARL" });
    expect(r.facturationAuto).toBe(false);
  });

  it("rejette une remise supérieure à 100 %", () => {
    expect(
      contribuableCreateSchema.safeParse({ nom: "ACME", remisePct: 120 })
        .success,
    ).toBe(false);
  });

  it("rejette un délai de paiement nul ou négatif", () => {
    expect(
      contribuableCreateSchema.safeParse({ nom: "ACME", delaiPaiementJours: 0 })
        .success,
    ).toBe(false);
  });
});

describe("factureCreateSchema", () => {
  const base = {
    contribuableId: 1,
    periode: "2026-07",
    dateEmission: "2026-08-27",
  };

  it("accepte une ligne négative : c'est ainsi qu'on porte une remise", () => {
    const r = factureCreateSchema.parse({
      ...base,
      lignes: [
        { categorie: "HONORAIRES", libelle: "Honoraires", montantHt: 375000 },
        {
          categorie: "HONORAIRES",
          libelle: "Remise commerciale — 10 %",
          montantHt: -37500,
        },
      ],
    });
    expect(r.lignes[1].montantHt).toBe(-37500);
  });

  it("rejette une ligne sans libellé", () => {
    expect(
      factureCreateSchema.safeParse({
        ...base,
        lignes: [{ libelle: "", montantHt: 1000 }],
      }).success,
    ).toBe(false);
  });
});
