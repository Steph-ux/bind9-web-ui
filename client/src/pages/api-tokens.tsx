import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getApiTokens, createApiToken, revokeApiToken, type ApiTokenEntry } from "@/lib/api";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Key, Plus, Trash2, Copy, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import {
    Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function ApiTokensPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [createOpen, setCreateOpen] = useState(false);
    const [tokenName, setTokenName] = useState("");
    const [tokenPerms, setTokenPerms] = useState("*");
    const [tokenExpiry, setTokenExpiry] = useState("");
    const [revealedToken, setRevealedToken] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const { data: tokens = [], isLoading } = useQuery<ApiTokenEntry[]>({
        queryKey: ["/api/tokens"],
        queryFn: getApiTokens,
    });

    const createMutation = useMutation({
        mutationFn: () => createApiToken(tokenName, tokenPerms === "*" ? undefined : tokenPerms, tokenExpiry || undefined),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["/api/tokens"] });
            setRevealedToken(data.token);
            setCreateOpen(false);
            setTokenName("");
            setTokenPerms("*");
            setTokenExpiry("");
            toast({ title: "Token created", description: "Copy the token now — it won't be shown again!" });
        },
        onError: (err: Error) => {
            toast({ variant: "destructive", title: "Failed to create token", description: err.message });
        },
    });

    const revokeMutation = useMutation({
        mutationFn: (id: string) => revokeApiToken(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/tokens"] });
            toast({ title: "Token revoked" });
        },
        onError: (err: Error) => {
            toast({ variant: "destructive", title: "Failed to revoke token", description: err.message });
        },
    });

    const copyToken = async () => {
        if (revealedToken) {
            await navigator.clipboard.writeText(revealedToken);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const dismissRevealed = () => {
        setRevealedToken(null);
        setCopied(false);
    };

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Key className="h-8 w-8" /> API Tokens
                    </h2>
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2">
                                <Plus className="h-4 w-4" /> New Token
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create API Token</DialogTitle>
                                <DialogDescription>
                                    The raw token will be shown only once after creation. Store it securely.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="token-name">Token Name</Label>
                                    <Input
                                        id="token-name"
                                        placeholder="e.g. CI/CD Pipeline"
                                        value={tokenName}
                                        onChange={e => setTokenName(e.target.value)}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Permissions</Label>
                                    <Select value={tokenPerms} onValueChange={setTokenPerms}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="*">Full Access (*)</SelectItem>
                                            <SelectItem value="zones:read,records:read">Zones & Records (read-only)</SelectItem>
                                            <SelectItem value="zones,records">Zones & Records (read/write)</SelectItem>
                                            <SelectItem value="dashboard,zones:read">Dashboard + Zones (read-only)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="token-expiry">Expiry (optional)</Label>
                                    <Input
                                        id="token-expiry"
                                        type="datetime-local"
                                        value={tokenExpiry}
                                        onChange={e => setTokenExpiry(e.target.value)}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                                <Button
                                    onClick={() => createMutation.mutate()}
                                    disabled={!tokenName || createMutation.isPending}
                                >
                                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Create Token
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* Revealed token alert */}
                {revealedToken && (
                    <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950">
                        <CardContent className="pt-6">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="font-semibold text-amber-800 dark:text-amber-200">Copy this token now — it won't be shown again!</p>
                                    <div className="mt-2 flex items-center gap-2">
                                        <code className="bg-black/10 dark:bg-white/10 px-3 py-1.5 rounded text-sm font-mono break-all select-all">
                                            {revealedToken}
                                        </code>
                                        <Button size="sm" variant="outline" onClick={copyToken}>
                                            {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                </div>
                                <Button size="sm" variant="ghost" onClick={dismissRevealed}>Dismiss</Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle>Active Tokens</CardTitle>
                        <CardDescription>Manage API tokens for programmatic access to BIND9Admin</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                        ) : tokens.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">No API tokens created yet</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Prefix</TableHead>
                                        <TableHead>Permissions</TableHead>
                                        <TableHead>Last Used</TableHead>
                                        <TableHead>Expires</TableHead>
                                        <TableHead>Created</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {tokens.map((t) => (
                                        <TableRow key={t.id}>
                                            <TableCell className="font-medium">{t.name}</TableCell>
                                            <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{t.tokenPrefix}…</code></TableCell>
                                            <TableCell>
                                                <Badge variant={t.permissions === "*" ? "default" : "secondary"}>
                                                    {t.permissions}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "Never"}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {t.expiresAt ? new Date(t.expiresAt).toLocaleDateString() : "Never"}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {new Date(t.createdAt).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => revokeMutation.mutate(t.id)}
                                                    disabled={revokeMutation.isPending}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}
