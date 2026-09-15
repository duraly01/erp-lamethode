import "dotenv/config";
import bcrypt from "bcryptjs";
import { db, pool } from "./index";
import { COMPTES_DEMO, DEMO_PASSWORD } from "../lib/demo-accounts";
import {
  roles,
  users,
  parametres,
  contribuables,
  declarations,
  acfSuivis,
  cnpsCotisations,
  documents,
  penalites,
  notifications,
  auditLog,
  type RolePermission,
} from "./schema";
import {
  defaultEcheanceMensuelle,
  echeanceAnnuelle,
  obligationsPourRegime,
  type StatutDeclaration,
} from "../lib/constants";
import {
  IGS_BAREME_DEFAUT,
  echeancesAnnee,
  montantTrimestriel,
} from "../lib/igs";
import { IDENTITE_CABINET_DEFAUT } from "../lib/facturation";
import { BAREME_PAIE_DEFAUT } from "../lib/paie/bareme";

// ---------------------------------------------------------------------------
// Données de démonstration — Cabinet LaMethode SARL
// Idempotent : purge les tables puis réinsère un jeu cohérent.
// Lancer avec :  npm run db:seed
// ---------------------------------------------------------------------------

const ALL: RolePermission[] = [{ ressource: "*", actions: ["*"] }];

const PERMS_MANAGER: RolePermission[] = [
  { ressource: "contribuables", actions: ["read", "create", "update", "delete"] },
  { ressource: "declarations", actions: ["read", "create", "update", "delete"] },
  { ressource: "cnps", actions: ["read", "create", "update", "delete"] },
  { ressource: "acf", actions: ["read", "create", "update", "delete"] },
  { ressource: "documents", actions: ["read", "create", "update", "delete"] },
  { ressource: "factures", actions: ["read", "create", "update", "delete"] },
  // Le manager tient les livres jusqu'à la clôture, qui relève de « delete ».
  { ressource: "comptabilite", actions: ["read", "create", "update", "delete"] },
  { ressource: "paie", actions: ["read", "create", "update", "delete"] },
  { ressource: "analytics", actions: ["read"] },
];

const PERMS_COLLAB: RolePermission[] = [
  { ressource: "contribuables", actions: ["read", "update"] },
  { ressource: "declarations", actions: ["read", "create", "update"] },
  { ressource: "cnps", actions: ["read", "create", "update"] },
  { ressource: "acf", actions: ["read", "create", "update"] },
  { ressource: "documents", actions: ["read", "create"] },
  // Le collaborateur prépare les factures ; l'émission relève du manager.
  { ressource: "factures", actions: ["read", "create", "update"] },
  // Le collaborateur saisit, valide et lettre ; contre-passer et clôturer relèvent du manager.
  { ressource: "comptabilite", actions: ["read", "create", "update"] },
  { ressource: "paie", actions: ["read", "create", "update"] },
];

const PERMS_LECTURE: RolePermission[] = [
  { ressource: "contribuables", actions: ["read"] },
  { ressource: "declarations", actions: ["read"] },
  { ressource: "analytics", actions: ["read"] },
];

const ANNEE = 2026;

// Les comptes de démonstration et leur mot de passe sont déclarés dans
// `src/lib/demo-accounts.ts`, d'où la page de connexion les lit également :
// une seule source, pour que les deux ne divergent plus.

async function purge() {
  // Ordre enfants -> parents (respecte les clés étrangères).
  await db.delete(auditLog);
  await db.delete(notifications);
  await db.delete(penalites);
  await db.delete(documents);
  await db.delete(cnpsCotisations);
  await db.delete(declarations);
  await db.delete(acfSuivis);
  await db.delete(contribuables);
  await db.delete(users);
  await db.delete(roles);
  await db.delete(parametres);
}

async function main() {
  console.log("🌱 Seed LaMethode — purge…");
  await purge();

  // --- Rôles ---------------------------------------------------------------
  const [rAdmin, rManager, rCollab, rLecture] = await db
    .insert(roles)
    .values([
      { nom: "ADMIN", description: "Associé / gérant", permissions: ALL },
      { nom: "MANAGER", description: "Chef de mission", permissions: PERMS_MANAGER },
      { nom: "COLLABORATEUR", description: "Comptable / fiscaliste", permissions: PERMS_COLLAB },
      { nom: "LECTURE", description: "Consultation seule", permissions: PERMS_LECTURE },
    ])
    .returning();

  // --- Utilisateurs --------------------------------------------------------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const roleParNom = new Map(
    [rAdmin, rManager, rCollab, rLecture].map((r) => [r.nom, r.id]),
  );

  const [uAdmin, uManager, uCollab1, uCollab2] = await db
    .insert(users)
    .values(
      COMPTES_DEMO.map((c) => ({
        nom: c.nom,
        email: c.email,
        telephone: c.telephone ?? null,
        passwordHash,
        roleId: roleParNom.get(c.role) ?? null,
      })),
    )
    .returning();

  // --- Paramètres du cabinet ----------------------------------------------
  await db.insert(parametres).values([
    { cle: "echeance_dsf", valeur: { jour: 15, mois: 3 }, description: "Échéance légale DSF (jj/mm N+1)" },
    { cle: "echeance_mensuelle_jour", valeur: { jour: 15 }, description: "Jour d'échéance des déclarations mensuelles (mois suivant)" },
    { cle: "rappels_jours", valeur: [15, 7, 1], description: "Rappels avant échéance (jours)" },
    { cle: "rappels_canaux", valeur: ["DASHBOARD", "EMAIL"], description: "Canaux des rappels (DASHBOARD, EMAIL, SMS, WHATSAPP)" },
    { cle: "penalite_bareme", valeur: { type: "pct", valeur: 0.1, minimum: 50000 }, description: "Barème de pénalité de retard" },
    { cle: "identite_visuelle", valeur: { vert: "#59B233", noir: "#111827" }, description: "Charte graphique" },
    { cle: "igs_bareme", valeur: IGS_BAREME_DEFAUT, description: "Barème IGS (CGI art. C40) : classe, tranche de CA annuel, montant forfaitaire (FCFA)" },
    { cle: "paie_bareme", valeur: BAREME_PAIE_DEFAUT, description: "Barème de paie (CNPS, IRPP, CFC, FNE, TDL, RAV, avantages en nature), en versions datées" },
    { cle: "cabinet_identite", valeur: IDENTITE_CABINET_DEFAUT, description: "Coordonnées légales imprimées en pied de facture" },
    { cle: "facturation_numerotation", valeur: { prefixe: "FA" }, description: "Préfixe des numéros de facture (FA-2026-0001)" },
    { cle: "facturation_delai_paiement", valeur: { jours: 15 }, description: "Délai de paiement accordé, en jours" },
  ]);

  // --- Contribuables -------------------------------------------------------
  const ctbRows = await db
    .insert(contribuables)
    .values([
      { nom: "ETS BONABERI DISTRIBUTION", niu: "M071500012345P", centreImpots: "CDI Douala 1er", regimeFiscal: "REEL", secteurActivite: "Commerce général", telephone: "+237 699 000 111", email: "contact@bonaberi.cm", responsableId: uCollab1.id, responsableDossier: "Yannick Collab", dateDebutMission: "2022-01-10" },
      { nom: "SARL TECHNOVA CAMEROUN", niu: "M081200098765Z", centreImpots: "CDI Yaoundé 2e", regimeFiscal: "REEL", secteurActivite: "Services informatiques", telephone: "+237 677 222 333", email: "info@technova.cm", responsableId: uCollab2.id, responsableDossier: "Aïcha Collab", dateDebutMission: "2023-06-01" },
      { nom: "BOULANGERIE LA CROISSANTINE", niu: "M091000054321Y", centreImpots: "CIME Douala", regimeFiscal: "IGS", igsClasse: 4, chiffreAffairesAnnuel: "1800000.00", secteurActivite: "Agroalimentaire", telephone: "+237 655 444 555", email: "croissantine@gmail.com", responsableId: uCollab1.id, responsableDossier: "Yannick Collab", dateDebutMission: "2021-03-15" },
      { nom: "GARAGE MOTO EXPRESS", niu: "M101100011223X", centreImpots: "CIME Yaoundé", regimeFiscal: "IGS", igsClasse: 2, cgaAdherent: true, chiffreAffairesAnnuel: "900000.00", secteurActivite: "Réparation automobile", telephone: "+237 690 666 777", email: null, responsableId: uCollab2.id, responsableDossier: "Aïcha Collab", dateDebutMission: "2024-02-20" },
      { nom: "CLINIQUE LES PALMIERS", niu: "M071900077889W", centreImpots: "DGE", regimeFiscal: "REEL", secteurActivite: "Santé", telephone: "+237 233 888 999", email: "admin@palmiers.cm", responsableId: uManager.id, responsableDossier: "Nadège Manager", dateDebutMission: "2020-09-01" },
    ])
    .returning();

  // --- Déclarations : génération pour l'année 2026 ------------------------
  const statutsMensuels: StatutDeclaration[] = [
    "PAYEE", "PAYEE", "DEPOSEE", "PAYEE", "A_FAIRE", "A_FAIRE",
  ]; // janvier -> juin
  const decls: (typeof declarations.$inferInsert)[] = [];

  for (const ctb of ctbRows) {
    const { annuelles, trimestrielles, mensuelles } = obligationsPourRegime(
      ctb.regimeFiscal,
      ctb.igsClasse,
    );

    for (const type of annuelles) {
      decls.push({
        contribuableId: ctb.id,
        type,
        periodicite: "ANNUELLE",
        periode: String(ANNEE),
        dateEcheance: echeanceAnnuelle(type, ANNEE, ctb.regimeFiscal),
        statut: "A_FAIRE",
        assignedTo: ctb.responsableId,
      });
    }

    // IGS : forfait annuel payé par quarts, une échéance par trimestre.
    for (const type of trimestrielles) {
      for (const t of echeancesAnnee(ANNEE)) {
        decls.push({
          contribuableId: ctb.id,
          type,
          periodicite: "TRIMESTRIELLE",
          periode: t.periode,
          dateEcheance: t.dateEcheance,
          statut: t.trimestre <= 2 ? "PAYEE" : "A_FAIRE",
          montant: String(
            montantTrimestriel(ctb.igsClasse, IGS_BAREME_DEFAUT, ctb.cgaAdherent) ?? 0,
          ),
          datePaiement: t.trimestre <= 2 ? t.dateEcheance : null,
          assignedTo: ctb.responsableId,
        });
      }
    }

    for (let mois = 1; mois <= 6; mois++) {
      const periode = `${ANNEE}-${String(mois).padStart(2, "0")}`;
      for (const type of mensuelles) {
        decls.push({
          contribuableId: ctb.id,
          type,
          periodicite: "MENSUELLE",
          periode,
          dateEcheance: defaultEcheanceMensuelle(ANNEE, mois),
          statut: statutsMensuels[mois - 1],
          montant: type === "TVA" ? "1250000.00" : type === "CNPS" ? "480000.00" : "150000.00",
          datePaiement: statutsMensuels[mois - 1] === "PAYEE" ? defaultEcheanceMensuelle(ANNEE, mois) : null,
          assignedTo: ctb.responsableId,
        });
      }
    }
  }

  const declRows = await db.insert(declarations).values(decls).returning();
  console.log(`   → ${declRows.length} déclarations générées`);

  // --- CNPS : cotisations détaillées (janvier -> mars) pour les 2 gros clients
  const cnpsCibles = ctbRows.filter((c) => c.regimeFiscal === "REEL").slice(0, 2);
  const cnpsValues: (typeof cnpsCotisations.$inferInsert)[] = [];
  for (const ctb of cnpsCibles) {
    for (let mois = 1; mois <= 3; mois++) {
      cnpsValues.push({
        contribuableId: ctb.id,
        periode: `${ANNEE}-${String(mois).padStart(2, "0")}`,
        masseSalariale: "6000000.00",
        taux: "8.40",
        montantEmployeur: "504000.00",
        montantSalarie: "252000.00",
        dateEcheance: defaultEcheanceMensuelle(ANNEE, mois),
        statut: mois < 3 ? "PAYEE" : "A_FAIRE",
      });
    }
  }
  if (cnpsValues.length) await db.insert(cnpsCotisations).values(cnpsValues);

  // --- ACF -----------------------------------------------------------------
  await db.insert(acfSuivis).values([
    { contribuableId: ctbRows[0].id, objet: "ACF pour appel d'offres public", dateDemande: "2026-03-01", statut: "DELIVRE", dateResolution: "2026-03-20", dateValidite: "2026-09-20", responsable: "Yannick Collab" },
    { contribuableId: ctbRows[1].id, objet: "ACF renouvellement annuel", dateDemande: "2026-05-10", statut: "BLOQUE", motifBlocage: "Reliquat TVA non soldé période 2025-11", responsable: "Aïcha Collab" },
    { contribuableId: ctbRows[4].id, objet: "ACF marché hospitalier", dateDemande: "2026-06-15", statut: "EN_COURS", responsable: "Nadège Manager" },
  ]);

  // --- Documents (métadonnées ; fichiers réels gérés en Phase 4) -----------
  await db.insert(documents).values([
    { contribuableId: ctbRows[0].id, nomFichier: "DSF_2025.pdf", typeMime: "application/pdf", taille: 245000, cheminStockage: "coffre/ctb-1/DSF_2025.pdf", categorie: "DSF", tags: ["2025", "fiscal"], uploadedBy: uCollab1.id },
    { contribuableId: ctbRows[0].id, nomFichier: "Attestation_immatriculation.pdf", typeMime: "application/pdf", taille: 98000, cheminStockage: "coffre/ctb-1/immat.pdf", categorie: "Administratif", tags: ["immatriculation"], uploadedBy: uCollab1.id },
    { contribuableId: ctbRows[1].id, nomFichier: "Contrat_bail_siege.pdf", typeMime: "application/pdf", taille: 187000, cheminStockage: "coffre/ctb-2/bail.pdf", categorie: "Contrat", tags: ["bail"], uploadedBy: uCollab2.id },
  ]);

  // --- Pénalités : sur une déclaration mensuelle "A_FAIRE" échue ------------
  const enRetard = declRows.find(
    (d) => d.statut === "A_FAIRE" && d.periodicite === "MENSUELLE",
  );
  if (enRetard) {
    await db.insert(penalites).values({
      declarationId: enRetard.id,
      montant: "125000.00",
      baseCalcul: "pct:0.10",
      statut: "ESTIMEE",
      notes: "Pénalité estimée automatiquement au passage en retard.",
    });
  }

  // --- Notifications --------------------------------------------------------
  await db.insert(notifications).values([
    { userId: uCollab1.id, type: "RAPPEL", canal: "DASHBOARD", ressourceType: "declaration", message: "3 déclarations arrivent à échéance sous 7 jours.", lu: false },
    { userId: uCollab2.id, type: "ALERTE", canal: "DASHBOARD", ressourceType: "acf", message: "ACF TECHNOVA bloquée : reliquat TVA à solder.", lu: false },
    { userId: null, type: "INFO", canal: "DASHBOARD", message: "Bienvenue sur l'ERP LaMethode 🎉", lu: false },
  ]);

  // --- Journal d'audit (exemple) -------------------------------------------
  await db.insert(auditLog).values([
    { userId: uCollab1.id, action: "CREATE", entite: "contribuables", entiteId: ctbRows[0].id, ip: "127.0.0.1" },
    { userId: uManager.id, action: "UPDATE", entite: "acf_suivis", entiteId: 3, diff: { avant: { statut: "EN_COURS" }, apres: { statut: "EN_COURS" } }, ip: "127.0.0.1" },
  ]);

  console.log("✅ Seed terminé.");
}

main()
  .catch((err) => {
    console.error("❌ Seed échoué :", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
