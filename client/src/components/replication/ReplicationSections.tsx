import {
  AlertTriangle,
  Archive,
  Bell,
  CheckCircle,
  Globe,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Webhook,
} from "lucide-react";

import type {
  BackupEntry,
  NotificationChannelEntry,
  ReplicationConflictEntry,
  SyncHistoryEntry,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ReplicationConflictsSectionProps {
  conflicts?: ReplicationConflictEntry[];
  detecting: boolean;
  resolvingAll: boolean;
  onDetect: () => void;
  onResolveAll: () => void;
  onResolve: (conflictId: string) => void;
}

export function ReplicationConflictsSection({
  conflicts,
  detecting,
  resolvingAll,
  onDetect,
  onResolveAll,
  onResolve,
}: ReplicationConflictsSectionProps) {
  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Conflicts
            {conflicts && conflicts.length > 0 ? <Badge variant="destructive">{conflicts.length}</Badge> : null}
          </h3>
          <p className="text-sm text-muted-foreground">
            Serial mismatches and missing zones on slave servers.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onDetect}
            disabled={detecting}
          >
            <RefreshCw className={`h-3 w-3 ${detecting ? "animate-spin" : ""}`} />
            Detect
          </Button>
          {conflicts && conflicts.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={onResolveAll}
              disabled={resolvingAll}
            >
              <CheckCircle className="h-3 w-3" />
              Resolve All
            </Button>
          ) : null}
        </div>
      </div>

      {!conflicts || conflicts.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <CheckCircle className="mr-3 h-8 w-8 text-green-500" />
            <span className="text-muted-foreground">No unresolved conflicts detected</span>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">Zone</th>
                  <th className="px-4 py-3 text-left font-medium">Server</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Master Serial</th>
                  <th className="px-4 py-3 text-left font-medium">Slave Serial</th>
                  <th className="px-4 py-3 text-left font-medium">Detected</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map((conflict) => (
                  <tr key={conflict.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-2 font-mono">{conflict.zoneDomain}</td>
                    <td className="px-4 py-2">{conflict.serverName}</td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={conflict.conflictType === "zone_missing" ? "destructive" : "outline"}
                      >
                        {conflict.conflictType.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 font-mono">{conflict.masterSerial || "-"}</td>
                    <td className="px-4 py-2 font-mono">{conflict.slaveSerial || "-"}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(conflict.detectedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => onResolve(conflict.id)}>
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface ReplicationHistorySectionProps {
  history?: SyncHistoryEntry[];
}

export function ReplicationHistorySection({ history }: ReplicationHistorySectionProps) {
  if (!history || history.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <RefreshCw className="h-5 w-5" />
        Recent Sync History
      </h3>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Zone</th>
                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Action</th>
                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Status</th>
                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Duration</th>
                <th className="h-10 px-4 text-left font-medium text-muted-foreground">Time</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-2 font-mono">{entry.zoneDomain}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className="capitalize">
                      {entry.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    {entry.success ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        OK
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-600">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Fail
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {entry.durationMs != null ? `${entry.durationMs}ms` : "-"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

interface ReplicationNotificationSectionProps {
  channels?: NotificationChannelEntry[];
  onOpenCreate: () => void;
  onDelete: (channelId: string) => void;
}

export function ReplicationNotificationSection({
  channels,
  onOpenCreate,
  onDelete,
}: ReplicationNotificationSectionProps) {
  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Bell className="h-5 w-5" />
          Notification Channels
        </h3>
        <Button variant="outline" size="sm" className="gap-2" onClick={onOpenCreate}>
          <Plus className="h-4 w-4" />
          Add Channel
        </Button>
      </div>

      {channels && channels.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => {
            let config: Record<string, string> = {};
            try {
              config = JSON.parse(channel.config);
            } catch {}

            return (
              <Card key={channel.id}>
                <CardContent className="space-y-2 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {channel.type === "webhook" ? (
                        <Webhook className="h-4 w-4" />
                      ) : channel.type === "slack" ? (
                        <MessageSquare className="h-4 w-4" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                      <span className="font-medium">{channel.name}</span>
                    </div>
                    <Badge variant={channel.enabled ? "default" : "secondary"}>
                      {channel.enabled ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="capitalize">{channel.type}</span>
                    {config.url ? <span className="ml-2 font-mono">{config.url.replace(/^https?:\/\/[^/]+/, "***")}</span> : null}
                    {config.webhookUrl ? (
                      <span className="ml-2 font-mono">
                        {config.webhookUrl.replace(/^https?:\/\/[^/]+/, "***")}
                      </span>
                    ) : null}
                    {config.email ? <span className="ml-2">{config.email}</span> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">Events: {channel.events}</div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => onDelete(channel.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center py-8">
            <Bell className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No notification channels configured.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface ReplicationBackupsSectionProps {
  backups?: BackupEntry[];
  onCreateBackup: (scope: "full" | "zones") => void;
  onRestore: (backupId: string) => void;
  onDelete: (backupId: string) => void;
}

export function ReplicationBackupsSection({
  backups,
  onCreateBackup,
  onRestore,
  onDelete,
}: ReplicationBackupsSectionProps) {
  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Archive className="h-5 w-5" />
          Backups & Disaster Recovery
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => onCreateBackup("full")}>
            <Archive className="h-4 w-4" />
            Full Backup
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => onCreateBackup("zones")}>
            <Globe className="h-4 w-4" />
            Zones Only
          </Button>
        </div>
      </div>

      {backups && backups.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Type</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Scope</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Description</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Size</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Created</th>
                  <th className="h-10 px-4 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr key={backup.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-2">
                      <Badge
                        variant={
                          backup.type === "auto"
                            ? "secondary"
                            : backup.type === "snapshot"
                              ? "outline"
                              : "default"
                        }
                      >
                        {backup.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <span className="capitalize">{backup.scope.replace("_", " ")}</span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{backup.description}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {backup.sizeBytes ? `${(backup.sizeBytes / 1024).toFixed(1)} KB` : "-"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(backup.createdAt).toLocaleString()}
                    </td>
                    <td className="flex justify-end gap-1 px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1"
                        onClick={() => onRestore(backup.id)}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7" onClick={() => onDelete(backup.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center py-8">
            <Archive className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No backups yet. Auto-backups run every 6 hours.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
