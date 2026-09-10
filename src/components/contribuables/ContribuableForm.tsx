"use client";

import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiSend, messageErreur } from "@/lib/api-client";
import { REGIME_FISCAL_LABELS, type RegimeFiscal } from "@/lib/constants";
import {
  IGS_CA_PLAFOND,
  IGS_NB_CLASSES,
  depasseSeuilIgs,
} from "@/lib/igs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

export type ContribuableRow = {
  id: number;
  nom: string;
  niu: string | null;
  centreImpots: string | null;
  regimeFiscal: RegimeFiscal;
  igsClasse: number | null;
  cgaAdherent: boolean;
  chiffreAffairesAnnuel: string | null;
  honoraireMensuel: string | null;
  remisePct: string | null;
  delaiPaiementJours: number | null;
  adresseFacturation: string | null;
  facturationAuto: boolean;
  secteurActivite: string | null;
  telephone: string | null;
  email: string | null;
  responsableDossier: string | null;
  actif: boolean;
  notes: string | null;
};

type FormValues = {
  nom: string;
  niu: string;
  regimeFiscal: RegimeFiscal;
  igsClasse: string;
  cgaAdherent: boolean;
  chiffreAffairesAnnuel: string;
  honoraireMensuel: string;
  remisePct: string;
  delaiPaiementJours: string;
  adresseFacturation: string;
  facturationAuto: boolean;
  centreImpots: string;
  secteurActivite: string;
  telephone: string;
  email: string;
  responsableDossier: string;
  notes: string;
  actif: boolean;
};

export function ContribuableForm({
  initial,
  onDone,
}: {
  initial?: ContribuableRow;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!initial;
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      nom: initial?.nom ?? "",
      niu: initial?.niu ?? "",
      regimeFiscal: initial?.regimeFiscal ?? "REEL",
      igsClasse: initial?.igsClasse ? String(initial.igsClasse) : "",
      cgaAdherent: initial?.cgaAdherent ?? false,
      chiffreAffairesAnnuel: initial?.chiffreAffairesAnnuel ?? "",
      honoraireMensuel: initial?.honoraireMensuel ?? "",
      remisePct: initial?.remisePct ?? "",
      delaiPaiementJours:
        initial?.delaiPaiementJours != null
          ? String(initial.delaiPaiementJours)
          : "",
      adresseFacturation: initial?.adresseFacturation ?? "",
      facturationAuto: initial?.facturationAuto ?? false,
      centreImpots: initial?.centreImpots ?? "",
      secteurActivite: initial?.secteurActivite ?? "",
      telephone: initial?.telephone ?? "",
      email: initial?.email ?? "",
      responsableDossier: initial?.responsableDossier ?? "",
      notes: initial?.notes ?? "",
      actif: initial?.actif ?? true,
    },
  });

  // Les champs numériques optionnels arrivent en chaîne vide depuis le
  // formulaire ; l'API attend `null` pour « non renseigné ».
  function toPayload(values: FormValues) {
    return {
      ...values,
      igsClasse: values.igsClasse ? Number(values.igsClasse) : null,
      chiffreAffairesAnnuel: values.chiffreAffairesAnnuel || null,
      honoraireMensuel: values.honoraireMensuel || null,
      remisePct: values.remisePct || null,
      delaiPaiementJours: values.delaiPaiementJours || null,
      adresseFacturation: values.adresseFacturation || null,
    };
  }

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      editing
        ? apiSend(`/api/contribuables/${initial!.id}`, "PATCH", toPayload(values))
        : apiSend("/api/contribuables", "POST", toPayload(values)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contribuables"] });
      onDone();
    },
    onError: (err) => setError("root", { message: messageErreur(err) }),
  });

  const regime = watch("regimeFiscal");
  const caDepasse = depasseSeuilIgs(Number(watch("chiffreAffairesAnnuel")) || null);

  return (
    <form
      onSubmit={handleSubmit((v) => mutation.mutate(v))}
      className="space-y-4"
    >
      {errors.root && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errors.root.message}
        </p>
      )}

      <div>
        <Label htmlFor="nom">Nom / Raison sociale *</Label>
        <Input
          id="nom"
          {...register("nom", { required: "Le nom est requis." })}
        />
        {errors.nom && (
          <p className="mt-1 text-xs text-danger">{errors.nom.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="niu">NIU</Label>
          <Input id="niu" {...register("niu")} placeholder="M0715000..." />
        </div>
        <div>
          <Label htmlFor="regimeFiscal">Régime fiscal</Label>
          <Select id="regimeFiscal" {...register("regimeFiscal")}>
            {(Object.keys(REGIME_FISCAL_LABELS) as RegimeFiscal[]).map((r) => (
              <option key={r} value={r}>
                {REGIME_FISCAL_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="chiffreAffairesAnnuel">
            Chiffre d&apos;affaires annuel (FCFA)
          </Label>
          <Input
            id="chiffreAffairesAnnuel"
            type="number"
            min={0}
            step={1000}
            {...register("chiffreAffairesAnnuel")}
          />
        </div>
        <div>
          <Label htmlFor="centreImpots">Centre des impôts</Label>
          <Input id="centreImpots" {...register("centreImpots")} />
        </div>
        <div>
          <Label htmlFor="secteurActivite">Secteur d&apos;activité</Label>
          <Input id="secteurActivite" {...register("secteurActivite")} />
        </div>
        <div>
          <Label htmlFor="telephone">Téléphone</Label>
          <Input id="telephone" {...register("telephone")} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register("email")} />
        </div>
      </div>

      {regime === "IGS" && (
        <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-medium text-foreground">
            Paramètres IGS
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="igsClasse">Classe du barème</Label>
              <Select id="igsClasse" {...register("igsClasse")}>
                <option value="">— Non déterminée —</option>
                {Array.from({ length: IGS_NB_CLASSES }, (_, i) => i + 1).map(
                  (c) => (
                    <option key={c} value={c}>
                      Classe {c}
                    </option>
                  ),
                )}
              </Select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                {...register("cgaAdherent")}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              Adhérent CGA (abattement 50 %)
            </label>
          </div>
          {caDepasse && (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              Le chiffre d&apos;affaires dépasse{" "}
              {IGS_CA_PLAFOND.toLocaleString("fr-FR")} FCFA : ce contribuable
              doit basculer au régime du Réel.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Le forfait annuel est lu dans le barème IGS (Paramètres) et payé par
            quarts trimestriels.
          </p>
        </div>
      )}

      <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">
            Paramètres de facturation
          </p>
          <p className="text-xs text-muted-foreground">
            Définis une fois ici, repris sur chaque facture de ce contribuable.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="honoraireMensuel">Honoraires mensuels (FCFA)</Label>
            <Input
              id="honoraireMensuel"
              type="number"
              min={0}
              step={1000}
              {...register("honoraireMensuel")}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Montant proposé sur la facture, ajustable facture par facture.
            </p>
          </div>
          <div>
            <Label htmlFor="remisePct">Remise (% des honoraires)</Label>
            <Input
              id="remisePct"
              type="number"
              min={0}
              max={100}
              step={0.5}
              {...register("remisePct")}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Laissez vide si ce client ne bénéficie d&apos;aucune remise.
            </p>
          </div>
          <div>
            <Label htmlFor="delaiPaiementJours">
              Délai de paiement (jours)
            </Label>
            <Input
              id="delaiPaiementJours"
              type="number"
              min={1}
              step={1}
              {...register("delaiPaiementJours")}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              À défaut, le délai général du cabinet s&apos;applique.
            </p>
          </div>
          <div>
            <Label htmlFor="adresseFacturation">
              Adresse de facturation
            </Label>
            <Input
              id="adresseFacturation"
              {...register("adresseFacturation")}
              placeholder="Si différente de l'adresse du dossier"
            />
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            {...register("facturationAuto")}
            className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
          />
          <span>
            Facturation mensuelle automatique
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Décoché, ce contribuable n&apos;est facturé qu&apos;à votre
              demande — c&apos;est le cas d&apos;un client sorti du
              portefeuille.
            </span>
          </span>
        </label>
      </div>

      <div>
        <Label htmlFor="responsableDossier">Responsable du dossier</Label>
        <Input id="responsableDossier" {...register("responsableDossier")} />
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          rows={3}
          {...register("notes")}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("actif")} className="h-4 w-4 accent-[var(--primary)]" />
        Contribuable actif
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Spinner />}
          {editing ? "Enregistrer" : "Créer"}
        </Button>
      </div>
    </form>
  );
}
