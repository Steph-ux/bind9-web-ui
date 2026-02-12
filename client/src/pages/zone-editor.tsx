import { useState, useEffect } from "react";
import { useRoute } from "wouter";
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
import { Plus, Search, Trash2, ArrowLeft, Save, Loader2 } from "lucide-react";
import { getZone, getRecords, createRecord, deleteRecord, type ZoneDetail, type RecordData } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function ZoneEditor() {
    const [, params] = useRoute("/zones/:id");
    const zoneId = params?.id;

    const [zone, setZone] = useState<ZoneDetail | null>(null);
    const [records, setRecords] = useState<RecordData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [creating, setCreating] = useState(false);

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
        } catch (e: any) {
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

    const handleDelete = async (data: RecordData) => {
        if (!confirm(`Are you sure you want to delete record ${data.name} (${data.type})?`)) return;
        try {
            await deleteRecord(data.id);
            toast({ title: "Deleted", description: "Record deleted successfully" });
            fetchData();
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        }
    };

    if (!zoneId) return <div>Invalid Zone ID</div>;

    return (
        <DashboardLayout>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Link href="/zones">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">
                            {loading ? "Loading..." : zone?.domain}
                        </h1>
                        {zone && <Badge variant={zone.status === 'active' ? 'default' : 'secondary'}>{zone.status}</Badge>}
                    </div>
                    <p className="text-muted-foreground ml-10">Manage DNS records for this zone.</p>
                </div>

                {canManageDNS && (
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2 shadow-[0_0_15px_rgba(0,240,255,0.3)]">
                                <Plus className="w-4 h-4" /> Add Record
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px] border-primary/20 bg-card/95 backdrop-blur-xl">
                            <DialogHeader>
                                <DialogTitle>Add DNS Record</DialogTitle>
                                <DialogDescription>
                                    Add a new record to {zone?.domain}.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="type" className="text-right">Type</Label>
                                    <Select value={newType} onValueChange={setNewType}>
                                        <SelectTrigger className="col-span-3">
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "PTR", "SRV"].map(t => (
                                                <SelectItem key={t} value={t}>{t}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="name" className="text-right">Name</Label>
                                    <div className="col-span-3 flex items-center gap-2">
                                        <Input
                                            id="name"
                                            placeholder="@ or subdomain"
                                            className="font-mono"
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="value" className="text-right">Value</Label>
                                    <Input
                                        id="value"
                                        placeholder="IP address or domain"
                                        className="col-span-3 font-mono"
                                        value={newValue}
                                        onChange={(e) => setNewValue(e.target.value)}
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="ttl" className="text-right">TTL</Label>
                                    <Input
                                        id="ttl"
                                        type="number"
                                        className="col-span-3 font-mono"
                                        value={newTTL}
                                        onChange={(e) => setNewTTL(e.target.value)}
                                    />
                                </div>
                                {newType === "MX" && (
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="priority" className="text-right">Priority</Label>
                                        <Input
                                            id="priority"
                                            type="number"
                                            className="col-span-3 font-mono"
                                            value={newPriority}
                                            onChange={(e) => setNewPriority(e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button onClick={handleCreate} disabled={creating}>
                                    {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Add Record
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            <Card className="glass-panel border-primary/10">
                <div className="p-4 border-b border-border/40 flex items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Search records..."
                            className="pl-8 bg-background/50"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="text-sm text-muted-foreground">
                        {filteredRecords.length} records found
                    </div>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent border-border/40">
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead>TTL</TableHead>
                            {canManageDNS && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Loading records...
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : filteredRecords.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    No records found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredRecords.map((rec) => (
                                <TableRow key={rec.id} className="group hover:bg-muted/50 border-border/40 transition-colors">
                                    <TableCell className="font-medium font-mono text-primary">{rec.name}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="font-mono text-xs border-primary/20 text-primary/80">
                                            {rec.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-mono text-sm max-w-[300px] truncate" title={rec.value}>
                                        {rec.priority !== null && <span className="text-muted-foreground mr-2">{rec.priority}</span>}
                                        {rec.value}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground font-mono text-sm">{rec.ttl}</TableCell>
                                    {canManageDNS && (
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                                onClick={() => handleDelete(rec)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>
        </DashboardLayout>
    );
}
