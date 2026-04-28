import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, Loader2, Plus, RefreshCw, Server } from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard, PageHeader, PageState } from "@/components/layout";
import {
  DEFAULT_NOTIFICATION_CHANNEL_FORM,
  DEFAULT_REPLICATION_SERVER_FORM,
  type NotificationChannelFormState,
  type ReplicationBindingDraft,
  type ReplicationServerFormState,
} from "@/components/replication/constants";
import { NotificationChannelDialog, ReplicationZoneBindingsDialog } from "@/components/replication/ReplicationAuxDialogs";
import { ReplicationServerDialog } from "@/components/replication/ReplicationServerDialog";
import { ReplicationServersSection } from "@/components/replication/ReplicationServersSection";
import {
  ReplicationBackupsSection,
  ReplicationConflictsSection,
  ReplicationHistorySection,
  ReplicationNotificationSection,
} from "@/components/replication/ReplicationSections";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createBackup,
  createNotificationChannel,
  createReplicationServer,
  deleteBackup,
  deleteNotificationChannel,
  deleteReplicationServer,
  detectReplicationConflicts,
  getBackups,
  getHealthChecks,
  getNotificationChannels,
  getReplicationConflicts,
  getReplicationServers,
  getReplicationStats,
  getReplicationZoneBindings,
  getSyncHistory,
  getSyncMetrics,
  getZones,
  resolveAllReplicationConflicts,
  resolveReplicationConflict,
  restoreBackup,
  runHealthChecks,
  setReplicationZoneBindings,
  syncAllReplication,
  testReplicationServer,
  updateReplicationServer,
  type BackupEntry,
  type HealthCheckEntry,
  type NotificationChannelEntry,
  type ReplicationConflictEntry,
  type ReplicationServerEntry,
  type ReplicationStats,
  type ReplicationZoneBindingEntry,
  type SyncHistoryEntry,
  type SyncMetrics,
  type ZoneData,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { useReplicationWs } from "@/hooks/use-repl-ws";

function createServerForm(): ReplicationServerFormState {
  return { ...DEFAULT_REPLICATION_SERVER_FORM };
}

function createChannelForm(): NotificationChannelFormState {
  return { ...DEFAULT_NOTIFICATION_CHANNEL_FORM };
}

export default function ReplicationPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useReplicationWs();

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ReplicationServerEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReplicationServerEntry | null>(null);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);
  const [bindingTarget, setBindingTarget] = useState<ReplicationServerEntry | null>(null);
  const [bindingZones, setBindingZones] = useState<ReplicationBindingDraft[]>([]);
  const [bindingLoading, setBindingLoading] = useState(false);
  const [serverForm, setServerForm] = useState<ReplicationServerFormState>(createServerForm);
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [channelForm, setChannelForm] = useState<NotificationChannelFormState>(createChannelForm);

  const { data: servers, isLoading } = useQuery<ReplicationServerEntry[]>({
    queryKey: ["replication"],
    queryFn: getReplicationServers,
  });

  const { data: stats } = useQuery<ReplicationStats>({
    queryKey: ["replication-stats"],
    queryFn: getReplicationStats,
  });

  const { data: healthChecks } = useQuery<HealthCheckEntry[]>({
    queryKey: ["health-checks"],
    queryFn: () => getHealthChecks(),
    refetchInterval: 30000,
  });

  const { data: channels } = useQuery<NotificationChannelEntry[]>({
    queryKey: ["notification-channels"],
    queryFn: getNotificationChannels,
  });

  const { data: syncMetrics } = useQuery<SyncMetrics>({
    queryKey: ["sync-metrics"],
    queryFn: () => getSyncMetrics(),
  });

  const { data: syncHistoryData } = useQuery<SyncHistoryEntry[]>({
    queryKey: ["sync-history"],
    queryFn: () => getSyncHistory(undefined, 20),
  });

  const { data: backups } = useQuery<BackupEntry[]>({
    queryKey: ["backups"],
    queryFn: () => getBackups(),
  });

  const { data: conflicts } = useQuery<ReplicationConflictEntry[]>({
    queryKey: ["replication-conflicts"],
    queryFn: () => getReplicationConflicts(false),
  });

  const createMutation = useMutation({
    mutationFn: createReplicationServer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["replication"] });
      setAddOpen(false);
      setServerForm(createServerForm());
      toast({ title: "Server added" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to add server", description: error.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ReplicationServerEntry> }) =>
      updateReplicationServer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["replication"] });
      setEditTarget(null);
      setServerForm(createServerForm());
      toast({ title: "Server updated" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to update server", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteReplicationServer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["replication"] });
      setDeleteTarget(null);
      toast({ title: "Server deleted" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to delete server", description: error.message });
    },
  });

  const syncMutation = useMutation({
    mutationFn: syncAllReplication,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["replication"] });
      const successCount = result.results.filter((entry) => entry.success).length;
      toast({
        title: "Sync completed",
        description: `${successCount}/${result.results.length} servers OK (${result.totalZones} zones, ${result.duration}ms)`,
      });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Sync failed", description: error.message });
    },
  });

  const testMutation = useMutation({
    mutationFn: testReplicationServer,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["replication"] });
      toast({
        variant: result.success ? "default" : "destructive",
        title: result.success ? "Connection successful" : "Connection failed",
        description: result.message,
      });
      setTestingServerId(null);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Connection failed", description: error.message });
      setTestingServerId(null);
    },
  });

  const detectMutation = useMutation({
    mutationFn: detectReplicationConflicts,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["replication-conflicts"] });
      toast({ title: "Conflict detection complete", description: `${result.detected} new conflicts found` });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Detection failed", description: error.message });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: resolveReplicationConflict,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["replication-conflicts"] });
      toast({ title: "Conflict resolved" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to resolve", description: error.message });
    },
  });

  const resolveAllMutation = useMutation({
    mutationFn: resolveAllReplicationConflicts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["replication-conflicts"] });
      toast({ title: "All conflicts resolved" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to resolve all", description: error.message });
    },
  });

  if (!user || user.role !== "admin") {
    return (
      <DashboardLayout>
        <PageState
          title="Access denied"
          description="You need administrator privileges to manage replication."
          icon={AlertTriangle}
          tone="danger"
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  const resetServerForm = () => setServerForm(createServerForm());
  const resetChannelForm = () => setChannelForm(createChannelForm());

  const openAddServerDialog = () => {
    resetServerForm();
    setAddOpen(true);
  };

  const openEditDialog = (server: ReplicationServerEntry) => {
    setServerForm({
      name: server.name,
      host: server.host,
      port: String(server.port),
      username: server.username,
      authType: server.authType,
      password: "",
      privateKey: "",
      bind9ConfDir: server.bind9ConfDir || "/etc/bind",
      bind9ZoneDir: server.bind9ZoneDir || "",
      role: server.role,
    });
    setEditTarget(server);
  };

  const handleCreateServer = () => {
    createMutation.mutate({
      name: serverForm.name,
      host: serverForm.host,
      port: parseInt(serverForm.port, 10) || 22,
      username: serverForm.username,
      authType: serverForm.authType,
      password: serverForm.password,
      privateKey: serverForm.privateKey,
      bind9ConfDir: serverForm.bind9ConfDir,
      bind9ZoneDir: serverForm.bind9ZoneDir,
      role: serverForm.role,
    });
  };

  const handleUpdateServer = () => {
    if (!editTarget) {
      return;
    }

    const data: Partial<ReplicationServerEntry> = {};
    if (serverForm.name !== editTarget.name) data.name = serverForm.name;
    if (serverForm.host !== editTarget.host) data.host = serverForm.host;
    if ((parseInt(serverForm.port, 10) || 22) !== editTarget.port) data.port = parseInt(serverForm.port, 10) || 22;
    if (serverForm.username !== editTarget.username) data.username = serverForm.username;
    if (serverForm.authType !== editTarget.authType) data.authType = serverForm.authType;
    if (serverForm.password) data.password = serverForm.password;
    if (serverForm.privateKey) data.privateKey = serverForm.privateKey;
    if (serverForm.bind9ConfDir !== (editTarget.bind9ConfDir || "/etc/bind")) data.bind9ConfDir = serverForm.bind9ConfDir;
    if (serverForm.bind9ZoneDir !== (editTarget.bind9ZoneDir || "")) data.bind9ZoneDir = serverForm.bind9ZoneDir;
    if (serverForm.role !== editTarget.role) data.role = serverForm.role;

    updateMutation.mutate({ id: editTarget.id, data });
  };

  const handleToggleEnabled = (server: ReplicationServerEntry) => {
    updateMutation.mutate({ id: server.id, data: { enabled: !server.enabled } });
  };

  const handleTestServer = (serverId: string) => {
    setTestingServerId(serverId);
    testMutation.mutate(serverId);
  };

  const handleManageZones = async (server: ReplicationServerEntry) => {
    setBindingTarget(server);
    setBindingLoading(true);
    try {
      const [bindings, allZones] = await Promise.all([
        getReplicationZoneBindings(server.id),
        getZones(),
      ]);
      const bindingMap = new Map(
        bindings.map((binding: ReplicationZoneBindingEntry) => [binding.zoneId, binding])
      );
      setBindingZones(
        allZones
          .filter((zone: ZoneData) => zone.type === "master" && zone.status === "active")
          .map((zone: ZoneData) => ({
            id: zone.id,
            domain: zone.domain,
            enabled: bindingMap.has(zone.id) ? bindingMap.get(zone.id)!.enabled : true,
            mode: bindingMap.get(zone.id)?.mode || "push",
          }))
      );
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to load bindings", description: error.message });
    } finally {
      setBindingLoading(false);
    }
  };

  const handleSaveBindings = async () => {
    if (!bindingTarget) {
      return;
    }
    try {
      await setReplicationZoneBindings(
        bindingTarget.id,
        bindingZones.map((binding) => ({
          zoneId: binding.id,
          mode: binding.mode,
          enabled: binding.enabled,
        }))
      );
      toast({ title: "Zone bindings updated" });
      setBindingTarget(null);
      queryClient.invalidateQueries({ queryKey: ["replication"] });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to save bindings", description: error.message });
    }
  };

  const handleHealthCheck = async () => {
    try {
      await runHealthChecks();
      queryClient.invalidateQueries({ queryKey: ["health-checks"] });
      toast({ title: "Health check completed" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Health check failed", description: error.message });
    }
  };

  const handleCreateChannel = async () => {
    try {
      const config: Record<string, string> = {};
      if (channelForm.type === "webhook") config.url = channelForm.url;
      if (channelForm.type === "slack") config.webhookUrl = channelForm.url;
      if (channelForm.type === "email") config.email = channelForm.email;

      await createNotificationChannel({
        name: channelForm.name,
        type: channelForm.type,
        config,
      });
      toast({ title: "Channel created" });
      setAddChannelOpen(false);
      resetChannelForm();
      queryClient.invalidateQueries({ queryKey: ["notification-channels"] });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed", description: error.message });
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    try {
      await deleteNotificationChannel(channelId);
      queryClient.invalidateQueries({ queryKey: ["notification-channels"] });
      toast({ title: "Channel deleted" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed", description: error.message });
    }
  };

  const handleCreateBackup = async (scope: "full" | "zones") => {
    try {
      await createBackup("manual", scope);
      toast({ title: scope === "full" ? "Full backup created" : "Zone backup created" });
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Backup failed", description: error.message });
    }
  };

  const handleRestoreBackup = async (backupId: string) => {
    try {
      const result = await restoreBackup(backupId);
      toast({
        title: result.success ? "Restored" : "Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      if (result.success) {
        queryClient.invalidateQueries();
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Restore failed", description: error.message });
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    try {
      await deleteBackup(backupId);
      toast({ title: "Backup deleted" });
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed", description: error.message });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Replication Servers"
          description="Manage slave and secondary BIND9 nodes, synchronization health and recovery workflows."
          icon={Server}
          badge={<Badge variant="outline">{servers?.length || 0} configured nodes</Badge>}
          actions={
            <>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Sync All
              </Button>
              <Button variant="outline" className="gap-2" onClick={handleHealthCheck}>
                <Activity className="h-4 w-4" />
                Health Check
              </Button>
              <Button className="gap-2" onClick={openAddServerDialog}>
                <Plus className="h-4 w-4" />
                Add Server
              </Button>
            </>
          }
        />

        {stats ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Servers"
              value={stats.totalServers}
              description={`${stats.enabledServers} enabled, ${stats.connectedServers} connected`}
              icon={Server}
            />
            <MetricCard
              label="Master Zones"
              value={stats.totalZones}
              description="Zones available for replication."
              icon={Server}
            />
            <MetricCard
              label="Conflicts"
              value={stats.unresolvedConflicts}
              description={`${stats.serialMismatches} serial, ${stats.zoneMissing} missing`}
              icon={AlertTriangle}
              tone={stats.unresolvedConflicts > 0 ? "warning" : "success"}
            />
            <MetricCard
              label="Last Sync"
              value={stats.lastSyncAt ? new Date(stats.lastSyncAt).toLocaleString() : "Never"}
              description={`${stats.failedServers} failed, ${stats.neverSyncedServers} never synced`}
              icon={RefreshCw}
            />
            {syncMetrics ? (
              <MetricCard
                label="Sync Rate"
                value={`${syncMetrics.total > 0 ? Math.round((syncMetrics.success / syncMetrics.total) * 100) : 0}%`}
                description={`${syncMetrics.success}/${syncMetrics.total} OK, avg ${syncMetrics.avgDurationMs}ms`}
                icon={Activity}
                tone="success"
              />
            ) : null}
          </div>
        ) : null}

        {isLoading ? (
          <PageState
            loading
            title="Loading replication servers"
            description="Fetching replication topology, health state and recent history."
            className="min-h-[40vh]"
          />
        ) : !servers || servers.length === 0 ? (
          <PageState
            title="No replication servers"
            description="Add a slave or secondary server to start replicating zones."
            icon={Server}
            action={
              <Button className="gap-2" onClick={openAddServerDialog}>
                <Plus className="h-4 w-4" />
                Add Server
              </Button>
            }
          />
        ) : (
          <ReplicationServersSection
            servers={servers}
            healthChecks={healthChecks}
            testing={testingServerId !== null}
            onTest={handleTestServer}
            onToggleEnabled={handleToggleEnabled}
            onManageZones={handleManageZones}
            onEdit={openEditDialog}
            onDelete={setDeleteTarget}
          />
        )}

        <ReplicationConflictsSection
          conflicts={conflicts}
          detecting={detectMutation.isPending}
          resolvingAll={resolveAllMutation.isPending}
          onDetect={() => detectMutation.mutate()}
          onResolveAll={() => resolveAllMutation.mutate()}
          onResolve={(conflictId) => resolveMutation.mutate(conflictId)}
        />

        <ReplicationHistorySection history={syncHistoryData} />

        <ReplicationNotificationSection
          channels={channels}
          onOpenCreate={() => setAddChannelOpen(true)}
          onDelete={handleDeleteChannel}
        />

        <ReplicationBackupsSection
          backups={backups}
          onCreateBackup={handleCreateBackup}
          onRestore={handleRestoreBackup}
          onDelete={handleDeleteBackup}
        />
      </div>

      <ReplicationServerDialog
        open={addOpen}
        title="Add Replication Server"
        submitLabel="Add Server"
        saving={createMutation.isPending}
        form={serverForm}
        setForm={setServerForm}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            resetServerForm();
          }
        }}
        onSubmit={handleCreateServer}
      />

      <ReplicationServerDialog
        open={!!editTarget}
        title={`Edit: ${editTarget?.name || ""}`}
        submitLabel="Save Changes"
        saving={updateMutation.isPending}
        form={serverForm}
        setForm={setServerForm}
        editTarget={editTarget}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
            resetServerForm();
          }
        }}
        onSubmit={handleUpdateServer}
      />

      <ReplicationZoneBindingsDialog
        open={!!bindingTarget}
        serverName={bindingTarget?.name}
        loading={bindingLoading}
        bindings={bindingZones}
        setBindings={setBindingZones}
        onOpenChange={(open) => {
          if (!open) {
            setBindingTarget(null);
          }
        }}
        onSave={handleSaveBindings}
      />

      <NotificationChannelDialog
        open={addChannelOpen}
        form={channelForm}
        setForm={setChannelForm}
        onOpenChange={(open) => {
          setAddChannelOpen(open);
          if (!open) {
            resetChannelForm();
          }
        }}
        onSubmit={handleCreateChannel}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Server</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will not affect the remote server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
