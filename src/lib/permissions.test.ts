import { describe, it, expect } from "vitest";
import {
  hasPermission,
  isAccesTotal,
  toMatrice,
  fromMatrice,
  ACTIONS,
  RESSOURCES,
  PERMISSION_TOTALE,
} from "@/lib/permissions";
import type { RolePermission } from "@/db/schema";

const ADMIN: RolePermission[] = [{ ressource: "*", actions: ["*"] }];
const COLLAB: RolePermission[] = [
  { ressource: "contribuables", actions: ["read", "update"] },
  { ressource: "declarations", actions: ["read", "create"] },
];

describe("hasPermission (RBAC)", () => {
  it("le joker admin autorise tout", () => {
    expect(hasPermission(ADMIN, "users", "delete")).toBe(true);
    expect(hasPermission(ADMIN, "n_importe_quoi", "create")).toBe(true);
  });

  it("permission spécifique accordée", () => {
    expect(hasPermission(COLLAB, "contribuables", "update")).toBe(true);
    expect(hasPermission(COLLAB, "declarations", "create")).toBe(true);
  });

  it("action non accordée refusée", () => {
    expect(hasPermission(COLLAB, "contribuables", "delete")).toBe(false);
    expect(hasPermission(COLLAB, "declarations", "delete")).toBe(false);
  });

  it("ressource non couverte refusée", () => {
    expect(hasPermission(COLLAB, "users", "read")).toBe(false);
  });

  it("permissions vides ou absentes → refus", () => {
    expect(hasPermission([], "contribuables", "read")).toBe(false);
    expect(hasPermission(undefined, "contribuables", "read")).toBe(false);
  });

  it("joker d'action sur une ressource précise", () => {
    const p: RolePermission[] = [{ ressource: "acf", actions: ["*"] }];
    expect(hasPermission(p, "acf", "delete")).toBe(true);
    expect(hasPermission(p, "cnps", "read")).toBe(false);
  });
});

describe("isAccesTotal", () => {
  it("reconnaît le super-administrateur", () => {
    expect(isAccesTotal(ADMIN)).toBe(true);
  });

  it("un joker d'action seul ne vaut pas accès total", () => {
    expect(isAccesTotal([{ ressource: "acf", actions: ["*"] }])).toBe(false);
    expect(isAccesTotal(COLLAB)).toBe(false);
    expect(isAccesTotal(undefined)).toBe(false);
  });
});

describe("matrice de permissions", () => {
  it("traduit les permissions en cases cochées", () => {
    const m = toMatrice(COLLAB);
    expect(m.contribuables).toEqual(["read", "update"]);
    expect(m.declarations).toEqual(["read", "create"]);
    expect(m.users).toEqual([]);
  });

  it("coche tout pour un accès total", () => {
    const m = toMatrice(ADMIN);
    for (const r of RESSOURCES) expect(m[r.cle]).toEqual(ACTIONS);
  });

  it("fait l'aller-retour sans perte", () => {
    expect(fromMatrice(toMatrice(COLLAB))).toEqual([
      { ressource: "contribuables", actions: ["read", "update"] },
      { ressource: "declarations", actions: ["read", "create"] },
    ]);
  });

  it("omet les ressources sans aucun droit", () => {
    const permissions = fromMatrice(toMatrice([]));
    expect(permissions).toEqual([]);
  });

  it("le catalogue couvre les ressources gardées par l'API", () => {
    // Garde-fou : une ressource protégée mais absente du catalogue ne serait
    // accordable depuis aucun écran.
    const cles = RESSOURCES.map((r) => r.cle);
    for (const attendue of [
      "contribuables",
      "declarations",
      "cnps",
      "acf",
      "documents",
      "users",
      "roles",
      "parametres",
      "analytics",
    ]) {
      expect(cles).toContain(attendue);
    }
  });

  it("la permission totale est bien reconnue par hasPermission", () => {
    expect(hasPermission(PERMISSION_TOTALE, "roles", "update")).toBe(true);
  });
});
