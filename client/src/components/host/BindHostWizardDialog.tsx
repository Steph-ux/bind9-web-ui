import { useState, useEffect } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  DownloadCloud,
  FileCode2,
  HardDrive,
  Loader2,
  Play,
  RotateCcw,
  Server,
  Settings,
  Shield,
  Terminal,
  Wrench,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  getHostDetection,
  installHostBind9,
  getHostInstallStatus,
  initHostBind9,
  type HostBind9Detection,
  type InstallProgress,
  type SetupProfileOptions,
} from "@/lib/api";

interface BindHostWizardDialogProps {
  detection: HostBind9Detection | null;
  onRefresh: () => void;
  triggerButton?: React.ReactNode;
  defaultOpen?: boolean;
}

export function BindHostWizardDialog({
  detection,
  onRefresh,
  triggerButton,
  defaultOpen = false,
}: BindHostWizardDialogProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [activeTab, setActiveTab] = useState<"install" | "configure" | "verify">("install");
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);

  // Configuration options state
  const [profile, setProfile] = useState<"authoritative" | "resolver" | "hybrid">("hybrid");
  const [forwardersText, setForwardersText] = useState("1.1.1.1\n8.8.8.8");
  const [allowRecursionText, setAllowRecursionText] = useState("localhost; 192.168.0.0/16; 10.0.0.0/8;");
  const [allowQueryText, setAllowQueryText] = useState("any;");
  const [listenV4Text, setListenV4Text] = useState("any;");
  const [dnssecValidation, setDnssecValidation] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initResult, setInitResult] = useState<any>(null);

  const { toast } = useToast();

  // If already installed, jump to configure or verify
  useEffect(() => {
    if (detection?.bind9.isInstalled) {
      if (detection.needsInitialization) {
        setActiveTab("configure");
      } else {
        setActiveTab("verify");
      }
    } else {
      setActiveTab("install");
    }
  }, [detection]);

  // Polling during installation
  useEffect(() => {
    let timer: any;
    if (isInstalling) {
      timer = setInterval(async () => {
        try {
          const status = await getHostInstallStatus();
          setInstallProgress(status);
          if (status.status === "success") {
            setIsInstalling(false);
            toast({
              title: "Installation terminée",
              description: "BIND9 a été installé avec succès sur le serveur.",
            });
            onRefresh();
            setActiveTab("configure");
          } else if (status.status === "error") {
            setIsInstalling(false);
            toast({
              title: "Échec de l'installation",
              description: status.error || "Une erreur est survenue lors de l'installation.",
              variant: "destructive",
            });
          }
        } catch {
          // ignore transient poll error
        }
      }, 1500);
    }
    return () => clearInterval(timer);
  }, [isInstalling, onRefresh, toast]);

  const handleStartInstall = async () => {
    setIsInstalling(true);
    setInstallProgress({
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      logs: ["Lancement de la commande d'installation..."],
    });

    try {
      const res = await installHostBind9();
      toast({
        title: "Installation initiée",
        description: res.message,
      });
    } catch (err: any) {
      setIsInstalling(false);
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleInitialize = async () => {
    setIsInitializing(true);
    setInitResult(null);

    const forwarders = forwardersText
      .split("\n")
      .map((ip) => ip.trim())
      .filter(Boolean);

    const payload: SetupProfileOptions = {
      profile,
      forwarders,
      allowRecursion: allowRecursionText,
      allowQuery: allowQueryText,
      listenV4: listenV4Text,
      dnssecValidation,
    };

    try {
      const res = await initHostBind9(payload);
      setInitResult(res);
      toast({
        title: res.success ? "Configuration réussie" : "Avertissement syntaxe",
        description: res.message,
        variant: res.success ? "default" : "destructive",
      });
      onRefresh();
      if (res.success) {
        setActiveTab("verify");
      }
    } catch (err: any) {
      toast({
        title: "Erreur d'initialisation",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button variant="default" className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-md">
            <Wrench className="h-4 w-4" />
            Assistant BIND9 Serveur
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">
                Installation & Configuration Locale BIND9
              </DialogTitle>
              <DialogDescription className="text-xs">
                Gestionnaire système intégré pour installer, initialiser et piloter BIND9 directement sur l'hôte.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* System summary badge pill */}
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-muted/40 border border-border/60 text-xs">
          <div className="flex items-center gap-1.5 font-medium">
            <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
            <span>OS :</span>
            <Badge variant="outline" className="font-mono text-[11px] capitalize">
              {detection?.os.distro || "Détection..."} {detection?.os.version}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            <span>Gestionnaire :</span>
            <Badge variant="secondary" className="font-mono text-[11px] uppercase">
              {detection?.os.pkgManager || "N/A"}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 font-medium ml-auto">
            <span>Statut BIND9 :</span>
            <Badge
              variant="outline"
              className={`font-mono text-[11px] uppercase ${
                detection?.bind9.isInstalled
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-400"
              }`}
            >
              {detection?.bind9.isInstalled ? "Installé" : "Non Installé"}
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full mt-2">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="install" className="text-xs gap-1.5">
              <DownloadCloud className="h-3.5 w-3.5" />
              1. Installation
            </TabsTrigger>
            <TabsTrigger value="configure" className="text-xs gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              2. Profil & Setup
            </TabsTrigger>
            <TabsTrigger value="verify" className="text-xs gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              3. Vérification
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: INSTALL */}
          <TabsContent value="install" className="space-y-4 pt-3">
            {detection?.bind9.isInstalled ? (
              <Alert className="border-emerald-500/30 bg-emerald-500/10">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <AlertTitle className="text-emerald-400 font-semibold">BIND9 est déjà installé sur ce serveur</AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground mt-1">
                  Les exécutables BIND9 ont été détectés : <code className="font-mono text-emerald-300">{detection.bind9.namedBin}</code>
                  {detection.bind9.version && ` (Version ${detection.bind9.version})`}.
                  Vous pouvez passer directement à l'étape 2 pour configurer le profil DNS.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Le moteur DNS BIND9 n'a pas été détecté sur ce système. L'installateur automatique va exécuter
                  la commande appropriée avec privilèges pour installer les paquets requis (<code>bind9</code>, <code>bind9utils</code>, <code>dnsutils</code>).
                </p>

                <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Installation Automatique</h4>
                      <p className="text-xs text-muted-foreground">
                        Télécharge et installe les paquets via {detection?.os.pkgManager || "le gestionnaire d'OS"}.
                      </p>
                    </div>
                    <Button
                      onClick={handleStartInstall}
                      disabled={isInstalling || !detection?.os.isLinux}
                      className="bg-primary hover:bg-primary/90 text-white gap-2"
                    >
                      {isInstalling ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Installation en cours...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" />
                          Installer BIND9 maintenant
                        </>
                      )}
                    </Button>
                  </div>

                  {!detection?.os.isLinux && (
                    <p className="text-[11px] text-amber-400">
                      Note : L'hôte actuel n'est pas sous Linux. L'installation automatique s'applique sur les serveurs Linux hôtes.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Install terminal log console */}
            {(isInstalling || (installProgress && installProgress.logs.length > 0)) && (
              <div className="rounded-xl border border-border/70 bg-black/85 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/40 pb-1.5">
                  <span className="flex items-center gap-1.5 font-mono">
                    <Terminal className="h-3.5 w-3.5" />
                    Console d'installation
                  </span>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono">
                    {installProgress?.status || "running"}
                  </Badge>
                </div>
                <ScrollArea className="h-44 w-full">
                  <pre className="font-mono text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {installProgress?.logs.join("\n")}
                  </pre>
                </ScrollArea>
              </div>
            )}
          </TabsContent>

          {/* TAB 2: CONFIGURE */}
          <TabsContent value="configure" className="space-y-4 pt-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Choisir le profil initial du serveur DNS</h3>
              <p className="text-xs text-muted-foreground">
                L'assistant va générer les fichiers de configuration de base (<code>named.conf.options</code>, <code>named.conf.local</code>, clé RNDC).
              </p>
            </div>

            {/* Profile cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div
                onClick={() => setProfile("authoritative")}
                className={`cursor-pointer rounded-xl border p-3.5 space-y-2 transition-all ${
                  profile === "authoritative"
                    ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                    : "border-border/60 hover:border-border bg-card/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-foreground">Autoritaire</span>
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Héberge vos domaines et zones privées/publiques. Récursion désactivée pour une sécurité maximale contre l'amplification DNS.
                </p>
              </div>

              <div
                onClick={() => setProfile("resolver")}
                className={`cursor-pointer rounded-xl border p-3.5 space-y-2 transition-all ${
                  profile === "resolver"
                    ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                    : "border-border/60 hover:border-border bg-card/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-foreground">Cache & Résolveur</span>
                  <Cpu className="h-4 w-4 text-primary" />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Résout tous les noms Internet pour vos clients locaux avec cache ultra-rapide et redirecteurs (forwarders) sécurisés.
                </p>
              </div>

              <div
                onClick={() => setProfile("hybrid")}
                className={`cursor-pointer rounded-xl border p-3.5 space-y-2 transition-all ${
                  profile === "hybrid"
                    ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                    : "border-border/60 hover:border-border bg-card/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-foreground">Hybride (Complet)</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Gère vos zones internes/locales en autorité tout en offrant la résolution Internet pour vos postes de travail locaux.
                </p>
              </div>
            </div>

            {/* Customization Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Serveurs redirecteurs (Forwarders)</Label>
                <Textarea
                  rows={3}
                  value={forwardersText}
                  onChange={(e) => setForwardersText(e.target.value)}
                  placeholder="1.1.1.1&#10;8.8.8.8"
                  className="font-mono text-xs"
                />
                <span className="text-[10px] text-muted-foreground">Un IP par ligne (ex: Cloudflare 1.1.1.1, Google 8.8.8.8)</span>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Réseaux autorisés à la récursion</Label>
                <Input
                  value={allowRecursionText}
                  onChange={(e) => setAllowRecursionText(e.target.value)}
                  placeholder="localhost; 192.168.0.0/16;"
                  className="font-mono text-xs"
                />
                <span className="text-[10px] text-muted-foreground">Plages IP clientes (ex: LAN entreprise)</span>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Interface d'écoute IPv4 (listen-on)</Label>
                <Input
                  value={listenV4Text}
                  onChange={(e) => setListenV4Text(e.target.value)}
                  placeholder="any; ou 127.0.0.1; 192.168.11.10;"
                  className="font-mono text-xs"
                />
              </div>

              <div className="flex items-center justify-between pt-6 pr-2">
                <div className="space-y-0.5">
                  <Label className="text-xs">Validation DNSSEC</Label>
                  <p className="text-[11px] text-muted-foreground">Vérification automatique des signatures cryptographiques</p>
                </div>
                <Switch checked={dnssecValidation} onCheckedChange={setDnssecValidation} />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                onClick={handleInitialize}
                disabled={isInitializing}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                {isInitializing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Configuration en cours...
                  </>
                ) : (
                  <>
                    <FileCode2 className="h-4 w-4" />
                    Générer la configuration & Démarrer BIND9
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          {/* TAB 3: VERIFY */}
          <TabsContent value="verify" className="space-y-4 pt-3">
            <div className="space-y-3">
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  État du Moteur BIND9 Local
                </h4>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-lg border border-border/50 bg-muted/30 p-2.5">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Service Systemd</span>
                    <p className="font-mono font-bold text-foreground capitalize mt-0.5">
                      {detection?.bind9.serviceStatus || "inconnu"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/50 bg-muted/30 p-2.5">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Syntaxe Config</span>
                    <p className={`font-mono font-bold mt-0.5 ${detection?.config.isSyntaxValid ? "text-emerald-400" : "text-rose-400"}`}>
                      {detection?.config.isSyntaxValid ? "VALIDE" : "ERREUR"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/50 bg-muted/30 p-2.5">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Port 53 Écoute</span>
                    <p className={`font-mono font-bold mt-0.5 ${detection?.ports.port53Listening ? "text-emerald-400" : "text-amber-400"}`}>
                      {detection?.ports.port53Listening ? "ACTIF (53)" : "INACTIF"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/50 bg-muted/30 p-2.5">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Clé RNDC</span>
                    <p className={`font-mono font-bold mt-0.5 ${detection?.config.hasRndcKey ? "text-emerald-400" : "text-amber-400"}`}>
                      {detection?.config.hasRndcKey ? "PRÉSENTE" : "ABSENTE"}
                    </p>
                  </div>
                </div>

                {detection?.config.syntaxError && (
                  <Alert variant="destructive" className="text-xs">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Avertissement named-checkconf</AlertTitle>
                    <AlertDescription className="font-mono mt-1 whitespace-pre-wrap">
                      {detection.config.syntaxError}
                    </AlertDescription>
                  </Alert>
                )}

                {initResult?.details && (
                  <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-xs space-y-1">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">Rapport d'initialisation</span>
                    <p className="font-mono text-foreground text-[11px]">{initResult.message}</p>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-2">
                <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1.5 text-xs">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Actualiser les diagnostics
                </Button>
                <Button
                  size="sm"
                  onClick={() => setOpen(false)}
                  className="bg-primary hover:bg-primary/90 text-white text-xs"
                >
                  Terminer & Accéder au tableau de bord
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
