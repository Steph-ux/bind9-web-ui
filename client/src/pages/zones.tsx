import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-provider";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard, PageHeader, PageState } from "@/components/layout";
import { Plus, Search, FileEdit, Trash2, Globe, RefreshCcw, Loader2, LayoutGrid, List as ListIcon, MoreHorizontal, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { getZones, createZone, deleteZone, syncZones, updateZone, type ZoneData } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function Zones() {
  const [, setLocation] = useLocation();
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newType, setNewType] = useState("master");
  const [newAdmin, setNewAdmin] = useState("");
  const [newMasterServers, setNewMasterServers] = useState("");
  const [newForwarders, setNewForwarders] = useState("");
  const [autoReverse, setAutoReverse] = useState(false);
  const [network, setNetwork] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ZoneData | null>(null);
  const [replicationSavingId, setReplicationSavingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { canManageDNS } = useAuth();

  const fetchZones = async () => {
    try {
      setLoading(true);
      const data = await getZones();
      setZones(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchZones(); }, []);

  const filteredZones = zones.filter(zone =>
    zone.domain.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const activeZones = zones.filter((zone) => zone.status === "active").length;
  const masterZones = zones.filter((zone) => zone.type === "master").length;
  const secondaryZones = zones.filter((zone) => zone.type === "slave" || zone.type === "forward").length;

  const handleCreate = async () => {
    if (!newDomain.trim()) {
      toast({ title: "Error", description: "Domain is required", variant: "destructive" });
      return;
    }
    try {
      setCreating(true);
      await createZone({
        domain: newDomain.trim(),
        type: newType,
        adminEmail: newAdmin.trim() || undefined,
        masterServers: newType === "slave" ? newMasterServers.trim() : undefined,
        forwarders: newType === "forward" ? newForwarders.trim() : undefined,
        autoReverse: newType === "master" ? autoReverse : undefined,
        network: newType === "master" && autoReverse ? network.trim() : undefined
      });
      toast({ title: "Success", description: `Zone ${newDomain} created` });
      setIsDialogOpen(false);
      setNewDomain("");
      setNewType("master");
      setNewAdmin("");
      setNewMasterServers("");
      setNewForwarders("");
      setAutoReverse(false);
      setNetwork("");
      fetchZones();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (zone: ZoneData) => {
    try {
      await deleteZone(zone.id);
      toast({ title: "Deleted", description: `Zone ${zone.domain} removed` });
      setDeleteTarget(null);
      fetchZones();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleToggleReplication = async (zone: ZoneData) => {
    const nextValue = zone.replicationEnabled === false;

    try {
      setReplicationSavingId(zone.id);
      const updated = await updateZone(zone.id, { replicationEnabled: nextValue });
      setZones((prev) => prev.map((item) => item.id === zone.id ? { ...item, replicationEnabled: updated.replicationEnabled } : item));
      toast({
        title: "Replication updated",
        description: `${zone.domain} replication ${updated.replicationEnabled === false ? "disabled" : "enabled"}.`,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setReplicationSavingId(null);
    }
  };

  const statusColor = (status: string) =>
    status === 'active' ? 'bg-green-500' : status === 'syncing' ? 'bg-yellow-500' : 'bg-red-500';

  if (loading && zones.length === 0) {
    return (
      <DashboardLayout>
        <PageState
          loading
          title="Loading zones"
          description="Fetching zone inventory and management state."
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  if (error && zones.length === 0) {
    return (
      <DashboardLayout>
        <PageState
          title="Unable to load zones"
          description={error}
          tone="danger"
          action={<Button onClick={fetchZones}>Retry</Button>}
          className="min-h-[60vh]"
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Zone Management"
          description="Create, import and maintain authoritative zones and forwarders from one workspace."
          icon={Globe}
          badge={<Badge variant="outline">{zones.length} total zones</Badge>}
          actions={
            <>
              {canManageDNS && (
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={syncing}
                  onClick={async () => {
                    setSyncing(true);
                    try {
                      const result = await syncZones();
                      toast({
                        title: "Sync complete",
                        description: `${result.synced} zones synchronized, ${result.skipped} skipped, ${result.total} found in BIND9.`,
                      });
                      fetchZones();
                    } catch (e: any) {
                      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
                    } finally {
                      setSyncing(false);
                    }
                  }}
                >
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  Sync from BIND9
                </Button>
              )}
              {canManageDNS && (
                <Button className="gap-2" onClick={() => setIsDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add New Zone
                </Button>
              )}
            </>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Visible Zones"
            value={filteredZones.length}
            description={searchTerm ? `Filtered from ${zones.length} total zones.` : "Current inventory in the panel."}
            icon={Globe}
          />
          <MetricCard
            label="Active Zones"
            value={activeZones}
            description="Zones currently marked active."
            icon={RefreshCcw}
            tone="success"
          />
          <MetricCard
            label="Primary Zones"
            value={masterZones}
            description="Master zones editable from this panel."
            icon={FileEdit}
          />
          <MetricCard
            label="Secondary and Forward"
            value={secondaryZones}
            description="Zones synchronized or forwarded from upstream."
            icon={Copy}
            tone="warning"
          />
        </div>

        <Card className="border-amber-200 bg-amber-50/70">
          <CardContent className="flex flex-col gap-2 p-4 text-sm text-amber-950">
            <div className="font-semibold">Zone structure policy</div>
            <div>
              The web UI can create zones, delete zones, edit records and toggle replication.
              Structural changes such as zone type, domain name, master servers, forwarders or file path must be changed in BIND first, then re-imported with `Sync from BIND9`.
            </div>
          </CardContent>
        </Card>

        <Card>
        <CardHeader className="p-4 border-b flex flex-row items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1" style={{ maxWidth: "300px" }}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              className="pl-9"
              placeholder="Search zones..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" title="Refresh" onClick={fetchZones} disabled={loading}>
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <div className="flex rounded-md border">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                title="Grid View"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                title="List View"
              >
                <ListIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        {filteredZones.length === 0 ? (
          <div className="p-6">
            <PageState
              title={searchTerm ? "No zones match your search" : "No zones configured"}
              description={
                searchTerm
                  ? "Try a different domain filter or clear the search field."
                  : "Create your first zone or import the current BIND9 inventory."
              }
              action={
                searchTerm ? (
                  <Button variant="outline" onClick={() => setSearchTerm("")}>
                    Clear search
                  </Button>
                ) : canManageDNS ? (
                  <Button onClick={() => setIsDialogOpen(true)}>Add New Zone</Button>
                ) : null
              }
            />
          </div>
        ) : viewMode === "grid" ? (
          <CardContent className="p-4 bg-muted/30">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredZones.map((zone) => (
                <Card key={zone.id} className="relative overflow-hidden">
                  <div className={`absolute top-0 left-0 h-full ${statusColor(zone.status)}`} style={{ width: "4px" }} />
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary">
                          <Globe className="h-5 w-5" />
                        </div>
                        <div>
                          <h5 className="font-mono font-medium text-sm truncate max-w-[160px]" title={zone.domain}>
                            {zone.domain}
                          </h5>
                          <Badge variant="outline" className="mt-1 uppercase text-xs">{zone.type}</Badge>
                        </div>
                      </div>
                      {canManageDNS && zone.type === "master" && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLocation(`/zones/${zone.id}`)} title="Edit Records">
                            <FileEdit className="h-3.5 w-3.5 text-primary" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(zone)} title="Delete Zone">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="rounded-md border bg-muted/50 p-2">
                        <small className="text-muted-foreground block mb-0.5 text-[11px]">Records</small>
                        <span className="font-mono font-semibold text-sm">{zone.records}</span>
                      </div>
                      <div className="rounded-md border bg-muted/50 p-2">
                        <small className="text-muted-foreground block mb-0.5 text-[11px]">Serial</small>
                        <span className="font-mono font-semibold text-sm">{zone.serial || "-"}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t pt-3 mt-auto">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full animate-pulse ${statusColor(zone.status)}`} />
                        <small className="text-muted-foreground capitalize">{zone.status}</small>
                        {zone.type === "master" && (
                          <button
                            className={`ml-1 flex items-center gap-0.5 text-[10px] ${zone.replicationEnabled !== false ? "text-green-600" : "text-muted-foreground line-through"}`}
                            title={zone.replicationEnabled !== false ? "Replication enabled (click to disable)" : "Replication disabled (click to enable)"}
                            disabled={replicationSavingId === zone.id}
                            onClick={() => handleToggleReplication(zone)}
                          >
                            {replicationSavingId === zone.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
                            Repl
                          </button>
                        )}
                      </div>
                      {canManageDNS && zone.type === "master" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary gap-1 h-7"
                          onClick={() => setLocation(`/zones/${zone.id}`)}
                        >
                          Manage <FileEdit className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Zone Name</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Type</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Records</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Serial</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Status</th>
                  {canManageDNS && <th className="h-10 px-4 text-right font-medium text-muted-foreground">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredZones.map((zone) => (
                  <tr key={zone.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary">
                          <Globe className="h-3.5 w-3.5" />
                        </div>
                        <span className="font-mono font-medium">{zone.domain}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="capitalize">{zone.type}</Badge>
                    </td>
                    <td className="px-4 py-3">{zone.records}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{zone.serial || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full animate-pulse ${statusColor(zone.status)}`} />
                        <span className="capitalize text-xs">{zone.status}</span>
                      </div>
                    </td>
                    {canManageDNS && (
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {zone.type === "master" && (
                              <DropdownMenuItem className="gap-2" onClick={() => setLocation(`/zones/${zone.id}`)}>
                              <FileEdit className="h-4 w-4" /> Edit Records
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => setDeleteTarget(zone)}>
                              <Trash2 className="h-4 w-4" /> Delete Zone
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </Card>
      </div>

      {/* Create Zone Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Zone</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="domain">Domain Name</Label>
              <Input id="domain" placeholder="example.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="type">Zone Type</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="master">Master</SelectItem>
                  <SelectItem value="slave">Slave</SelectItem>
                  <SelectItem value="forward">Forward</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin">Admin Email</Label>
              <Input id="admin" placeholder="admin.example.com" value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)} />
            </div>
            {newType === "slave" && (
              <div className="grid gap-2">
                <Label htmlFor="masters">Master Servers</Label>
                <Input
                  id="masters"
                  placeholder="192.168.1.10, 192.168.1.11"
                  value={newMasterServers}
                  onChange={(e) => setNewMasterServers(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Comma-separated IP addresses used in the BIND `masters` clause.</p>
              </div>
            )}
            {newType === "forward" && (
              <div className="grid gap-2">
                <Label htmlFor="forwarders">Forwarders</Label>
                <Input
                  id="forwarders"
                  placeholder="1.1.1.1, 8.8.8.8"
                  value={newForwarders}
                  onChange={(e) => setNewForwarders(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Comma-separated IP addresses used in the BIND `forwarders` clause.</p>
              </div>
            )}
            {newType === "master" && (
              <div className="flex items-center gap-2">
                <Checkbox id="autoReverse" checked={autoReverse} onCheckedChange={(v) => setAutoReverse(!!v)} />
                <Label htmlFor="autoReverse">Auto-create reverse zone</Label>
              </div>
            )}
            {newType === "master" && autoReverse && (
              <div className="grid gap-2">
                <Label htmlFor="network">Network (CIDR)</Label>
                <Input id="network" placeholder="192.168.1.0/24" value={network} onChange={(e) => setNetwork(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Zone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Zone</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.domain}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              Delete Zone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}


