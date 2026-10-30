import { AlertTriangle, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  FirewallRuleFormState,
  ICMP_TYPES,
  KNOWN_SERVICES,
  RATE_LIMIT_PRESETS,
  RULE_TYPE_CONFIG,
} from "./constants";

interface FirewallRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: FirewallRuleFormState;
  setForm: Dispatch<SetStateAction<FirewallRuleFormState>>;
  saving: boolean;
  onSubmit: () => void;
}

export function FirewallRuleDialog({
  open,
  onOpenChange,
  form,
  setForm,
  saving,
  onSubmit,
}: FirewallRuleDialogProps) {
  const setField = <K extends keyof FirewallRuleFormState>(
    key: K,
    value: FirewallRuleFormState[K]
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter une règle de pare-feu</DialogTitle>
        </DialogHeader>

        <div className="mb-2">
          <Label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">Type de règle</Label>
          <div className="grid grid-cols-3 gap-2">
            {RULE_TYPE_CONFIG.map((config) => (
              <button
                key={config.value}
                type="button"
                onClick={() => {
                  setForm((current) => ({
                    ...current,
                    ruleType: config.value,
                    proto:
                      config.value === "icmp"
                        ? "icmp"
                        : config.value === "service"
                          ? "tcp"
                          : !current.proto || current.proto === "icmp"
                            ? "tcp"
                            : current.proto,
                  }));
                }}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs transition-colors ${
                  form.ruleType === config.value
                    ? "border-primary bg-primary/5 text-primary font-semibold"
                    : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <config.icon className="h-4 w-4" />
                <span className="font-medium text-center">{config.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Direction du trafic</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={form.direction === "in" ? "default" : "outline"}
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => setField("direction", "in")}
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Trafic Entrant (IN)
              </Button>
              <Button
                type="button"
                variant={form.direction === "out" ? "default" : "outline"}
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => setField("direction", "out")}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Trafic Sortant (OUT)
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Action de filtrage</Label>
            <Select value={form.action} onValueChange={(value) => setField("action", value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Autoriser (ALLOW)</SelectItem>
                <SelectItem value="deny">Bloquer silencieusement (DENY / DROP)</SelectItem>
                <SelectItem value="reject">Rejeter avec notification (REJECT)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.ruleType === "port" ? (
            <>
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Port de destination</Label>
                <Input
                  className="font-mono"
                  value={form.toPort}
                  onChange={(event) => setField("toPort", event.target.value)}
                  placeholder="ex: 53, 80, 443, 22"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Protocole</Label>
                <Select value={form.proto} onValueChange={(value) => setField("proto", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="udp">UDP</SelectItem>
                    <SelectItem value="any">Tous (TCP & UDP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          {form.ruleType === "service" ? (
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Service prédéfini</Label>
              <Select
                value={form.service}
                onValueChange={(value) => {
                  const service = KNOWN_SERVICES.find((entry) => entry.value === value);
                  setForm((current) => ({
                    ...current,
                    service: value,
                    toPort: service?.port || current.toPort,
                    proto: service?.proto || current.proto,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez un service..." />
                </SelectTrigger>
                <SelectContent>
                  {KNOWN_SERVICES.map((service) => (
                    <SelectItem key={service.value} value={service.value}>
                      {service.label} ({service.port}/{service.proto})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {form.ruleType === "portRange" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Port de début</Label>
                  <Input
                    className="font-mono"
                    value={form.toPort}
                    onChange={(event) => setField("toPort", event.target.value)}
                    placeholder="1000"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Port de fin</Label>
                  <Input
                    className="font-mono"
                    value={form.toPortEnd}
                    onChange={(event) => setField("toPortEnd", event.target.value)}
                    placeholder="2000"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Protocole</Label>
                <Select value={form.proto} onValueChange={(value) => setField("proto", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="udp">UDP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          {form.ruleType === "multiPort" ? (
            <>
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Ports (séparés par des virgules)</Label>
                <Input
                  className="font-mono"
                  value={form.toPort}
                  onChange={(event) => setField("toPort", event.target.value)}
                  placeholder="80, 443, 8080"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Protocole</Label>
                <Select value={form.proto} onValueChange={(value) => setField("proto", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="udp">UDP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          {form.ruleType === "icmp" ? (
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Type ICMP</Label>
              <Select value={form.icmpType} onValueChange={(value) => setField("icmpType", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICMP_TYPES.map((icmpType) => (
                    <SelectItem key={icmpType.value} value={icmpType.value}>
                      {icmpType.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {form.ruleType === "raw" ? (
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Commande brute nftables</Label>
              <Textarea
                className="font-mono text-sm"
                rows={3}
                value={form.rawRule}
                onChange={(event) => setField("rawRule", event.target.value)}
                placeholder="ex: ip saddr 192.168.10.0/24 tcp dport 22 accept"
              />
              <p className="text-xs text-muted-foreground">
                Seules les règles additives sont acceptées. Les caractères destructeurs sont bloqués côté serveur.
              </p>
            </div>
          ) : null}

          {form.ruleType !== "raw" ? (
            <>
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Adresse IP / Sous-réseau source</Label>
                <Input
                  className="font-mono"
                  value={form.fromIp}
                  onChange={(event) => setField("fromIp", event.target.value)}
                  placeholder="any, 192.168.10.51, 192.168.11.0/24"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Interface réseau (Optionnel)</Label>
                <Input
                  className="font-mono"
                  value={form.iface}
                  onChange={(event) => setField("iface", event.target.value)}
                  placeholder="ens18, eth0, any"
                />
              </div>

              {form.action === "allow" ? (
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Limite de débit (Optionnel)</Label>
                  <Select value={form.rateLimit} onValueChange={(value) => setField("rateLimit", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Aucune limite" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Aucune limite</SelectItem>
                      {RATE_LIMIT_PRESETS.map((limit) => (
                        <SelectItem key={limit.value} value={limit.value}>
                          {limit.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="log-rule"
                    checked={form.logEnabled}
                    onCheckedChange={(checked) => setField("logEnabled", !!checked)}
                  />
                  <Label htmlFor="log-rule" className="cursor-pointer text-sm">
                    Journaliser les paquets correspondants (Log)
                  </Label>
                </div>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Commentaire ou motif (Optionnel)</Label>
                <Input
                  value={form.comment}
                  onChange={(event) => setField("comment", event.target.value)}
                  placeholder="Décrire l'usage de cette règle..."
                />
              </div>
            </>
          ) : null}

          {(form.toPort === "22" || form.service === "ssh") &&
          (form.action === "deny" || form.action === "reject") ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Avertissement de sécurité</AlertTitle>
              <AlertDescription>
                Bloquer l'accès SSH (port 22) risque de vous couper immédiatement tout accès d'administration au serveur.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button type="button" onClick={onSubmit} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enregistrer la règle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
