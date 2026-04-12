import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getIpBlacklist, banIp, unbanIp, cleanupBlacklist, type IpBlacklistEntry } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ShieldBan, Trash2, Plus, Clock, AlertTriangle, Loader2, Ban } from "lucide-react";
import {
    Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const REASON_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    login_failed: { label: "Login Failed", variant: "secondary" },
    api_abuse: { label: "API Abuse", variant: "outline" },
    brute_force: { label: "Brute Force", variant: "destructive" },
    manual: { label: "Manual", variant: "default" },
};

export default function BlacklistPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [banDialogOpen, setBanDialogOpen] = useState(false);
    const [banIpValue, setBanIpValue] = useState("");
    const [banReason, setBanReason] = useState("manual");
    const [banDuration, setBanDuration] = useState("");

    const { data: blacklist = [], isLoading } = useQuery({
        queryKey: ["/api/blacklist"],
        queryFn: getIpBlacklist,
    });

    const banMutation = useMutation({
        mutationFn: ({ ip, reason, durationMs }: { ip: string; reason: string; durationMs?: number }) =>
            banIp(ip, reason, durationMs),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/blacklist"] });
            setBanDialogOpen(false);
            setBanIpValue("");
            setBanDuration("");
            toast({ title: "IP banned", description: "The IP address has been added to the blacklist" });
        },
        onError: (error: Error) => {
            toast({ title: "Failed to ban IP", description: error.message, variant: "destructive" });
        },
    });

    const unbanMutation = useMutation({
        mutationFn: (ip: string) => unbanIp(ip),
        onSuccess: (_data, ip) => {
            queryClient.invalidateQueries({ queryKey: ["/api/blacklist"] });
            toast({ title: "IP unbanned", description: `${ip} has been removed from the blacklist` });
        },
        onError: (error: Error) => {
            toast({ title: "Failed to unban IP", description: error.message, variant: "destructive" });
        },
    });

    const cleanupMutation = useMutation({
        mutationFn: cleanupBlacklist,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/blacklist"] });
            toast({ title: "Cleanup done", description: "Expired bans have been removed" });
        },
        onError: (error: Error) => {
            toast({ title: "Cleanup failed", description: error.message, variant: "destructive" });
        },
    });

    const handleBan = () => {
        if (!banIpValue.trim()) {
            toast({ title: "IP required", description: "Enter an IP address to ban", variant: "destructive" });
            return;
        }
        const durationMs = banDuration ? parseInt(banDuration) * 60 * 1000 : undefined;
        banMutation.mutate({ ip: banIpValue.trim(), reason: banReason, durationMs });
    };

    const formatExpiry = (expiresAt: string | null) => {
        if (!expiresAt) return "Permanent";
        const diff = new Date(expiresAt).getTime() - Date.now();
        if (diff <= 0) return "Expired";
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    };

    if (isLoading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                            <ShieldBan className="h-8 w-8" /> IP Blacklist
                        </h2>
                        <p className="text-muted-foreground mt-1">
                            Monitor and manage banned IP addresses. IPs are auto-banned after 10 failed login attempts.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => cleanupMutation.mutate()} disabled={cleanupMutation.isPending}>
                            <Clock className="mr-2 h-4 w-4" /> Cleanup Expired
                        </Button>
                        <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
                            <DialogTrigger asChild>
                                <Button>
                                    <Plus className="mr-2 h-4 w-4" /> Manual Ban
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Ban IP Address</DialogTitle>
                                    <DialogDescription>
                                        Manually add an IP to the blacklist. This will block all login and API requests from this IP.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">IP Address</label>
                                        <Input
                                            placeholder="e.g. 192.168.1.100 or ::1"
                                            value={banIpValue}
                                            onChange={(e) => setBanIpValue(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Reason</label>
                                        <Select value={banReason} onValueChange={setBanReason}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="manual">Manual</SelectItem>
                                                <SelectItem value="api_abuse">API Abuse</SelectItem>
                                                <SelectItem value="brute_force">Brute Force</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Duration (minutes, empty = permanent)</label>
                                        <Input
                                            type="number"
                                            placeholder="e.g. 1440 (24h)"
                                            value={banDuration}
                                            onChange={(e) => setBanDuration(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setBanDialogOpen(false)}>Cancel</Button>
                                    <Button onClick={handleBan} disabled={banMutation.isPending}>
                                        {banMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        <Ban className="mr-2 h-4 w-4" /> Ban IP
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            Banned IPs ({blacklist.length})
                        </CardTitle>
                        <CardDescription>
                            IPs listed here are blocked from logging in or making API requests.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {blacklist.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <ShieldBan className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>No banned IPs. The blacklist is empty.</p>
                            </div>
                        ) : (
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>IP Address</TableHead>
                                            <TableHead>Attempts</TableHead>
                                            <TableHead>Reason</TableHead>
                                            <TableHead>Banned At</TableHead>
                                            <TableHead>Expires</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {blacklist.map((entry: IpBlacklistEntry) => {
                                            const reasonInfo = REASON_LABELS[entry.reason] || REASON_LABELS.manual;
                                            return (
                                                <TableRow key={entry.id}>
                                                    <TableCell className="font-mono font-medium">{entry.ip}</TableCell>
                                                    <TableCell>{entry.attemptCount}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={reasonInfo.variant}>{reasonInfo.label}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">
                                                        {new Date(entry.bannedAt).toLocaleString()}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={entry.expiresAt ? "outline" : "destructive"}>
                                                            {formatExpiry(entry.expiresAt)}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => unbanMutation.mutate(entry.ip)}
                                                            disabled={unbanMutation.isPending}
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-1" /> Unban
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}
