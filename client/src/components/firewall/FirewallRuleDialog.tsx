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
          <DialogTitle>Add Firewall Rule</DialogTitle>
        </DialogHeader>

        <div className="mb-2">
          <Label className="mb-2 block">Rule Type</Label>
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
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <config.icon className="h-4 w-4" />
                <span className="font-medium">{config.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Direction</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={form.direction === "in" ? "default" : "outline"}
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => setField("direction", "in")}
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Inbound
              </Button>
              <Button
                type="button"
                variant={form.direction === "out" ? "default" : "outline"}
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => setField("direction", "out")}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Outbound
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Action</Label>
            <Select value={form.action} onValueChange={(value) => setField("action", value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">ALLOW</SelectItem>
                <SelectItem value="deny">DENY</SelectItem>
                <SelectItem value="reject">REJECT</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.ruleType === "port" ? (
            <>
              <div className="grid gap-2">
                <Label>Port</Label>
                <Input
                  className="font-mono"
                  value={form.toPort}
                  onChange={(event) => setField("toPort", event.target.value)}
                  placeholder="80, 443, 22"
                />
              </div>
              <div className="grid gap-2">
                <Label>Protocol</Label>
                <Select value={form.proto} onValueChange={(value) => setField("proto", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="udp">UDP</SelectItem>
                    <SelectItem value="any">Any</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          {form.ruleType === "service" ? (
            <div className="grid gap-2">
              <Label>Service</Label>
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
                  <SelectValue placeholder="Select a service..." />
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
                  <Label>Start Port</Label>
                  <Input
                    className="font-mono"
                    value={form.toPort}
                    onChange={(event) => setField("toPort", event.target.value)}
                    placeholder="1000"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>End Port</Label>
                  <Input
                    className="font-mono"
                    value={form.toPortEnd}
                    onChange={(event) => setField("toPortEnd", event.target.value)}
                    placeholder="2000"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Protocol</Label>
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
                <Label>Ports (comma-separated)</Label>
                <Input
                  className="font-mono"
                  value={form.toPort}
                  onChange={(event) => setField("toPort", event.target.value)}
                  placeholder="80, 443, 8080"
                />
              </div>
              <div className="grid gap-2">
                <Label>Protocol</Label>
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
              <Label>ICMP Type</Label>
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
              <Label>Raw Command</Label>
              <Textarea
                className="font-mono text-sm"
                rows={3}
                value={form.rawRule}
                onChange={(event) => setField("rawRule", event.target.value)}
                placeholder="e.g. allow from 192.168.1.0/24 to any port 22 proto tcp"
              />
              <p className="text-xs text-muted-foreground">
                Only additive rule fragments are accepted. Destructive flags and shell characters are blocked server-side.
              </p>
            </div>
          ) : null}

          {form.ruleType !== "raw" ? (
            <>
              <div className="grid gap-2">
                <Label>From IP / Network</Label>
                <Input
                  className="font-mono"
                  value={form.fromIp}
                  onChange={(event) => setField("fromIp", event.target.value)}
                  placeholder="any, 192.168.1.0/24, 10.0.0.5"
                />
              </div>

              <div className="grid gap-2">
                <Label>Interface (optional)</Label>
                <Input
                  className="font-mono"
                  value={form.iface}
                  onChange={(event) => setField("iface", event.target.value)}
                  placeholder="eth0, wlan0, lo"
                />
              </div>

              {form.action === "allow" ? (
                <div className="grid gap-2">
                  <Label>Rate Limit (optional)</Label>
                  <Select value={form.rateLimit} onValueChange={(value) => setField("rateLimit", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="No limit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">No limit</SelectItem>
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
                    Log matches
                  </Label>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Comment (optional)</Label>
                <Input
                  value={form.comment}
                  onChange={(event) => setField("comment", event.target.value)}
                  placeholder="Describe this rule..."
                />
              </div>
            </>
          ) : null}

          {(form.toPort === "22" || form.service === "ssh") &&
          (form.action === "deny" || form.action === "reject") ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                Denying SSH access may lock you out of the server immediately.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="gap-2" onClick={onSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
