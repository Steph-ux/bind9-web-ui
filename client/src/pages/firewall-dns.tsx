import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Shield, Plus, Trash2, Globe, AlertTriangle, Loader2 } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RpzEntry, InsertRpzEntry } from "@shared/schema";

export default function FirewallDNS() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [newEntry, setNewEntry] = useState<Partial<InsertRpzEntry>>({
        name: "",
        type: "nxdomain",
        target: "",
        comment: "",
    });

    const { data: entries, isLoading } = useQuery<RpzEntry[]>({
        queryKey: ["/api/rpz"],
    });

    const createMutation = useMutation({
        mutationFn: async (data: InsertRpzEntry) => {
            const res = await apiRequest("POST", "/api/rpz", data);
            try { return await res.json(); } catch { return null; }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/rpz"] });
            toast({
                title: "Rule added",
                description: "The DNS firewall rule has been added and applied.",
            });
            setNewEntry({
                name: "",
                type: "nxdomain",
                target: "",
                comment: "",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Failed to add rule",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await apiRequest("DELETE", `/api/rpz/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/rpz"] });
            setDeleteTarget(null);
            toast({
                title: "Rule deleted",
                description: "The DNS firewall rule has been removed.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Failed to delete rule",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEntry.name) return;

        if (newEntry.type === "redirect" && !newEntry.target) {
            toast({
                title: "Target required",
                description: "Please specify a target IP or domain for redirection.",
                variant: "destructive",
            });
            return;
        }

        createMutation.mutate(newEntry as InsertRpzEntry);
    };

    if (isLoading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center" style={{ height: "60vh" }}>
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                {/* Responsive Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Shield className="h-7 w-7 text-primary shrink-0" />
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight">DNS Firewall (RPZ)</h2>
                            <p className="text-muted-foreground text-sm">
                                Manage Response Policy Zones to block or redirect malicious domains.
                            </p>
                        </div>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                        {entries?.length || 0} active rule{entries?.length !== 1 ? "s" : ""}
                    </Badge>
                </div>

                <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>How it works</AlertTitle>
                    <AlertDescription>
                        DNS Firewall rules intercept queries for specific domains.{" "}
                        <span className="font-semibold">NXDOMAIN</span> returns "Not Found",{" "}
                        <span className="font-semibold">NODATA</span> returns no records, and{" "}
                        <span className="font-semibold">REDIRECT</span> sends traffic to a different IP or domain.
                    </AlertDescription>
                </Alert>

                <div className="grid gap-6 md:grid-cols-12">
                    {/* Add Rule Card */}
                    <Card className="md:col-span-4">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Plus className="h-5 w-5" /> Add New Rule
                            </CardTitle>
                            <CardDescription>Block or redirect a domain</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="domain">Domain Name</Label>
                                    <Input
                                        id="domain"
                                        placeholder="malicious-site.com"
                                        value={newEntry.name}
                                        onChange={(e) => setNewEntry({ ...newEntry, name: e.target.value })}
                                        required
                                    />
                                    <p className="text-[0.8rem] text-muted-foreground">Wildcards like *.example.com are supported automatically.</p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="type">Action</Label>
                                    <Select
                                        value={newEntry.type}
                                        onValueChange={(value) => setNewEntry({ ...newEntry, type: value as any })}
                                    >
                                        <SelectTrigger id="type">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="nxdomain">Block (NXDOMAIN)</SelectItem>
                                            <SelectItem value="nodata">Block (NODATA)</SelectItem>
                                            <SelectItem value="redirect">Redirect</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {newEntry.type === "redirect" && (
                                    <div className="space-y-2">
                                        <Label htmlFor="target">Redirect Target</Label>
                                        <Input
                                            id="target"
                                            placeholder="127.0.0.1 or blockpage.local"
                                            value={newEntry.target || ""}
                                            onChange={(e) => setNewEntry({ ...newEntry, target: e.target.value })}
                                            required
                                        />
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="comment">Comment (Optional)</Label>
                                    <Input
                                        id="comment"
                                        placeholder="Reason for blocking..."
                                        value={newEntry.comment || ""}
                                        onChange={(e) => setNewEntry({ ...newEntry, comment: e.target.value })}
                                    />
                                </div>

                                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                                    {createMutation.isPending ? (
                                        <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Adding...</>
                                    ) : (
                                        <><Plus className="h-4 w-4 mr-2" /> Add Rule</>
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Active Rules Card */}
                    <Card className="md:col-span-8">
                        <CardHeader>
                            <CardTitle>Active Rules</CardTitle>
                            <CardDescription>
                                {entries?.length || 0} active firewall rules
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Domain</TableHead>
                                            <TableHead>Action</TableHead>
                                            <TableHead>Target</TableHead>
                                            <TableHead>Comment</TableHead>
                                            <TableHead className="w-[100px]">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {!entries?.length ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                                                    No rules defined.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            entries.map((entry) => (
                                                <TableRow key={entry.id}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <Globe className="h-4 w-4 text-muted-foreground" />
                                                            {entry.name}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={entry.type === "redirect" ? "secondary" : "destructive"}>
                                                            {entry.type.toUpperCase()}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>{entry.target || "-"}</TableCell>
                                                    <TableCell className="text-muted-foreground">{entry.comment}</TableCell>
                                                    <TableCell>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => setDeleteTarget(entry.id)}
                                                            disabled={deleteMutation.isPending}
                                                        >
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Delete Confirmation */}
            <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete DNS Firewall Rule</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this rule? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget); }}>
                            Delete Rule
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DashboardLayout>
    );
}
