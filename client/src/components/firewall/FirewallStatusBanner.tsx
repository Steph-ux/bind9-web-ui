import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";

import type { FirewallBackend, FirewallStatus } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";

interface FirewallStatusBannerProps {
  status: FirewallStatus;
  toggling: boolean;
  onToggle: (enabled: boolean) => void;
  onSwitchBackend: (backend: FirewallBackend) => void;
}

export function FirewallStatusBanner({
  status,
  toggling,
  onToggle,
  onSwitchBackend,
}: FirewallStatusBannerProps) {
  const { t } = useI18n();

  if (!status.installed) {
    return (
      <Card className="border-l-4 border-amber-500/80 bg-card/75 shadow-none">
        <CardContent className="flex items-center gap-4 py-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h5 className="font-bold text-sm tracking-tight text-foreground">{t.firewall.statusNotDetected}</h5>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              {t.firewall.notDetectedDesc}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Badge variant="outline" className="text-[10px] font-mono">UFW</Badge>
              <Badge variant="outline" className="text-[10px] font-mono">firewalld</Badge>
              <Badge variant="outline" className="text-[10px] font-mono">nftables</Badge>
              <Badge variant="outline" className="text-[10px] font-mono">iptables</Badge>
            </div>
            <code className="inline-block rounded-lg bg-muted px-2.5 py-1 text-xs font-mono text-foreground border border-border/60 mt-1">
              sudo apt-get install ufw
            </code>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-l-4 bg-card/75 shadow-none ${status.active ? "border-emerald-500" : "border-rose-500"}`}>
      <CardContent className="flex items-center justify-between gap-4 py-4 px-5">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
              status.active ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
            }`}
          >
            {status.active ? (
              <ShieldCheck className="h-6 w-6" />
            ) : (
              <ShieldAlert className="h-6 w-6" />
            )}
          </div>
          <div>
            <h5 className="mb-1 flex items-center gap-2 text-sm font-bold tracking-tight text-foreground">
              {status.active ? t.firewall.statusActive : t.firewall.statusInactive}
              {status.active ? (
                <span
                  className="relative ml-1 inline-block"
                  style={{ width: 8, height: 8 }}
                >
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-75" />
                  <span
                    className="relative inline-block rounded-full bg-emerald-500"
                    style={{ width: 8, height: 8 }}
                  />
                </span>
              ) : null}
            </h5>
            <p className="mb-0 max-w-xl text-xs text-muted-foreground leading-relaxed">
              {status.active
                ? t.firewall.protectedDesc
                : t.firewall.exposedDesc}
            </p>
            {status.availableBackends.length > 1 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Backend:</span>
                {status.availableBackends.map((backend) => (
                  <Badge
                    key={backend}
                    variant={backend === status.backend ? "default" : "outline"}
                    className="cursor-pointer font-mono text-[10px] hover:bg-primary/20"
                    onClick={() => {
                      if (backend !== status.backend) {
                        onSwitchBackend(backend);
                      }
                    }}
                  >
                    {backend === "nftables" ? "nft" : backend.toUpperCase()}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5">
          <div className="text-right">
            <label className="mb-0 block cursor-pointer text-xs font-semibold" htmlFor="fw-toggle">
              {toggling ? t.firewall.updating : status.active ? t.firewall.enabled : t.firewall.disabled}
            </label>
            <small className={`text-[10px] font-medium ${status.active ? "text-emerald-500" : "text-muted-foreground"}`}>
              {status.active ? t.firewall.activeOnStartup : t.firewall.statusInactive}
            </small>
          </div>
          <Switch
            id="fw-toggle"
            checked={status.active}
            onCheckedChange={onToggle}
            disabled={toggling}
          />
        </div>
      </CardContent>
    </Card>
  );
}
