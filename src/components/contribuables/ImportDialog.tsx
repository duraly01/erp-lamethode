"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { apiUpload, messageErreur } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Changement = { champ: string; avant: string; apres: string };

type Rapport = {
  fichier: string;
  applique: boolean;
  colonnesReconnues: string[];
  colonnesIgnorees: string[];
  lignesLues: number;
  inchangees: number;
  modifiees: number;
  aModifier: { ligne: number; id: number; nom: string; changements: Changement[] }[];
  erreurs: { ligne: number; repere: string; messages: string[] }[];
  tronque: boolean;
};

/**
 * Import Excel du portefeuille, en deux temps.
 *
 * L'analyse ne modifie rien : elle montre, fiche par fiche, ce qui changerait.
 * L'application n'a lieu qu'ensuite, sur le même fichier, après lecture.
 */
export function ImportDialog({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [fichier, setFichier] = useState<File | null>(null);
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function envoie(appliquer: boolean) {
    if (!fichier) return;
    const fd = new FormData();
    fd.append("file", fichier);
    fd.append("appliquer", String(appliquer));
    return apiUpload<Rapport>("/api/contribuables/import", fd);
  }

  const analyse = useMutation({
    mutationFn: () => envoie(false) as Promise<Rapport>,
    onSuccess: (r) => {
      setRapport(r);
      setErreur(null);
    },
    onError: (e) => {
      setRapport(null);
      setErreur(messageErreur(e));
    },
  });

  const application = useMutation({
    mutationFn: () => envoie(true) as Promise<Rapport>,
    onSuccess: (r) => {
      setRapport(r);
      setErreur(null);
      qc.invalidateQueries({ queryKey: ["contribuables"] });
    },
    onError: (e) => setErreur(messageErreur(e)),
  });

  const enCours = analyse.isPending || application.isPending;
  const applique = rapport?.applique === true;

  return (
    <div className="space-y-4">
      {erreur && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erreur}
        </p>
      )}

      <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
        <p className="font-medium text-foreground">Comment procéder</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            Téléchargez le portefeuille avec le bouton <strong>Excel</strong>.
          </li>
          <li>Complétez les colonnes voulues, sans toucher aux en-têtes ni à la colonne <strong>ID</strong>.</li>
          <li>Déposez le fichier ici : rien ne sera modifié avant votre validation.</li>
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">
          Une cellule laissée vide ne modifie rien. L&apos;import ne crée ni ne
          supprime aucune fiche : il ne fait que mettre à jour les existantes.
        </p>
      </div>

      <div>
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border px-4 py-4 hover:bg-muted/40">
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 text-sm">
            {fichier ? (
              <span className="font-medium text-foreground">{fichier.name}</span>
            ) : (
              <span className="text-muted-foreground">
                Choisir un fichier Excel (.xlsx)
              </span>
            )}
          </span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              setFichier(e.target.files?.[0] ?? null);
              setRapport(null);
              setErreur(null);
            }}
          />
          <span className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium">
            Parcourir
          </span>
        </label>
      </div>

      {rapport && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Bilan
              valeur={applique ? rapport.modifiees : rapport.aModifier.length}
              libelle={applique ? "modifiée(s)" : "à modifier"}
              ton="primary"
            />
            <Bilan valeur={rapport.inchangees} libelle="inchangée(s)" ton="muted" />
            <Bilan
              valeur={rapport.erreurs.length}
              libelle="en erreur"
              ton={rapport.erreurs.length > 0 ? "danger" : "muted"}
            />
          </div>

          {rapport.colonnesIgnorees.length > 0 && (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              Colonnes non reconnues, donc ignorées :{" "}
              {rapport.colonnesIgnorees.join(", ")}
            </p>
          )}

          {applique && (
            <p className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {rapport.modifiees === 0
                ? "Aucune modification à enregistrer."
                : `${rapport.modifiees} fiche(s) mise(s) à jour.`}
            </p>
          )}

          {rapport.erreurs.length > 0 && (
            <div className="rounded-md border border-danger/30 bg-danger/5">
              <p className="flex items-center gap-2 border-b border-danger/20 px-3 py-2 text-sm font-medium text-danger">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Lignes rejetées — les autres restent traitées
              </p>
              <ul className="max-h-40 divide-y divide-border overflow-y-auto text-sm">
                {rapport.erreurs.map((e) => (
                  <li key={e.ligne} className="px-3 py-2">
                    <span className="font-medium text-foreground">
                      Ligne {e.ligne}
                    </span>{" "}
                    <span className="text-muted-foreground">— {e.repere}</span>
                    <ul className="mt-0.5 list-disc pl-5 text-xs text-danger">
                      {e.messages.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!applique && rapport.aModifier.length > 0 && (
            <div className="rounded-md border border-border">
              <p className="border-b border-border px-3 py-2 text-sm font-medium text-foreground">
                Détail des modifications
              </p>
              <ul className="max-h-64 divide-y divide-border overflow-y-auto text-sm">
                {rapport.aModifier.map((l) => (
                  <li key={l.ligne} className="px-3 py-2">
                    <p className="font-medium text-foreground">{l.nom}</p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {l.changements.map((c, i) => (
                        <li key={i} className="text-muted-foreground">
                          {c.champ} :{" "}
                          <span className="line-through">{c.avant}</span>{" "}
                          <span className="font-medium text-foreground">
                            → {c.apres}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rapport.tronque && (
            <p className="text-xs text-muted-foreground">
              Aperçu limité aux 300 premières lignes.
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone}>
          {applique ? "Fermer" : "Annuler"}
        </Button>
        {!applique && (
          <>
            <Button
              variant="outline"
              onClick={() => analyse.mutate()}
              disabled={!fichier || enCours}
            >
              {analyse.isPending ? <Spinner /> : <Upload className="h-4 w-4" />}
              Analyser
            </Button>
            <Button
              onClick={() => application.mutate()}
              disabled={!rapport || rapport.aModifier.length === 0 || enCours}
            >
              {application.isPending && <Spinner />}
              {rapport
                ? `Appliquer ${rapport.aModifier.length} modification(s)`
                : "Appliquer"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Bilan({
  valeur,
  libelle,
  ton,
}: {
  valeur: number;
  libelle: string;
  ton: "primary" | "muted" | "danger";
}) {
  const couleurs = {
    primary: "border-primary/20 bg-primary/5 text-primary",
    muted: "border-border bg-muted/40 text-muted-foreground",
    danger: "border-danger/30 bg-danger/10 text-danger",
  }[ton];
  return (
    <div className={`rounded-md border px-3 py-2 ${couleurs}`}>
      <p className="text-xl font-semibold">{valeur}</p>
      <p className="text-xs">{libelle}</p>
    </div>
  );
}
