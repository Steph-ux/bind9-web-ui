import { useAuth } from "@/lib/auth-provider";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Loader2, Server, Globe, Shield, Terminal, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const loginSchema = z.object({
  username: z.string().min(1, "Nom d'utilisateur requis"),
  password: z.string().min(1, "Mot de passe requis"),
});

export default function AuthPage() {
  const { user, login } = useAuth();
  const [_, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setLocation(user.mustChangePassword ? "/change-password" : "/");
    }
  }, [user, setLocation]);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (data: z.infer<typeof loginSchema>) => {
    try {
      setError(null);
      setLoading(true);
      await login(data);
    } catch (err: any) {
      setError(err?.message || "Identifiants invalides");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.12),rgba(10,12,18,0))]">
      {/* Left Login Form Panel */}
      <div className="flex items-center justify-center p-6 lg:p-12 w-full lg:w-[500px] lg:max-w-[500px] shrink-0 border-r border-border/50 bg-background/80 backdrop-blur-md">
        <Card className="w-full max-w-[400px] border-border/70 bg-card/90 shadow-2xl shadow-primary/5 rounded-2xl">
          <CardHeader className="pb-4 pt-6">
            {/* Brand Logo */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 shadow-md shadow-indigo-500/25">
                <span className="font-mono text-lg font-black text-white">B9</span>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
              </div>
              <div>
                <h1 className="font-bold text-lg tracking-tight text-foreground leading-none">
                  BIND9 Control Plane
                </h1>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Enterprise DNS Suite
                </span>
              </div>
            </div>

            <h2 className="font-bold text-2xl tracking-tight text-foreground">Connexion</h2>
            <CardDescription className="text-xs text-muted-foreground">
              Authentifiez-vous pour acceder a la gestion du serveur DNS et des zones autoritaires.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            {error && (
              <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs font-semibold uppercase text-muted-foreground">
                  Identifiant / Utilisateur
                </Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="admin"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-10 rounded-xl font-mono text-sm border-border/70 bg-background/60 focus-visible:ring-indigo-500/30"
                  {...form.register("username")}
                />
                {form.formState.errors.username && (
                  <p className="text-xs text-destructive">{form.formState.errors.username.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold uppercase text-muted-foreground">
                  Mot de passe
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  className="h-10 rounded-xl font-mono text-sm border-border/70 bg-background/60 focus-visible:ring-indigo-500/30"
                  {...form.register("password")}
                />
                {form.formState.errors.password && (
                  <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-10 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-semibold shadow-md shadow-indigo-500/20 hover:from-indigo-500 hover:to-indigo-600 transition-all"
                disabled={loading}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {loading ? "Connexion en cours..." : "Se connecter"}
              </Button>
            </form>

            <div className="mt-6 rounded-xl border border-border/40 bg-muted/20 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">
                Accès restreint aux administrateurs réseau et exploitants autorisés.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Hero Branding Panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 flex-1 relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
        {/* Glow ambient background elements */}
        <div className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/3 w-80 h-80 rounded-full bg-purple-600/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center justify-between">
          <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300 font-mono text-xs px-3 py-1">
            Production Cluster :: ISOCEL TELECOM
          </Badge>
          <span className="text-xs font-mono text-slate-400">BIND 9.18 Enterprise</span>
        </div>

        <div className="relative z-10 max-w-xl my-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Infrastructure DNS Résiliente & Filtrage RPZ
          </div>

          <h1 className="text-4xl lg:text-5xl font-black tracking-tight leading-tight text-white mb-4">
            Pilotez votre infrastructure DNS en temps réel.
          </h1>
          <p className="text-slate-300 text-base leading-relaxed mb-8">
            Console d'administration unifiée pour le déploiement sécurisé des zones directes et inverses, l'application instantanée des règles RPZ, et la synchronisation continue multi-serveurs.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm mb-1">
                <Globe className="h-4 w-4" />
                Zones & Enregistrements
              </div>
              <p className="text-xs text-slate-400">
                Assistants intelligents SPF, DMARC, DKIM et validation en temps réel.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm mb-1">
                <Shield className="h-4 w-4" />
                Pare-feu RPZ & ACL
              </div>
              <p className="text-xs text-slate-400">
                Blocage proactif des menaces et contrôle granulaire des transferts TSIG.
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between pt-6 border-t border-white/10 text-xs text-slate-400">
          <span>Plateforme BIND9 Admin Control Plane</span>
          <span>© 2026 Stephane ASSOGBA</span>
        </div>
      </div>
    </div>
  );
}
