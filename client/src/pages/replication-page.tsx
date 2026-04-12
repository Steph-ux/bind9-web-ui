import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { Server, Plus, Trash2, Loader2, ShieldAlert, Plug, Pencil, Power, PowerOff, RefreshCw, Bell, AlertTriangle, CheckCircle, Globe } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getReplicationServers, createReplicationServer, updateReplicationServer, deleteReplicationServer, testReplicationServer, syncAllReplication, getReplicationConflicts, detectReplicationConflicts, resolveReplicationConflict, resolveAllReplicationConflicts, getReplicationStats, getReplicationZoneBindings, setReplicationZoneBindings, type ReplicationServerEntry, type ReplicationConflictEntry, type ReplicationStats, type ReplicationZoneBindingEntry } from "@/lib/api";

export default function ReplicationPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ReplicationServerEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReplicationServerEntry | null>(null);
  const [testTarget, setTestTarget] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [bindingTarget, setBindingTarget] = useState<ReplicationServerEntry | null>(null);
  const [bindingZones, setBindingZones] = useState<{ id: string; domain: string; enabled: boolean; mode: "push" | "pull" | "both" }[]>([]);
  const [bindingLoading, setBindingLoading] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formHost, setFormHost] = useState("");
  const [formPort, setFormPort] = useState("22");
  const [formUsername, setFormUsername] = useState("root");
  const [formAuthType, setFormAuthType] = useState<"password" | "key">("password");
  const [formPassword, setFormPassword] = useState("");
  const [formKey, setFormKey] = useState("");
  const [formConfDir, setFormConfDir] = useState("/etc/bind");
  const [formZoneDir, setFormZoneDir] = useState("/var/lib/bind");
  const [formRole, setFormRole] = useState<"slave" | "secondary">("slave");

  const resetForm = () => {
    setFormName(""); setFormHost(""); setFormPort("22"); setFormUsername("root");
    setFormAuthType("password"); setFormPassword(""); setFormKey("");
    setFormConfDir("/etc/bind"); setFormZoneDir("/var/lib/bind"); setFormRole("slave");
  };

  const { data: servers, isLoading } = useQuery<ReplicationServerEntry[]>({
    queryKey: ["replication"],
    queryFn: getReplicationServers,
  });

  const createMutation = useMutation({
    mutationFn: createReplicationServer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["replication"] });
      setAddOpen(false);
      resetForm();
      toast({ title: "Server added" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Failed to add server", description: err.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ReplicationServerEntry> }) =>
      updateReplicationServer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["replication"] });
      setEditTarget(null);
      resetForm();
      toast({ title: "Server updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Failed to update server", description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteReplicationServer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["replication"] });
      setDeleteTarget(null);
      toast({ title: "Server deleted" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Failed to delete server", description: err.message });
    },
  });

  const { data: conflicts } = useQuery<ReplicationConflictEntry[]>({
    queryKey: ["replication-conflicts"],
    queryFn: () => getReplicationConflicts(false),
  });

  const { data: stats } = useQuery<ReplicationStats>({
    queryKey: ["replication-stats"],
    queryFn: getReplicationStats,
  });

  const syncMutation = useMutation({
    mutationFn: syncAllReplication,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["replication"] });
      const ok = result.results.filter(r => r.success).length;
      toast({ title: "Sync completed", description: `${ok}/${result.results.length} servers OK (${result.totalZones} zones, ${result.duration}ms)` });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Sync failed", description: err.message });
    },
  });

  const testMutation = useMutation({
    mutationFn: testReplicationServer,
    onSuccess: (result, id) => {
      setTestResult(result);
      queryClient.invalidateQueries({ queryKey: ["replication"] });
      if (result.success) {
        toast({ title: "Connection successful", description: result.message });
      } else {
        toast({ variant: "destructive", title: "Connection failed", description: result.message });
      }
      setTestTarget(null);
    },
    onError: (err: Error) => {
      setTestResult({ success: false, message: err.message });
      setTestTarget(null);
    },
  });

  const detectMutation = useMutation({
    mutationFn: detectReplicationConflicts,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["replication-conflicts"] });
      toast({ title: "Conflict detection complete", description: `${result.detected} new conflicts found` });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Detection failed", description: err.message });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: resolveReplicationConflict,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["replication-conflicts"] });
      toast({ title: "Conflict resolved" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Failed to resolve", description: err.message });
    },
  });

  const resolveAllMutation = useMutation({
    mutationFn: resolveAllReplicationConflicts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["replication-conflicts"] });
      toast({ title: "All conflicts resolved" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Failed to resolve all", description: err.message });
    },
  });

  if (!user || user.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center" style={{ height: "60vh" }}>
          <div className="text-center">
            <ShieldAlert className="h-12 w-12 text-destructive mb-3" />
            <h4 className="font-semibold">Access Denied</h4>
            <p className="text-muted-foreground">You need admin role to access this page.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const statusBadge = (status: string) => {
    if (status === "success") return <Badge className="bg-green-600">Connected</Badge>;
    if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
    if (status === "pending") return <Badge className="bg-yellow-600">Pending</Badge>;
    return <Badge variant="secondary">Never</Badge>;
  };

  const openEdit = (s: ReplicationServerEntry) => {
    setFormName(s.name); setFormHost(s.host); setFormPort(String(s.port));
    setFormUsername(s.username); setFormAuthType(s.authType);
    setFormPassword(""); setFormKey("");
    setFormConfDir(s.bind9ConfDir || "/etc/bind");
    setFormZoneDir(s.bind9ZoneDir || "/var/lib/bind");
    setFormRole(s.role);
    setEditTarget(s);
  };

  const formFields = (
    <>
      <div className="grid gap-2">
        <Label>Name</Label>
        <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="ns2.example.com" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 grid gap-2">
          <Label>Host</Label>
          <Input value={formHost} onChange={e => setFormHost(e.target.value)} placeholder="192.168.1.2" />
        </div>
        <div className="grid gap-2">
          <Label>Port</Label>
          <Input type="number" value={formPort} onChange={e => setFormPort(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Username</Label>
        <Input value={formUsername} onChange={e => setFormUsername(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>Auth Type</Label>
        <Select value={formAuthType} onValueChange={v => setFormAuthType(v as "password" | "key")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="password">Password</SelectItem>
            <SelectItem value="key">SSH Key</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {formAuthType === "password" ? (
        <div className="grid gap-2">
          <Label>Password</Label>
          <Input type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} placeholder="••••••••" />
        </div>
      ) : (
        <div className="grid gap-2">
          <Label>Private Key</Label>
          <Input type="password" value={formKey} onChange={e => setFormKey(e.target.value)} placeholder="-----BEGIN RSA PRIVATE KEY-----" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label>BIND9 Conf Dir</Label>
          <Input value={formConfDir} onChange={e => setFormConfDir(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>BIND9 Zone Dir</Label>
          <Input value={formZoneDir} onChange={e => setFormZoneDir(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Role</Label>
        <Select value={formRole} onValueChange={v => setFormRole(v as "slave" | "secondary")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="slave">Slave</SelectItem>
            <SelectItem value="secondary">Secondary</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Replication Servers</h2>
          <p className="text-muted-foreground">Manage BIND9 slave/secondary servers for zone replication.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync All
          </Button>
          <Button className="gap-2" onClick={() => { resetForm(); setAddOpen(true); }}>
            <Plus className="h-4 w-4" /> Add Server
          </Button>
        </div>
      </div>

      {/* Insights Summary */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Servers</p>
                  <p className="text-2xl font-bold">{stats.totalServers}</p>
                </div>
                <Server className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stats.enabledServers} enabled, {stats.connectedServers} connected</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Master Zones</p>
                  <p className="text-2xl font-bold">{stats.totalZones}</p>
                </div>
                <Globe className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Zones available for replication</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Conflicts</p>
                  <p className="text-2xl font-bold">{stats.unresolvedConflicts}</p>
                </div>
                <AlertTriangle className={`h-8 w-8 ${stats.unresolvedConflicts > 0 ? "text-yellow-500" : "text-muted-foreground"}`} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stats.serialMismatches} serial, {stats.zoneMissing} missing</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Last Sync</p>
                  <p className="text-lg font-bold">{stats.lastSyncAt ? new Date(stats.lastSyncAt).toLocaleString() : "Never"}</p>
                </div>
                <RefreshCw className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stats.failedServers} failed, {stats.neverSyncedServers} never synced</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : servers?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Server className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No replication servers</h3>
            <p className="text-muted-foreground mb-4">Add a slave server to start replicating zones.</p>
            <Button className="gap-2" onClick={() => { resetForm(); setAddOpen(true); }}>
              <Plus className="h-4 w-4" /> Add Server
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {servers?.map(s => (
            <Card key={s.id} className={!s.enabled ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Server className="h-4 w-4" /> {s.name}
                  </CardTitle>
                  {statusBadge(s.lastSyncStatus)}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Host</span>
                  <span className="font-mono">{s.host}:{s.port}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Role</span>
                  <Badge variant="outline">{s.role}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Sync</span>
                  <span>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : "Never"}</span>
                </div>
                <div className="flex gap-1 pt-2">
                  <Button variant="ghost" size="sm" className="gap-1 h-8" onClick={() => { setTestTarget(s.id); setTestResult(null); testMutation.mutate(s.id); }} disabled={testMutation.isPending}>
                    <Plug className="h-3 w-3" /> Test
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-1 h-8" onClick={() => updateMutation.mutate({ id: s.id, data: { enabled: !s.enabled } as any })}>
                    {s.enabled ? <><PowerOff className="h-3 w-3" /> Disable</> : <><Power className="h-3 w-3" /> Enable</>}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8" title="Manage zones" onClick={async () => {
                    setBindingTarget(s);
                    setBindingLoading(true);
                    try {
                      const [bindings, allZones] = await Promise.all([
                        getReplicationZoneBindings(s.id),
                        fetch("/api/zones").then(r => r.json()),
                      ]);
                      const bindingMap = new Map(bindings.map((b: ReplicationZoneBindingEntry) => [b.zoneId, b]));
                      setBindingZones(allZones
                        .filter((z: any) => z.type === "master" && z.status === "active")
                        .map((z: any) => ({
                          id: z.id,
                          domain: z.domain,
                          enabled: bindingMap.has(z.id) ? bindingMap.get(z.id)!.enabled : true,
                          mode: bindingMap.get(z.id)?.mode || "push" as const,
                        })));
                    } catch {}
                    setBindingLoading(false);
                  }}>
                    <Globe className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => openEdit(s)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => setDeleteTarget(s)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Server Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Replication Server</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto">
            {formFields}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              className="gap-2"
              disabled={createMutation.isPending || !formName || !formHost}
              onClick={() => createMutation.mutate({
                name: formName, host: formHost, port: parseInt(formPort) || 22,
                username: formUsername, authType: formAuthType,
                password: formPassword, privateKey: formKey,
                bind9ConfDir: formConfDir, bind9ZoneDir: formZoneDir, role: formRole,
              })}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Server Dialog */}
      <Dialog open={!!editTarget} onOpenChange={open => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit: {editTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto">
            {formFields}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              className="gap-2"
              disabled={updateMutation.isPending}
              onClick={() => {
                if (!editTarget) return;
                const data: any = {};
                if (formName !== editTarget.name) data.name = formName;
                if (formHost !== editTarget.host) data.host = formHost;
                if (parseInt(formPort) !== editTarget.port) data.port = parseInt(formPort);
                if (formUsername !== editTarget.username) data.username = formUsername;
                if (formAuthType !== editTarget.authType) data.authType = formAuthType;
                if (formPassword) data.password = formPassword;
                if (formKey) data.privateKey = formKey;
                if (formConfDir !== (editTarget.bind9ConfDir || "/etc/bind")) data.bind9ConfDir = formConfDir;
                if (formZoneDir !== (editTarget.bind9ZoneDir || "/var/lib/bind")) data.bind9ZoneDir = formZoneDir;
                if (formRole !== editTarget.role) data.role = formRole;
                updateMutation.mutate({ id: editTarget.id, data });
              }}
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Server</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will not affect the remote server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
              if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
            }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Zone Bindings Dialog */}
      <Dialog open={!!bindingTarget} onOpenChange={open => { if (!open) setBindingTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Zones — {bindingTarget?.name}</DialogTitle>
          </DialogHeader>
          {bindingLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : bindingZones.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No master zones available.</p>
          ) : (
            <div className="space-y-3">
              {bindingZones.map(z => (
                <div key={z.id} className="flex items-center justify-between gap-3 border rounded-md px-3 py-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={z.enabled}
                      onChange={e => setBindingZones(prev => prev.map(b => b.id === z.id ? { ...b, enabled: e.target.checked } : b))}
                      className="h-4 w-4"
                    />
                    <span className="font-mono text-sm truncate">{z.domain}</span>
                  </div>
                  <Select value={z.mode} onValueChange={v => setBindingZones(prev => prev.map(b => b.id === z.id ? { ...b, mode: v as "push" | "pull" | "both" } : b))}>
                    <SelectTrigger className="w-24 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="push">Push</SelectItem>
                      <SelectItem value="pull">Pull</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBindingTarget(null)}>Cancel</Button>
            <Button onClick={async () => {
              if (!bindingTarget) return;
              try {
                await setReplicationZoneBindings(bindingTarget.id, bindingZones.map(z => ({ zoneId: z.id, mode: z.mode, enabled: z.enabled })));
                toast({ title: "Zone bindings updated" });
                setBindingTarget(null);
                queryClient.invalidateQueries({ queryKey: ["replication"] });
              } catch (err: any) {
                toast({ variant: "destructive", title: "Failed to save bindings", description: err.message });
              }
            }}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conflicts Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Conflicts
              {conflicts && conflicts.length > 0 && (
                <Badge variant="destructive">{conflicts.length}</Badge>
              )}
            </h3>
            <p className="text-sm text-muted-foreground">Serial mismatches and missing zones on slave servers.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => detectMutation.mutate()} disabled={detectMutation.isPending}>
              {detectMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Detect
            </Button>
            {conflicts && conflicts.length > 0 && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => resolveAllMutation.mutate()} disabled={resolveAllMutation.isPending}>
                <CheckCircle className="h-3 w-3" /> Resolve All
              </Button>
            )}
          </div>
        </div>

        {!conflicts || conflicts.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <CheckCircle className="h-8 w-8 text-green-500 mr-3" />
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
                  {conflicts.map(c => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2 font-mono">{c.zoneDomain}</td>
                      <td className="px-4 py-2">{c.serverName}</td>
                      <td className="px-4 py-2">
                        <Badge variant={c.conflictType === "zone_missing" ? "destructive" : "outline"}>
                          {c.conflictType.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 font-mono">{c.masterSerial || "-"}</td>
                      <td className="px-4 py-2 font-mono">{c.slaveSerial || "-"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{new Date(c.detectedAt).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => resolveMutation.mutate(c.id)}>
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
    </DashboardLayout>
  );
}
