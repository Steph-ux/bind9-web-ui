import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Copy, FileEdit, Globe, Loader2, Plus, RefreshCcw } from "lucide-react";
import { useAuth } from "@/lib/auth-provider";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard, PageHeader, PageState } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createZone,
  deleteZone,
  getZones,
  syncZones,
  updateZone,
  type ZoneData,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  ZoneCreateDialog,
  ZoneDeleteDialog,
  ZonesInventoryCard,
} from "@/components/zones";

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
    } catch (requestError: any) {
      setError(requestError.message);
      toast({ title: "Error", description: requestError.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchZones();
  }, []);

  const filteredZones = zones.filter((zone) =>
    zone.domain.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const activeZones = zones.filter((zone) => zone.status === "active").length;
  const masterZones = zones.filter((zone) => zone.type === "master").length;
  const secondaryZones = zones.filter(
    (zone) => zone.type === "slave" || zone.type === "forward",
  ).length;

  const resetCreateForm = () => {
    setNewDomain("");
    setNewType("master");
    setNewAdmin("");
    setNewMasterServers("");
    setNewForwarders("");
    setAutoReverse(false);
    setNetwork("");
  };

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
        network: newType === "master" && autoReverse ? network.trim() : undefined,
      });
      toast({ title: "Success", description: `Zone ${newDomain} created` });
      setIsDialogOpen(false);
      resetCreateForm();
      fetchZones();
    } catch (requestError: any) {
      toast({ title: "Error", description: requestError.message, variant: "destructive" });
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
    } catch (requestError: any) {
      toast({ title: "Error", description: requestError.message, variant: "destructive" });
    }
  };

  const handleToggleReplication = async (zone: ZoneData) => {
    const nextValue = zone.replicationEnabled === false;

    try {
      setReplicationSavingId(zone.id);
      const updated = await updateZone(zone.id, { replicationEnabled: nextValue });
      setZones((currentZones) =>
        currentZones.map((item) =>
          item.id === zone.id ? { ...item, replicationEnabled: updated.replicationEnabled } : item,
        ),
      );
      toast({
        title: "Replication updated",
        description: `${zone.domain} replication ${
          updated.replicationEnabled === false ? "disabled" : "enabled"
        }.`,
      });
    } catch (requestError: any) {
      toast({ title: "Error", description: requestError.message, variant: "destructive" });
    } finally {
      setReplicationSavingId(null);
    }
  };

  const statusColor = (status: string) =>
    status === "active" ? "bg-green-500" : status === "syncing" ? "bg-yellow-500" : "bg-red-500";

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
                    } catch (requestError: any) {
                      toast({
                        title: "Sync failed",
                        description: requestError.message,
                        variant: "destructive",
                      });
                    } finally {
                      setSyncing(false);
                    }
                  }}
                >
                  {syncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
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
            description={
              searchTerm ? `Filtered from ${zones.length} total zones.` : "Current inventory in the panel."
            }
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
              Structural changes such as zone type, domain name, master servers, forwarders or file path
              must be changed in BIND first, then re-imported with `Sync from BIND9`.
            </div>
          </CardContent>
        </Card>

        <ZonesInventoryCard
          zones={filteredZones}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          loading={loading}
          canManageDNS={canManageDNS}
          replicationSavingId={replicationSavingId}
          onRefresh={fetchZones}
          onOpenCreate={() => setIsDialogOpen(true)}
          onEditZone={(zone) => setLocation(`/zones/${zone.id}`)}
          onDeleteZone={setDeleteTarget}
          onToggleReplication={handleToggleReplication}
          statusColor={statusColor}
        />
      </div>

      <ZoneCreateDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        creating={creating}
        domain={newDomain}
        zoneType={newType}
        adminEmail={newAdmin}
        masterServers={newMasterServers}
        forwarders={newForwarders}
        autoReverse={autoReverse}
        network={network}
        onDomainChange={setNewDomain}
        onZoneTypeChange={setNewType}
        onAdminEmailChange={setNewAdmin}
        onMasterServersChange={setNewMasterServers}
        onForwardersChange={setNewForwarders}
        onAutoReverseChange={setAutoReverse}
        onNetworkChange={setNetwork}
        onSubmit={handleCreate}
      />

      <ZoneDeleteDialog
        zone={deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
        }}
      />
    </DashboardLayout>
  );
}
