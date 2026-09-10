"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UploadCloud, FileCheck2 } from "lucide-react";
import { ApiClientError } from "@/lib/api-client";
import { useContribuableOptions } from "@/hooks/useContribuableOptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function DocumentForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { data: options } = useContribuableOptions();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [contribuableId, setContribuableId] = useState("");
  const [categorie, setCategorie] = useState("");
  const [tags, setTags] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Veuillez choisir un fichier.");
      if (!contribuableId) throw new Error("Veuillez choisir un contribuable.");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("contribuableId", contribuableId);
      fd.append("categorie", categorie);
      fd.append("tags", tags);
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiClientError(
          res.status,
          body?.error?.code ?? "error",
          body?.error?.message ?? "Échec de l'upload.",
        );
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      onDone();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Une erreur est survenue."),
  });

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div>
        <Label htmlFor="contribuableId">Contribuable *</Label>
        <Select
          id="contribuableId"
          value={contribuableId}
          onChange={(e) => setContribuableId(e.target.value)}
        >
          <option value="">— Sélectionner —</option>
          {options?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nom}
            </option>
          ))}
        </Select>
      </div>

      {/* Zone de dépôt */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/40",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
        />
        {file ? (
          <>
            <FileCheck2 className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(0)} Ko — cliquer pour changer
            </p>
          </>
        ) : (
          <>
            <UploadCloud className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Glissez un fichier ici, ou cliquez pour parcourir
            </p>
            <p className="text-xs text-muted-foreground">10 Mo maximum</p>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="categorie">Catégorie</Label>
          <Input
            id="categorie"
            value={categorie}
            onChange={(e) => setCategorie(e.target.value)}
            placeholder="DSF, Contrat…"
          />
        </div>
        <div>
          <Label htmlFor="tags">Tags (virgules)</Label>
          <Input
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="2025, fiscal"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Annuler
        </Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !file || !contribuableId}
        >
          {mutation.isPending ? <Spinner /> : <UploadCloud className="h-4 w-4" />}
          Téléverser
        </Button>
      </div>
    </div>
  );
}
