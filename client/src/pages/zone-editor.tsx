import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/lib/auth-provider";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard, PageState } from "@/components/layout";
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
import { Plus, Search, Trash2, Pencil, ArrowLeft, Loader2, Copy, ShieldCheck } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getZone, getRecords, createRecord, updateRecord, deleteRecord, getDnssecKeys, generateDnssecKey, signZone, getDnssecStatus, retireDnssecKey, deleteDnssecKey, type ZoneDetail, type RecordData, type DnssecKeyEntry, type DnssecStatus } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ZoneEditor() {
    const [, params] = useRoute("/zones/:id");
    const zoneId = params?.id;

    const [zone, setZone] = useState<ZoneDetail | null>(null);
    const [records, setRecords] = useState<RecordData[]>([]);
    const [dnssec, setDnssec] = useState<{ enabled: boolean; keys: any[]; ds_record?: string } | null>(null);
    const [managedKeys, setManagedKeys] = useState<DnssecKeyEntry[]>([]);
    const [dnssecStatus, setDnssecStatus] = useState<DnssecStatus | null>(null);
    const [dnssecLoading, setDnssecLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<RecordData | null>(null);
    const [editTarget, setEditTarget] = useState<RecordData | null>(null);
    const [editName, setEditName] = useState("");
    const [editType, setEditType] = useState("A");
    const [editValue, setEditValue] = useState("");
    const [editTTL, setEditTTL] = useState("3600");
    const [editPriority, setEditPriority] = useState("");
    const [saving, setSaving] = useState(false);

    // New record form
    const [newName, setNewName] = useState("");
    const [newType, setNewType] = useState("A");
    const [newValue, setNewValue] = useState("");
    const [newTTL, setNewTTL] = useState("3600");
    const [newPriority, setNewPriority] = useState("");

    const { toast } = useToast();
    const { canManageDNS } = useAuth();

    const fetchData = async () => {
        if (!zoneId) return;
        try {
            setLoading(true);
            const [z, r] = await Promise.all([
                getZone(zoneId),
                getRecords(zoneId)
            ]);
            setZone(z);
            setRecords(r);
            setError(null);

            // Fetch DNSSEC info separately to not block main load
            try {
                const res = await fetch(`/api/zones/${zoneId}/dnssec`);
                if (res.ok) {
                    try {
                        const info = await res.json();
                        setDnssec(info);
                    } catch {}
                }
            } catch (e) { console.error("Failed to fetch DNSSEC info", e); }

            // Fetch managed DNSSEC keys and status
            try {
                const [keys, status] = await Promise.all([
                    getDnssecKeys(zoneId),
                    getDnssecStatus(zoneId),
                ]);
                setManagedKeys(keys);
                setDnssecStatus(status);
            } catch (e) { console.error("Failed to fetch DNSSEC keys", e); }

        } catch (e: any) {
            setError(e.message);
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [zoneId]);

    const filteredRecords = records.filter(rec =>
        rec.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rec.value.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleCreate = async () => {
        if (!zoneId) return;
        if (!newName.trim() || !newValue.trim()) {
            toast({ title: "Validation Error", description: "Name and Value are required", variant: "destructive" });
            return;
        }

        try {
            setCreating(true);
            await createRecord(zoneId, {
                name: newName,
                type: newType,
                value: newValue,
                ttl: parseInt(newTTL) || 3600,
                priority: newPriority ? parseInt(newPriority) : null,
            });

            toast({ title: "Success", description: "Record created successfully" });
            setIsDialogOpen(false);
            setNewName("");
            setNewValue("");
            setNewPriority("");
            fetchData();
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setCreating(false);
        }
    };

    const openEdit = (record: RecordData) => {
        setEditTarget(record);
        setEditName(record.name);
        setEditType(record.type);
        setEditValue(record.value);
        setEditTTL(String(record.ttl));
        setEditPriority(record.priority != null ? String(record.priority) : "");
    };

    const handleEdit = async () => {
        if (!editTarget) return;
        if (!editName.trim() || !editValue.trim()) {
            toast({ title: "Validation Error", description: "Name and Value are required", variant: "destructive" });
            return;
        }
        try {
            setSaving(true);
            await updateRecord(editTarget.id, {
                name: editName,
                type: editType as RecordData["type"],
                value: editValue,
                ttl: parseInt(editTTL) || 3600,
                priority: editPriority ? parseInt(editPriority) : null,
            });
            toast({ title: "Success", description: "Record updated successfully" });
            setEditTarget(null);
            fetchData();
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (data: RecordData) => {
        try {
            await deleteRecord(data.id);
            toast({ title: "Success", description: "Record deleted" });
            setDeleteTarget(null);
            fetchData();
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: "Copied", description: "DS Record copied to clipboard" });
    };

    if (loading && !zone) {
        return (
            <DashboardLayout>
                <PageState
                    loading
                    title="Loading zone editor"
                    description="Fetching zone details, records and DNSSEC state."
                    className="min-h-[60vh]"
                />
            </DashboardLayout>
        );
    }

    if (!zone) {
        return (
            <DashboardLayout>
                <PageState
                    title="Zone not found"
                    description={error || "The requested zone could not be loaded."}
                    tone="danger"
                    action={
                        <Link href="/zones">
                            <Button variant="outline">Back to zones</Button>
                        </Link>
                    }
                    className="min-h-[60vh]"
                />
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/zones">
                            <Button variant="outline" size="icon">
                                <ArrowLeft className="w-4 h-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">{zone.domain}</h1>
                            <p className="text-muted-foreground text-sm">
                                {records.length} records - {zone.type}
                            </p>
                        </div>
                    </div>
                    {canManageDNS && (
                        <div className="flex gap-2">
                            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button>
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add Record
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Add DNS Record</DialogTitle>
                                        <DialogDescription>Add a new record to {zone.domain}</DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="name" className="text-right">Name</Label>
                                            <Input id="name" value={newName} onChange={e => setNewName(e.target.value)} className="col-span-3" placeholder="@ or subdomain" />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="type" className="text-right">Type</Label>
                                            <Select value={newType} onValueChange={setNewType}>
                                                <SelectTrigger className="col-span-3">
                                                    <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "SRV"].map(t => (
                                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="value" className="text-right">Value</Label>
                                            <Input id="value" value={newValue} onChange={e => setNewValue(e.target.value)} className="col-span-3" placeholder="IP or domain" />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="ttl" className="text-right">TTL</Label>
                                            <Input id="ttl" value={newTTL} onChange={e => setNewTTL(e.target.value)} className="col-span-3" />
                                        </div>
                                        {newType === "MX" && (
                                            <div className="grid grid-cols-4 items-center gap-4">
                                                <Label htmlFor="priority" className="text-right">Priority</Label>
                                                <Input id="priority" value={newPriority} onChange={e => setNewPriority(e.target.value)} className="col-span-3" placeholder="10" />
                                            </div>
                                        )}
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleCreate} disabled={creating}>
                                            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Create Record
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        label="Records"
                        value={records.length}
                        description="Total DNS records in this zone."
                        icon={Copy}
                    />
                    <MetricCard
                        label="Filtered Results"
                        value={filteredRecords.length}
                        description={searchTerm ? `Filter: ${searchTerm}` : "Current visible result set."}
                        icon={Search}
                    />
                    <MetricCard
                        label="DNSSEC"
                        value={dnssec?.enabled || dnssecStatus?.signed ? "Enabled" : "Disabled"}
                        description={managedKeys.length > 0 ? `${managedKeys.length} managed key(s)` : "No managed key detected."}
                        icon={ShieldCheck}
                        tone={dnssec?.enabled || dnssecStatus?.signed ? "success" : "warning"}
                    />
                    <MetricCard
                        label="Editing"
                        value={canManageDNS ? "Writable" : "Read-only"}
                        description={canManageDNS ? "You can create and modify records." : "You can only inspect this zone."}
                        icon={Pencil}
                    />
                </div>

                <Tabs defaultValue="records" className="w-full">
                    <TabsList>
                        <TabsTrigger value="records">Records</TabsTrigger>
                        <TabsTrigger value="dnssec">DNSSEC</TabsTrigger>
                    </TabsList>

                    <TabsContent value="records" className="space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1 max-w-sm">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search records..."
                                    className="pl-8"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <Card>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Value</TableHead>
                                        <TableHead>TTL</TableHead>
                                        <TableHead className="w-[100px]">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredRecords.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                                                No records found
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredRecords.map((record) => (
                                            <TableRow key={record.id}>
                                                <TableCell className="font-medium">{record.name}</TableCell>
                                                <TableCell><Badge variant="outline">{record.type}</Badge></TableCell>
                                                <TableCell className="max-w-[300px] truncate" title={record.value}>{record.value}</TableCell>
                                                <TableCell>{record.ttl}</TableCell>
                                                <TableCell>
                                                    {record.type !== 'SOA' && canManageDNS && (
                                                        <div className="flex gap-1">
                                                            <Button variant="ghost" size="icon" onClick={() => openEdit(record)}>
                                                                <Pencil className="w-4 h-4" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(record)}>
                                                                <Trash2 className="w-4 h-4 text-destructive" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </Card>
                    </TabsContent>

                    <TabsContent value="dnssec">
                        <div className="space-y-6">
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-4 p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                                    <div className={`p-3 rounded-full ${dnssec?.enabled || dnssecStatus?.signed ? 'bg-green-100 dark:bg-green-900/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                                        <ShieldCheck className={`w-8 h-8 ${dnssec?.enabled || dnssecStatus?.signed ? 'text-green-600 dark:text-green-500' : 'text-gray-400'}`} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold">DNSSEC Status</h3>
                                        <p className="text-sm text-muted-foreground">
                                            {dnssec?.enabled || dnssecStatus?.signed
                                                ? "This zone is signed and protected by DNSSEC."
                                                : "DNSSEC is not currently enabled. Generate keys and sign the zone to enable."}
                                        </p>
                                    </div>
                                    {(dnssec?.enabled || dnssecStatus?.signed) && <Badge className="ml-auto bg-green-500">Signed</Badge>}
                                </div>

                                {/* Key Management Actions */}
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="outline" size="sm" className="gap-2" disabled={dnssecLoading || !zone} onClick={async () => {
                                        setDnssecLoading(true);
                                        try {
                                            const res = await generateDnssecKey(zoneId!, "KSK");
                                            toast({ title: res.success ? "KSK Generated" : "Failed", description: res.message, variant: res.success ? "default" : "destructive" });
                                            if (res.success) { const keys = await getDnssecKeys(zoneId!); setManagedKeys(keys); }
                                        } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                                        setDnssecLoading(false);
                                    }}>
                                        {dnssecLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                        Generate KSK
                                    </Button>
                                    <Button variant="outline" size="sm" className="gap-2" disabled={dnssecLoading || !zone} onClick={async () => {
                                        setDnssecLoading(true);
                                        try {
                                            const res = await generateDnssecKey(zoneId!, "ZSK");
                                            toast({ title: res.success ? "ZSK Generated" : "Failed", description: res.message, variant: res.success ? "default" : "destructive" });
                                            if (res.success) { const keys = await getDnssecKeys(zoneId!); setManagedKeys(keys); }
                                        } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                                        setDnssecLoading(false);
                                    }}>
                                        {dnssecLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                        Generate ZSK
                                    </Button>
                                    <Button variant="default" size="sm" className="gap-2" disabled={dnssecLoading || !zone || managedKeys.filter(k => k.status === "active").length === 0} onClick={async () => {
                                        setDnssecLoading(true);
                                        try {
                                            const res = await signZone(zoneId!);
                                            toast({ title: res.success ? "Zone Signed" : "Failed", description: res.message, variant: res.success ? "default" : "destructive" });
                                            if (res.success) fetchData();
                                        } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                                        setDnssecLoading(false);
                                    }}>
                                        <ShieldCheck className="h-4 w-4" />
                                        Sign Zone
                                    </Button>
                                </div>

                                {/* Managed DNSSEC Keys */}
                                {managedKeys.length > 0 && (
                                    <Card>
                                        <div className="p-6 border-b">
                                            <h3 className="text-lg font-semibold">Managed DNS Keys</h3>
                                        </div>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Key Tag</TableHead>
                                                    <TableHead>Type</TableHead>
                                                    <TableHead>Algorithm</TableHead>
                                                    <TableHead>Size</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead>Created</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {managedKeys.map(key => (
                                                    <TableRow key={key.id}>
                                                        <TableCell className="font-mono">{key.keyTag}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={key.keyType === "KSK" ? "default" : "secondary"}>
                                                                {key.keyType}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-xs">{key.algorithm}</TableCell>
                                                        <TableCell>{key.keySize}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={key.status === "active" ? "default" : key.status === "retired" ? "secondary" : "outline"}>
                                                                {key.status}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-xs text-muted-foreground">{new Date(key.createdAt).toLocaleDateString()}</TableCell>
                                                        <TableCell className="text-right">
                                                            {key.status === "active" && (
                                                                <Button variant="ghost" size="sm" className="h-7" onClick={async () => {
                                                                    try {
                                                                        const res = await retireDnssecKey(key.id);
                                                                        toast({ title: res.success ? "Key Retired" : "Failed", description: res.message });
                                                                        if (res.success) { const keys = await getDnssecKeys(zoneId!); setManagedKeys(keys); }
                                                                    } catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
                                                                }}>
                                                                    Retire
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </Card>
                                )}

                                {/* Existing DNSSEC info from BIND9 */}
                                {dnssec?.enabled && (
                                    <>
                                        <Card className="p-6">
                                            <div className="mb-4">
                                                <h3 className="text-lg font-semibold mb-1">DS Record</h3>
                                                <p className="text-sm text-muted-foreground">Add this record to your domain registrar to enable the chain of trust.</p>
                                            </div>

                                            {dnssec.ds_record ? (
                                                <div className="bg-muted/50 p-4 rounded-md font-mono text-xs break-all border relative group">
                                                    {dnssec.ds_record}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={() => copyToClipboard(dnssec.ds_record || "")}
                                                    >
                                                        <Copy className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="text-sm text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/20 p-3 rounded">
                                                    DS Record file (dsset-{zone.domain}.) not found.
                                                </div>
                                            )}
                                        </Card>

                                        <Card>
                                            <div className="p-6 border-b">
                                                <h3 className="text-lg font-semibold">Detected DNS Keys (from BIND9)</h3>
                                            </div>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Key ID (Tag)</TableHead>
                                                        <TableHead>Type</TableHead>
                                                        <TableHead>Algorithm</TableHead>
                                                        <TableHead>File</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {dnssec.keys.map((key, i) => (
                                                        <TableRow key={i}>
                                                            <TableCell className="font-mono">{key.id}</TableCell>
                                                            <TableCell>
                                                                <Badge variant={key.type === "KSK" ? "default" : "secondary"}>
                                                                    {key.type}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>{key.algorithm}</TableCell>
                                                            <TableCell className="text-xs text-muted-foreground">{key.file}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </Card>
                                    </>
                                )}
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        {/* Edit Record Dialog */}
        <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit DNS Record</DialogTitle>
                    <DialogDescription>Modify record in {zone?.domain}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Name</Label>
                        <Input value={editName} onChange={e => setEditName(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Type</Label>
                        <Select value={editType} onValueChange={setEditType}>
                            <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "PTR"].map(t => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Value</Label>
                        <Input value={editValue} onChange={e => setEditValue(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">TTL</Label>
                        <Input value={editTTL} onChange={e => setEditTTL(e.target.value)} className="col-span-3" />
                    </div>
                    {editType === "MX" && (
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Priority</Label>
                            <Input value={editPriority} onChange={e => setEditPriority(e.target.value)} className="col-span-3" placeholder="10" />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button onClick={handleEdit} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete DNS Record</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to delete record <strong>{deleteTarget?.name}</strong> ({deleteTarget?.type})? This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteTarget) handleDelete(deleteTarget); }}>
                        Delete Record
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </DashboardLayout>
    );
}


