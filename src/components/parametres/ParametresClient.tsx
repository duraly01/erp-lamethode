"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Check, Zap, Mail, Send } from "lucide-react";
import { apiGet, apiSend, ApiClientError } from "@/lib/api-client";
import { useCan } from "@/hooks/useCan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { IgsBaremePanel } from "@/components/parametres/IgsBaremePanel";
import { PaieBaremePanel } from "@/components/parametres/PaieBaremePanel";

type AutomationResult = {
  markedOverdue: number;
  penaltiesCreated: number;
  remindersCreated: number;
};

function AutomationsPanel() {
  const qc = useQueryClient();
  const [result, setResult] = useState<AutomationResult | null>(null);
  const run = useMutation({
    mutationFn: () =>
      apiSend<AutomationResult>("/api/automations/run", "POST"),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Automatisations
          </p>
          <p className="text-sm text-muted-foreground">
            Passe les déclarations échues en retard, calcule les pénalités et
            génère les rappels (J-15 / J-7 / J-1).
          </p>
          {result && (
            <p className="mt-1 text-xs text-success">
              {result.markedOverdue} en retard · {result.penaltiesCreated}{" "}
              pénalité(s) · {result.remindersCreated} rappel(s).
            </p>
          )}
        </div>
        <Button
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="shrink-0"
        >
          {run.isPending ? <Spinner /> : <Zap className="h-4 w-4" />}
          Lancer maintenant
        </Button>
      </CardContent>
    </Card>
  );
}

type Parametre = {
  id: number;
  cle: string;
  valeur: unknown;
  description: string | null;
  updatedAt: string;
};

type ChannelStatus = { name: string; configured: boolean };

const CHANNEL_LABELS: Record<string, string> = {
  DASHBOARD: "Tableau de bord",
  EMAIL: "Email",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  PUSH: "Push",
};

function NotificationsPanel() {
  const [testResult, setTestResult] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["notification-channels"],
    queryFn: () =>
      apiGet<{ channels: ChannelStatus[] }>("/api/notifications/channels"),
  });

  const test = useMutation({
    mutationFn: () =>
      apiSend<{ sent: boolean; smtpConfigured: boolean; to: string }>(
        "/api/notifications/test-email",
        "POST",
      ),
    onSuccess: (r) =>
      setTestResult(
        r?.smtpConfigured
          ? `Email envoyé à ${r.to}.`
          : `Email « rendu » (SMTP non configuré) — visible dans les logs serveur. Destinataire : ${r?.to}.`,
      ),
    onError: (e) =>
      setTestResult(
        e instanceof ApiClientError ? e.message : "Échec de l'envoi.",
      ),
  });

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Canaux de notification
            </p>
            <p className="text-sm text-muted-foreground">
              Les rappels d&apos;échéance sont diffusés sur les canaux
              configurés.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data?.channels.map((c) => (
                <Badge
                  key={c.name}
                  className={
                    c.configured
                      ? "border-success/20 bg-success/10 text-success"
                      : "border-border bg-muted text-muted-foreground"
                  }
                >
                  {c.name === "EMAIL" ? (
                    <Mail className="mr-1 h-3 w-3" />
                  ) : null}
                  {CHANNEL_LABELS[c.name] ?? c.name}
                  {c.configured ? " · actif" : " · à brancher"}
                </Badge>
              ))}
            </div>
            {testResult && (
              <p className="mt-2 text-xs text-info">{testResult}</p>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => test.mutate()}
            disabled={test.isPending}
            className="shrink-0"
          >
            {test.isPending ? <Spinner /> : <Send className="h-4 w-4" />}
            Email de test
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ParametresClient() {
  const can = useCan();
  const editable = can("parametres", "update");
  const query = useQuery({
    queryKey: ["parametres"],
    queryFn: () => apiGet<Parametre[]>("/api/parametres"),
  });

  if (query.isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    );

  return (
    <div className="space-y-4">
      {editable && <AutomationsPanel />}
      {editable && <NotificationsPanel />}
      {!editable && (
        <p className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
          Consultation seule — seuls les administrateurs peuvent modifier les
          paramètres.
        </p>
      )}
      {query.data?.map((p) =>
        // Les barèmes IGS et de paie ont leur propre éditeur : ils sont trop
        // structurés pour l'éditeur JSON générique.
        p.cle === "igs_bareme" ? (
          <IgsBaremePanel key={p.cle} valeur={p.valeur} editable={editable} />
        ) : p.cle === "paie_bareme" ? (
          <PaieBaremePanel key={p.cle} editable={editable} />
        ) : (
          <ParametreCard key={p.cle} param={p} editable={editable} />
        ),
      )}
      {/* Une base créée avant la paie n'a pas encore le paramètre : l'éditeur
          part alors du barème livré, et le premier enregistrement le crée. */}
      {query.data && !query.data.some((p) => p.cle === "paie_bareme") && (
        <PaieBaremePanel editable={editable} />
      )}
    </div>
  );
}

function ParametreCard({
  param,
  editable,
}: {
  param: Parametre;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(JSON.stringify(param.valeur, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new Error("JSON invalide.");
      }
      return apiSend(`/api/parametres/${param.cle}`, "PATCH", {
        valeur: parsed,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parametres"] });
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) =>
      setError(
        err instanceof ApiClientError || err instanceof Error
          ? err.message
          : "Erreur.",
      ),
  });

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-medium text-foreground">
              {param.cle}
            </code>
            {param.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {param.description}
              </p>
            )}
          </div>
        </div>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          readOnly={!editable}
          rows={Math.min(8, value.split("\n").length + 1)}
          spellCheck={false}
          className="mt-3 w-full rounded-md border border-input bg-muted/40 px-3 py-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        {editable && (
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              variant={saved ? "outline" : "primary"}
            >
              {mutation.isPending ? (
                <Spinner />
              ) : saved ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saved ? "Enregistré" : "Enregistrer"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
