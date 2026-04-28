import {
  AlertTriangle,
  Globe,
  Heart,
  Pencil,
  Plug,
  Power,
  PowerOff,
  Server,
  Trash2,
} from "lucide-react";

import type { HealthCheckEntry, ReplicationServerEntry } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReplicationServersSectionProps {
  servers: ReplicationServerEntry[];
  healthChecks?: HealthCheckEntry[];
  testing: boolean;
  onTest: (serverId: string) => void;
  onToggleEnabled: (server: ReplicationServerEntry) => void;
  onManageZones: (server: ReplicationServerEntry) => void;
  onEdit: (server: ReplicationServerEntry) => void;
  onDelete: (server: ReplicationServerEntry) => void;
}

function renderStatusBadge(status: string) {
  if (status === "success") {
    return <Badge className="bg-green-600">Connected</Badge>;
  }
  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  if (status === "pending") {
    return <Badge className="bg-yellow-600">Pending</Badge>;
  }
  return <Badge variant="secondary">Never</Badge>;
}

export function ReplicationServersSection({
  servers,
  healthChecks,
  testing,
  onTest,
  onToggleEnabled,
  onManageZones,
  onEdit,
  onDelete,
}: ReplicationServersSectionProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {servers.map((server) => {
        const healthCheck = healthChecks?.find((entry) => entry.serverId === server.id);

        return (
          <Card key={server.id} className={!server.enabled ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Server className="h-4 w-4" />
                  {server.name}
                  {healthCheck && server.enabled ? (
                    healthCheck.status === "healthy" ? (
                      <Heart className="h-3.5 w-3.5 text-green-500" />
                    ) : healthCheck.status === "degraded" ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    )
                  ) : null}
                </CardTitle>
                {renderStatusBadge(server.lastSyncStatus)}
              </div>
            </CardHeader>

            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Host</span>
                <span className="font-mono">
                  {server.host}:{server.port}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Role</span>
                <Badge variant="outline">{server.role}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Sync</span>
                <span>{server.lastSyncAt ? new Date(server.lastSyncAt).toLocaleString() : "Never"}</span>
              </div>

              <div className="flex gap-1 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => onTest(server.id)}
                  disabled={testing}
                >
                  <Plug className="h-3 w-3" />
                  Test
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => onToggleEnabled(server)}
                >
                  {server.enabled ? (
                    <>
                      <PowerOff className="h-3 w-3" />
                      Disable
                    </>
                  ) : (
                    <>
                      <Power className="h-3 w-3" />
                      Enable
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  title="Manage zones"
                  onClick={() => onManageZones(server)}
                >
                  <Globe className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8" onClick={() => onEdit(server)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8" onClick={() => onDelete(server)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
