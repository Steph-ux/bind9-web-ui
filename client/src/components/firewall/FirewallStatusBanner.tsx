import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";

import type { FirewallBackend, FirewallStatus } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

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
  if (!status.installed) {
    return (
      <Card className="border-l-4 border-yellow-500">
        <CardContent className="flex items-center gap-4 py-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-yellow-500/10">
            <AlertTriangle className="h-7 w-7 text-yellow-500" />
          </div>
          <div>
            <h5 className="mb-1 font-bold">Firewall Not Detected</h5>
            <p className="mb-2 text-muted-foreground">
              No firewall backend was found on this system. Install one of the supported backends:
            </p>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge variant="outline">UFW</Badge>
              <Badge variant="outline">firewalld</Badge>
              <Badge variant="outline">nftables</Badge>
              <Badge variant="outline">iptables</Badge>
            </div>
            <code className="block rounded bg-zinc-900 p-2 text-sm text-zinc-100">
              sudo apt-get install ufw
            </code>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-l-4 ${status.active ? "border-green-500" : "border-red-500"}`}>
      <CardContent className="flex items-center justify-between gap-4 py-5">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${
              status.active ? "bg-green-500/10" : "bg-red-500/10"
            }`}
          >
            {status.active ? (
              <ShieldCheck className="h-7 w-7 text-green-500" />
            ) : (
              <ShieldAlert className="h-7 w-7 text-red-500" />
            )}
          </div>
          <div>
            <h5 className="mb-1 flex items-center gap-2">
              Firewall is {status.active ? "Active" : "Inactive"}
              {status.active ? (
                <span
                  className="relative ml-1 inline-block"
                  style={{ width: 10, height: 10 }}
                >
                  <span className="absolute inset-0 animate-ping rounded-full bg-green-500 opacity-75" />
                  <span
                    className="relative inline-block rounded-full bg-green-500"
                    style={{ width: 10, height: 10 }}
                  />
                </span>
              ) : null}
            </h5>
            <p className="mb-0 max-w-md text-sm text-muted-foreground">
              {status.active
                ? "Your system is protected. Incoming connections are blocked unless explicitly allowed."
                : "Your system is currently exposed to all incoming traffic. Enable the firewall to secure your network."}
            </p>
            {status.availableBackends.length > 1 ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Backend:</span>
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

        <div className="flex items-center gap-3 rounded-md border bg-muted/50 p-3">
          <div className="text-right">
            <label className="mb-0 block cursor-pointer font-semibold" htmlFor="fw-toggle">
              {toggling ? "Updating..." : status.active ? "Enabled" : "Disabled"}
            </label>
            <small className={`text-xs ${status.active ? "text-green-600" : "text-muted-foreground"}`}>
              {status.active ? "Active on Startup" : "Inactive"}
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
