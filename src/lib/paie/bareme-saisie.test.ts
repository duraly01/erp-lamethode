import { describe, it, expect } from "vitest";
import { BAREME_PAIE_DEFAUT, verifierBareme } from "./bareme";
import { dateNouvelleVersion, depuisSaisie, ecrireNombre, lireNombre, versSaisie } from "./bareme-saisie";

const bareme = BAREME_PAIE_DEFAUT[0];

describe("saisie du barème de paie", () => {
  it("fait l'aller-retour sans rien perdre", () => {
    const { bareme: relu, erreurs } = depuisSaisie(versSaisie(bareme));
    expect(erreurs).toEqual([]);
    expect(relu).toEqual(bareme);
    expect(verifierBareme(relu)).toEqual([]);
  });

  it("présente les tranches ouvertes vides et les relit ouvertes", () => {
    const saisi = versSaisie(bareme);
    const derniere = saisi.irpp.tranchesAnnuelles[saisi.irpp.tranchesAnnuelles.length - 1];
    expect(derniere.jusqua).toBe("");
    expect(depuisSaisie(saisi).bareme.irpp.tranchesAnnuelles.at(-1)?.jusqua).toBeNull();
  });

  it("écrit les nombres comme le cabinet les lit", () => {
    expect(ecrireNombre(750_000)).toBe("750 000");
    expect(ecrireNombre(4.2)).toBe("4,2");
    expect(ecrireNombre(62_000)).toBe("62 000");
    expect(ecrireNombre(35)).toBe("35");
    expect(versSaisie(bareme).cnps.plafondMensuel).toBe("750 000");
  });

  it("lit les nombres comme le cabinet les écrit", () => {
    expect(lireNombre("750 000")).toBe(750_000);
    expect(lireNombre("750 000")).toBe(750_000);
    expect(lireNombre("5,65")).toBe(5.65);
    expect(lireNombre("4.2")).toBe(4.2);
    expect(lireNombre("")).toBeNull();
    expect(lireNombre("abc")).toBeNull();
    expect(lireNombre("-5")).toBeNull();
  });

  it("nomme chaque champ fautif, tous d'un coup", () => {
    const saisi = versSaisie(bareme);
    saisi.cnps.plafondMensuel = "";
    saisi.cnps.prestationsFamiliales.AGRICOLE = "x";
    saisi.irpp.tranchesAnnuelles[1].taux = "150";
    saisi.tdl[2].montant = "250,5";
    const { erreurs } = depuisSaisie(saisi);
    expect(erreurs).toHaveLength(4);
    expect(erreurs.join(" ")).toMatch(/plafond mensuel : nombre attendu/);
    expect(erreurs.join(" ")).toMatch(/Régime agricole : nombre attendu/);
    expect(erreurs.join(" ")).toMatch(/IRPP — tranche 2, taux : un taux ne dépasse pas 100/);
    expect(erreurs.join(" ")).toMatch(/TDL — tranche 3, montant : montant entier/);
  });

  it("une nouvelle version se date au 1er janvier suivant", () => {
    expect(dateNouvelleVersion("2026-09-11")).toBe("2027-01-01");
    expect(dateNouvelleVersion("2026-12-31")).toBe("2027-01-01");
  });
});
