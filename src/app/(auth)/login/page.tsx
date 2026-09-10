"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { LogIn, AlertCircle } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Email ou mot de passe incorrect.");
      return;
    }
    router.push(params.get("callbackUrl") || "/dashboard");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Colonne marque */}
      <div className="relative hidden overflow-hidden bg-ink lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(600px circle at 30% 20%, #59b233, transparent 45%), radial-gradient(500px circle at 80% 80%, #59b233, transparent 40%)",
          }}
        />
        <div className="relative">
          <div className="inline-flex rounded-xl bg-white px-4 py-3">
            <Logo />
          </div>
        </div>
        <div className="relative space-y-4 text-white">
          <h1 className="text-3xl font-bold leading-tight">
            ERP Fiscal & Social
          </h1>
          <p className="max-w-md text-white/70">
            Pilotez le suivi fiscal, social et documentaire de votre
            portefeuille de contribuables : déclarations, CNPS, ACF, échéances
            et alertes — en un seul endroit.
          </p>
        </div>
        <div className="relative text-sm text-white/40">
          Cabinet Comptable & Services LaMethode SARL — Cameroun
        </div>
      </div>

      {/* Colonne formulaire */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Connexion</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Accédez à votre espace de travail.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="vous@lamethode.cm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Spinner /> : <LogIn className="h-4 w-4" />}
              Se connecter
            </Button>
          </form>

          <div className="mt-6 rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Comptes de démonstration</p>
            <p className="mt-1">
              admin@lamethode.cm · nadege@lamethode.cm · yannick@lamethode.cm
            </p>
            <p>
              Mot de passe :{" "}
              <code className="rounded bg-card px-1 py-0.5">Lamethode2026!</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginForm />
    </Suspense>
  );
}
