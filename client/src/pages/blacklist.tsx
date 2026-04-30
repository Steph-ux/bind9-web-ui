import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertTriangle,
    Ban,
    Clock,
    Loader2,
    Plus,
    Shield,
    ShieldBan,
    Trash2,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard, PageHeader, PageState } from "@/components/layout";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-provider";
import {
    banIp,
    cleanupBlacklist,
    getIpBlacklist,
    unbanIp,
    type IpBlacklistEntry,
} from "@/lib/api";
import {
    validateBlacklistBanForm,
    type BlacklistBanFormValues,
} from "@/lib/client-schemas";

type BlacklistField = "ip" | "reason" | "durationMinutes";

const REASON_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    login_failed: { label: "Login failed", variant: "secondary" },
    api_abuse: { label: "API abuse", variant: "outline" },
    brute_force: { label: "Brute force", variant: "destructive" },
    manual: { label: "Manual", variant: "default" },
};

function collectFieldErrors(
    issues: Array<{ path: Array<string | number>; message: string }>,
) {
    const next: Partial<Record<BlacklistField, string>> = {};
    for (const issue of issues) {
        const field = String(issue.path[0] ?? "") as BlacklistField;
        if (field && !next[field]) {
            next[field] = issue.message;
        }
    }
    return next;
}

function formatExpiry(expiresAt: string | null) {
    if (!expiresAt) {
        return "Permanent";
    }

    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) {
        return "Expired";
    }

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function BlacklistPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { isAdmin } = useAuth();

    const [banDialogOpen, setBanDialogOpen] = useState(false);
    const [banForm, setBanForm] = useState<BlacklistBanFormValues>({
        ip: "",
        reason: "manual",
        durationMinutes: "",
    });
    const [banErrors, setBanErrors] = useState<Partial<Record<BlacklistField, string>>>({});
    const [unbanTarget, setUnbanTarget] = useState<IpBlacklistEntry | null>(null);

    const {
        data: blacklist = [],
        isPending,
        error,
        refetch,
        isFetching,
    } = useQuery({
        queryKey: ["/api/blacklist"],
        queryFn: getIpBlacklist,
    });

    const banMutation = useMutation({
        mutationFn: ({ ip, reason, durationMs }: { ip: string; reason: string; durationMs?: number }) =>
            banIp(ip, reason, durationMs),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/blacklist"] });
            setBanDialogOpen(false);
            setBanForm({ ip: "", reason: "manual", durationMinutes: "" });
            setBanErrors({});
            toast({
                title: "IP banned",
                description: "The address has been added to the blacklist.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Failed to ban IP",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const unbanMutation = useMutation({
        mutationFn: (ip: string) => unbanIp(ip),
        onSuccess: (_data, ip) => {
            queryClient.invalidateQueries({ queryKey: ["/api/blacklist"] });
            setUnbanTarget(null);
            toast({
                title: "IP unbanned",
                description: `${ip} has been removed from the blacklist.`,
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Failed to unban IP",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const cleanupMutation = useMutation({
        mutationFn: cleanupBlacklist,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/blacklist"] });
            toast({
                title: "Cleanup done",
                description: "Expired bans have been removed.",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Cleanup failed",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const metrics = useMemo(() => {
        const permanent = blacklist.filter((entry) => !entry.expiresAt).length;
        const temporary = blacklist.filter((entry) => !!entry.expiresAt).length;
        const manual = blacklist.filter((entry) => entry.reason === "manual").length;
        const bruteForce = blacklist.filter((entry) => entry.reason === "brute_force").length;
        return { permanent, temporary, manual, bruteForce };
    }, [blacklist]);

    const handleBan = () => {
        const parsed = validateBlacklistBanForm(banForm);
        if (!parsed.success) {
            setBanErrors(collectFieldErrors(parsed.error.issues));
            return;
        }

        const durationMs = parsed.data.durationMinutes
            ? Number.parseInt(parsed.data.durationMinutes, 10) * 60 * 1000
            : undefined;

        banMutation.mutate({
            ip: parsed.data.ip,
            reason: parsed.data.reason,
            durationMs,
        });
    };

    if (isPending) {
        return (
            <DashboardLayout>
                <PageState
                    loading
                    title="Loading blacklist"
                    description="Reading current blacklist entries from the application database."
                    className="min-h-[60vh]"
                />
            </DashboardLayout>
        );
    }

    if (error) {
        return (
            <DashboardLayout>
                <PageState
                    tone="danger"
                    title="Blacklist unavailable"
                    description={error instanceof Error ? error.message : "Unable to load blacklist data."}
                    action={<Button onClick={() => refetch()}>Retry</Button>}
                    className="min-h-[60vh]"
                />
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <PageHeader
                    title="IP Blacklist"
                    description="Review auto-banned clients and control manual access blocks for the web UI."
                    icon={ShieldBan}
                    badge={
                        <Badge variant="outline" className="border-border/70 bg-background/70">
                            {isAdmin ? "Admin actions enabled" : "Read-only for operators"}
                        </Badge>
                    }
                    actions={
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                className="h-10 gap-2 rounded-xl border-border/70 bg-background/70 shadow-none"
                                onClick={() => cleanupMutation.mutate()}
                                disabled={!isAdmin || cleanupMutation.isPending}
                            >
                                {cleanupMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Clock className="h-4 w-4" />
                                )}
                                Cleanup Expired
                            </Button>
                            <Dialog
                                open={banDialogOpen}
                                onOpenChange={(open) => {
                                    setBanDialogOpen(open);
                                    if (!open) {
                                        setBanForm({ ip: "", reason: "manual", durationMinutes: "" });
                                        setBanErrors({});
                                    }
                                }}
                            >
                                <DialogTrigger asChild>
                                    <Button className="h-10 gap-2 rounded-xl" disabled={!isAdmin}>
                                        <Plus className="h-4 w-4" />
                                        Manual Ban
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Ban IP address</DialogTitle>
                                        <DialogDescription>
                                            This blocks login and API access for the selected client address.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="grid gap-2">
                                            <Label htmlFor="blacklist-ip">IP address</Label>
                                            <Input
                                                id="blacklist-ip"
                                                placeholder="example: 192.168.11.90"
                                                value={banForm.ip}
                                                onChange={(event) => {
                                                    setBanForm((current) => ({ ...current, ip: event.target.value }));
                                                    setBanErrors((current) => ({ ...current, ip: undefined }));
                                                }}
                                            />
                                            {banErrors.ip ? (
                                                <p className="text-sm text-destructive">{banErrors.ip}</p>
                                            ) : null}
                                        </div>

                                        <div className="grid gap-2">
                                            <Label>Reason</Label>
                                            <Select
                                                value={banForm.reason}
                                                onValueChange={(value: BlacklistBanFormValues["reason"]) => {
                                                    setBanForm((current) => ({ ...current, reason: value }));
                                                    setBanErrors((current) => ({ ...current, reason: undefined }));
                                                }}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="manual">Manual</SelectItem>
                                                    <SelectItem value="api_abuse">API abuse</SelectItem>
                                                    <SelectItem value="brute_force">Brute force</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="grid gap-2">
                                            <Label htmlFor="blacklist-duration">
                                                Duration in minutes
                                            </Label>
                                            <Input
                                                id="blacklist-duration"
                                                type="number"
                                                placeholder="empty = permanent"
                                                value={banForm.durationMinutes}
                                                onChange={(event) => {
                                                    setBanForm((current) => ({
                                                        ...current,
                                                        durationMinutes: event.target.value,
                                                    }));
                                                    setBanErrors((current) => ({
                                                        ...current,
                                                        durationMinutes: undefined,
                                                    }));
                                                }}
                                            />
                                            <p className="text-sm text-muted-foreground">
                                                Use a temporary ban for noisy clients, or leave this blank for a permanent entry.
                                            </p>
                                            {banErrors.durationMinutes ? (
                                                <p className="text-sm text-destructive">{banErrors.durationMinutes}</p>
                                            ) : null}
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setBanDialogOpen(false)}>
                                            Cancel
                                        </Button>
                                        <Button onClick={handleBan} disabled={banMutation.isPending}>
                                            {banMutation.isPending ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <Ban className="mr-2 h-4 w-4" />
                                            )}
                                            Ban IP
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    }
                />

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        label="Active bans"
                        value={blacklist.length}
                        description="Current blacklist entries"
                        icon={ShieldBan}
                        tone={blacklist.length > 0 ? "warning" : "success"}
                    />
                    <MetricCard
                        label="Permanent"
                        value={metrics.permanent}
                        description="Entries without expiry"
                        icon={Shield}
                    />
                    <MetricCard
                        label="Temporary"
                        value={metrics.temporary}
                        description="Entries with expiry timestamps"
                        icon={Clock}
                    />
                    <MetricCard
                        label="Brute force"
                        value={metrics.bruteForce}
                        description="Bans tagged as brute force"
                        icon={AlertTriangle}
                        tone={metrics.bruteForce > 0 ? "warning" : "success"}
                    />
                </div>

                {!isAdmin ? (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Read-only mode</AlertTitle>
                        <AlertDescription>
                            Operators can review blacklist activity, but only administrators can ban, unban, or clean up entries.
                        </AlertDescription>
                    </Alert>
                ) : (
                    <Alert>
                        <Shield className="h-4 w-4" />
                        <AlertTitle>Automatic protection is active</AlertTitle>
                        <AlertDescription>
                            The application automatically bans clients after repeated failed logins. Manual bans here use the same enforcement path as the automatic protection.
                        </AlertDescription>
                    </Alert>
                )}

                <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
                    <CardHeader className="border-b border-border/60">
                        <CardTitle>Banned Clients</CardTitle>
                        <CardDescription>
                            IPs listed here cannot authenticate or call the application API.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        {blacklist.length === 0 ? (
                            <PageState
                                title="Blacklist is empty"
                                description="No client addresses are currently blocked."
                            />
                        ) : (
                            <div className="rounded-2xl border border-border/60">
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
                                                            className="text-destructive hover:text-destructive"
                                                            onClick={() => setUnbanTarget(entry)}
                                                            disabled={!isAdmin}
                                                        >
                                                            <Trash2 className="mr-1 h-4 w-4" />
                                                            Unban
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

                <AlertDialog open={Boolean(unbanTarget)} onOpenChange={(open) => !open && setUnbanTarget(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Unban IP address</AlertDialogTitle>
                            <AlertDialogDescription>
                                {unbanTarget ? (
                                    <>
                                        Remove <strong>{unbanTarget.ip}</strong> from the blacklist? The client will immediately be able to retry login and API access.
                                    </>
                                ) : null}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={unbanMutation.isPending}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => unbanTarget && unbanMutation.mutate(unbanTarget.ip)}
                                disabled={unbanMutation.isPending}
                            >
                                {unbanMutation.isPending ? "Unbanning..." : "Unban"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </DashboardLayout>
    );
}
