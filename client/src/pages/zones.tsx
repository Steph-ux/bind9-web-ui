import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-provider";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, MoreHorizontal, FileEdit, Trash2, Globe, RefreshCcw, Loader2, LayoutGrid, List as ListIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getZones, createZone, deleteZone, syncZones, type ZoneData } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function Zones() {
  const [, setLocation] = useLocation();
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newType, setNewType] = useState("master");
  const [newAdmin, setNewAdmin] = useState("");
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();
  const { canManageDNS } = useAuth();

  const fetchZones = async () => {
    try {
      setLoading(true);
      const data = await getZones();
      setZones(data);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchZones(); }, []);

  const filteredZones = zones.filter(zone =>
    zone.domain.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newDomain.trim()) {
      toast({ title: "Error", description: "Domain is required", variant: "destructive" });
      return;
    }
    try {
      setCreating(true);
      await createZone({ domain: newDomain.trim(), type: newType, adminEmail: newAdmin.trim() || undefined });
      toast({ title: "Success", description: `Zone ${newDomain} created` });
      setIsDialogOpen(false);
      setNewDomain("");
      setNewType("master");
      setNewAdmin("");
      fetchZones();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (zone: ZoneData) => {
    if (!confirm(`Delete zone ${zone.domain}? This action cannot be undone.`)) return;
    try {
      await deleteZone(zone.id);
      toast({ title: "Deleted", description: `Zone ${zone.domain} removed` });
      fetchZones();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Zone Management</h1>
          <p className="text-muted-foreground mt-1">Configure authoritative zones and forwarders.</p>
        </div>
        <div className="flex gap-2">
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
                    description: `${result.synced} zones imported, ${result.skipped} already existed (${result.total} total in BIND9)`,
                  });
                  fetchZones();
                } catch (e: any) {
                  toast({ title: "Sync failed", description: e.message, variant: "destructive" });
                } finally {
                  setSyncing(false);
                }
              }}
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
              Sync from BIND9
            </Button>
          )}
          {canManageDNS && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 shadow-[0_0_15px_rgba(0,240,255,0.3)]">
                  <Plus className="w-4 h-4" /> Add New Zone
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] border-primary/20 bg-card/95 backdrop-blur-xl">
                <DialogHeader>
                  <DialogTitle>Create Zone</DialogTitle>
                  <DialogDescription>
                    Add a new master or slave zone to the configuration.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="domain" className="text-right">Domain</Label>
                    <Input
                      id="domain"
                      placeholder="example.com"
                      className="col-span-3 font-mono"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="type" className="text-right">Type</Label>
                    <Select value={newType} onValueChange={setNewType}>
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="master">Master</SelectItem>
                        <SelectItem value="slave">Slave</SelectItem>
                        <SelectItem value="forward">Forward</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="admin" className="text-right">Admin Email</Label>
                    <Input
                      id="admin"
                      placeholder="hostmaster@example.com"
                      className="col-span-3"
                      value={newAdmin}
                      onChange={(e) => setNewAdmin(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Create Zone
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card className="glass-panel border-primary/10">
        <div className="p-4 border-b border-border/40 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search zones..."
              className="pl-9 bg-background/50 border-primary/10 focus:border-primary/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" size="icon" title="Refresh" onClick={fetchZones} disabled={loading}>
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <div className="flex items-center bg-muted/50 p-1 rounded-md border border-border/40">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("grid")}
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("list")}
              title="List View"
            >
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {loading && zones.length === 0 ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredZones.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            {searchTerm ? "No zones match your search" : "No zones configured. Click 'Add New Zone' to get started."}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-muted/10">
            {filteredZones.map((zone) => (
              <Card key={zone.id} className="group relative overflow-hidden border-primary/20 bg-card/50 hover:bg-card transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,240,255,0.1)] hover:border-primary/40">
                <div className={`absolute top-0 left-0 w-1 h-full ${zone.status === 'active' ? 'bg-green-500' :
                  zone.status === 'syncing' ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />

                <div className="p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                        <Globe className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg tracking-tight font-mono truncate max-w-[180px]" title={zone.domain}>
                          {zone.domain}
                        </h3>
                        <Badge variant="outline" className="mt-1 text-[10px] uppercase tracking-wider border-primary/20 text-primary/80">
                          {zone.type}
                        </Badge>
                      </div>
                    </div>

                    {canManageDNS && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 text-muted-foreground hover:text-foreground">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="gap-2" onClick={() => setLocation(`/zones/${zone.id}`)}>
                            <FileEdit className="w-4 h-4" /> Edit Records
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => handleDelete(zone)}>
                            <Trash2 className="w-4 h-4" /> Delete Zone
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-muted/30 p-2 rounded border border-border/30">
                      <span className="text-muted-foreground text-xs block mb-0.5">Records</span>
                      <span className="font-mono font-medium">{zone.records}</span>
                    </div>
                    <div className="bg-muted/30 p-2 rounded border border-border/30">
                      <span className="text-muted-foreground text-xs block mb-0.5">Serial</span>
                      <span className="font-mono font-medium">{zone.serial || "—"}</span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-border/30">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`h-2 w-2 rounded-full ${zone.status === 'active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' :
                        zone.status === 'syncing' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
                        }`} />
                      <span className="text-muted-foreground capitalize">{zone.status}</span>
                    </div>

                    {canManageDNS && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
                        onClick={() => setLocation(`/zones/${zone.id}`)}
                      >
                        Manage <FileEdit className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-border/40">
                <TableHead className="w-[300px]">Zone Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Records</TableHead>
                <TableHead className="font-mono">Serial</TableHead>
                <TableHead>Status</TableHead>
                {canManageDNS && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredZones.map((zone) => (
                <TableRow key={zone.id} className="hover:bg-primary/5 border-border/40 transition-colors">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded bg-primary/10 text-primary">
                        <Globe className="w-4 h-4" />
                      </div>
                      <span className="font-mono text-sm">{zone.domain}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal border-primary/20 bg-primary/5 text-primary-foreground/80 capitalize">
                      {zone.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{zone.records}</TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">{zone.serial || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${zone.status === 'active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' :
                        zone.status === 'syncing' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
                        }`} />
                      <span className="text-sm capitalize">{zone.status}</span>
                    </div>
                  </TableCell>
                  {canManageDNS && (
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="gap-2" onClick={() => setLocation(`/zones/${zone.id}`)}>
                            <FileEdit className="w-4 h-4" /> Edit Records
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => handleDelete(zone)}>
                            <Trash2 className="w-4 h-4" /> Delete Zone
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </DashboardLayout>
  );
}