import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertTriangle,
    CheckCircle2,
    Copy,
    Key,
    Loader2,
    Plus,
    Shield,
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
import {
    createApiToken,
    getApiTokens,
    revokeApiToken,
    type ApiTokenEntry,
} from "@/lib/api";
import {
    validateApiTokenForm,
    type ApiTokenFormValues,
} from "@/lib/client-schemas";

type TokenField = "name" | "permissions" | "expiresAt";

type TokenPreset = {
    id: string;
    label: string;
    value: string;
    description: string;
};

const TOKEN_PERMISSION_PRESETS: TokenPreset[] = [
    {
        id: "full",
        label: "Full access",
        value: "*",
        description: "Full API access, including administrative endpoints.",
    },
    {
        id: "ops-read",
        label: "Operations read-only",
        value: "dashboard:read,status:read,server:read,logs:read",
        description: "Observe system state, dashboard metrics, and logs.",
    },
    {
        id: "zones-read",
        label: "Zones read-only",
        value: "zones:read,records:read",
        description: "Inspect zones and records without write access.",
    },
    {
        id: "zones-write",
        label: "Zones read/write",
        value: "zones,records",
        description: "Manage zones and records programmatically.",
    },
    {
        id: "security-read",
        label: "Security read-only",
        value: "acls:read,keys:read,rpz:read",
        description: "Inspect ACLs, TSIG keys, and RPZ data.",
    },
];

const CUSTOM_PRESET_ID = "custom";

function collectFieldErrors(
    issues: Array<{ path: Array<string | number>; message: string }>,
) {
    const next: Partial<Record<TokenField, string>> = {};
    for (const issue of issues) {
        const field = String(issue.path[0] ?? "") as TokenField;
        if (field && !next[field]) {
            next[field] = issue.message;
        }
    }
    return next;
}

function findPresetId(value: string) {
    const matching = TOKEN_PERMISSION_PRESETS.find((preset) => preset.value === value);
    return matching?.id ?? CUSTOM_PRESET_ID;
}

function formatTokenDate(value: string | null, withTime = false) {
    if (!value) {
        return "Never";
    }

    const parsed = new Date(value);
    return withTime ? parsed.toLocaleString() : parsed.toLocaleDateString();
}

function isExpiringSoon(expiresAt: string | null) {
    if (!expiresAt) {
        return false;
    }

    const diff = new Date(expiresAt).getTime() - Date.now();
    return diff > 0 && diff <= 30 * 24 * 60 * 60 * 1000;
}

export default function ApiTokensPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState<ApiTokenFormValues>({
        name: "",
        permissions: "*",
        expiresAt: "",
    });
    const [formErrors, setFormErrors] = useState<Partial<Record<TokenField, string>>>({});
    const [presetId, setPresetId] = useState<string>("full");
    const [revealedToken, setRevealedToken] = useState<{
        name: string;
        token: string;
        permissions: string;
    } | null>(null);
    const [copied, setCopied] = useState(false);
    const [revokeTarget, setRevokeTarget] = useState<ApiTokenEntry | null>(null);

    const {
        data: tokens = [],
        isPending,
        error,
        refetch,
        isFetching,
    } = useQuery<ApiTokenEntry[]>({
        queryKey: ["/api/tokens"],
        queryFn: getApiTokens,
    });

    const createMutation = useMutation({
        mutationFn: () =>
            createApiToken(
                form.name.trim(),
                form.permissions.trim(),
                form.expiresAt.trim() || undefined,
            ),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["/api/tokens"] });
            setRevealedToken({
                name: data.name,
                token: data.token,
                permissions: data.permissions,
            });
            setCreateOpen(false);
            setForm({ name: "", permissions: "*", expiresAt: "" });
            setFormErrors({});
            setPresetId("full");
            toast({
                title: "Token created",
                description: "Copy the raw token now. It will not be shown again.",
            });
        },
        onError: (err: Error) => {
            toast({
                variant: "destructive",
                title: "Failed to create token",
                description: err.message,
            });
        },
    });

    const revokeMutation = useMutation({
        mutationFn: (id: string) => revokeApiToken(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/tokens"] });
            setRevokeTarget(null);
            toast({ title: "Token revoked" });
        },
        onError: (err: Error) => {
            toast({
                variant: "destructive",
                title: "Failed to revoke token",
                description: err.message,
            });
        },
    });

    const metrics = useMemo(() => {
        const fullAccess = tokens.filter((token) => token.permissions === "*").length;
        const used = tokens.filter((token) => token.lastUsedAt).length;
        const expiringSoon = tokens.filter((token) => isExpiringSoon(token.expiresAt)).length;
        return { fullAccess, used, expiringSoon };
    }, [tokens]);

    const activePreset = TOKEN_PERMISSION_PRESETS.find((preset) => preset.id === presetId) ?? null;

    const handleCreate = () => {
        const parsed = validateApiTokenForm(form);
        if (!parsed.success) {
            setFormErrors(collectFieldErrors(parsed.error.issues));
            return;
        }

        createMutation.mutate();
    };

    const handlePresetChange = (nextPresetId: string) => {
        setPresetId(nextPresetId);
        if (nextPresetId === CUSTOM_PRESET_ID) {
            return;
        }

        const preset = TOKEN_PERMISSION_PRESETS.find((item) => item.id === nextPresetId);
        if (!preset) {
            return;
        }

        setForm((current) => ({ ...current, permissions: preset.value }));
        setFormErrors((current) => ({ ...current, permissions: undefined }));
    };

    const handleCopyToken = async () => {
        if (!revealedToken) {
            return;
        }

        try {
            await navigator.clipboard.writeText(revealedToken.token);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast({
                variant: "destructive",
                title: "Copy failed",
                description: "Copy the token manually from the field below.",
            });
        }
    };

    if (isPending) {
        return (
            <DashboardLayout>
                <PageState
                    loading
                    title="Loading API tokens"
                    description="Reading token metadata from the application database."
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
                    title="API tokens unavailable"
                    description={error instanceof Error ? error.message : "Unable to load API tokens."}
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
                    title="API Tokens"
                    description="Issue scoped API credentials for automation without exposing user passwords."
                    icon={Key}
                    badge={
                        <Badge variant="outline" className="border-border/70 bg-background/70">
                            Admin only
                        </Badge>
                    }
                    actions={
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                className="h-10 rounded-xl border-border/70 bg-background/70 shadow-none"
                                onClick={() => refetch()}
                                disabled={isFetching}
                            >
                                {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
                            </Button>
                            <Dialog
                                open={createOpen}
                                onOpenChange={(open) => {
                                    setCreateOpen(open);
                                    if (!open) {
                                        setForm({ name: "", permissions: "*", expiresAt: "" });
                                        setFormErrors({});
                                        setPresetId("full");
                                    }
                                }}
                            >
                                <DialogTrigger asChild>
                                    <Button className="h-10 gap-2 rounded-xl">
                                        <Plus className="h-4 w-4" />
                                        New Token
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Create API Token</DialogTitle>
                                        <DialogDescription>
                                            The raw token is displayed only once after creation. Store it in a secret manager immediately.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid gap-2">
                                            <Label htmlFor="token-name">Token name</Label>
                                            <Input
                                                id="token-name"
                                                placeholder="example: CI pipeline"
                                                value={form.name}
                                                onChange={(event) => {
                                                    setForm((current) => ({ ...current, name: event.target.value }));
                                                    setFormErrors((current) => ({ ...current, name: undefined }));
                                                }}
                                            />
                                            {formErrors.name ? (
                                                <p className="text-sm text-destructive">{formErrors.name}</p>
                                            ) : null}
                                        </div>

                                        <div className="grid gap-2">
                                            <Label>Permission preset</Label>
                                            <Select value={presetId} onValueChange={handlePresetChange}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {TOKEN_PERMISSION_PRESETS.map((preset) => (
                                                        <SelectItem key={preset.id} value={preset.id}>
                                                            {preset.label}
                                                        </SelectItem>
                                                    ))}
                                                    <SelectItem value={CUSTOM_PRESET_ID}>Custom scope string</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <p className="text-sm text-muted-foreground">
                                                {(activePreset ?? {
                                                    description: "Enter a comma-separated scope string such as zones:read,records:read.",
                                                }).description}
                                            </p>
                                        </div>

                                        <div className="grid gap-2">
                                            <Label htmlFor="token-permissions">Permissions</Label>
                                            <Input
                                                id="token-permissions"
                                                placeholder="example: zones:read,records:read"
                                                value={form.permissions}
                                                onChange={(event) => {
                                                    const nextValue = event.target.value;
                                                    setForm((current) => ({ ...current, permissions: nextValue }));
                                                    setPresetId(findPresetId(nextValue.trim()));
                                                    setFormErrors((current) => ({ ...current, permissions: undefined }));
                                                }}
                                            />
                                            {formErrors.permissions ? (
                                                <p className="text-sm text-destructive">{formErrors.permissions}</p>
                                            ) : null}
                                        </div>

                                        <div className="grid gap-2">
                                            <Label htmlFor="token-expiry">Expiry</Label>
                                            <Input
                                                id="token-expiry"
                                                type="datetime-local"
                                                value={form.expiresAt}
                                                onChange={(event) => {
                                                    setForm((current) => ({ ...current, expiresAt: event.target.value }));
                                                    setFormErrors((current) => ({ ...current, expiresAt: undefined }));
                                                }}
                                            />
                                            <p className="text-sm text-muted-foreground">
                                                Leave empty to create a non-expiring token.
                                            </p>
                                            {formErrors.expiresAt ? (
                                                <p className="text-sm text-destructive">{formErrors.expiresAt}</p>
                                            ) : null}
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setCreateOpen(false)}>
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={handleCreate}
                                            disabled={createMutation.isPending}
                                        >
                                            {createMutation.isPending ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : null}
                                            Create Token
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    }
                />

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        label="Active tokens"
                        value={tokens.length}
                        description="Issued through the web UI API"
                        icon={Key}
                        tone="success"
                    />
                    <MetricCard
                        label="Full access"
                        value={metrics.fullAccess}
                        description="Tokens with unrestricted API scope"
                        icon={Shield}
                        tone={metrics.fullAccess > 0 ? "warning" : "success"}
                    />
                    <MetricCard
                        label="Used at least once"
                        value={metrics.used}
                        description="Tokens with recorded activity"
                        icon={CheckCircle2}
                    />
                    <MetricCard
                        label="Expiring soon"
                        value={metrics.expiringSoon}
                        description="Tokens expiring in the next 30 days"
                        icon={AlertTriangle}
                        tone={metrics.expiringSoon > 0 ? "warning" : "success"}
                    />
                </div>

                <Alert>
                    <Shield className="h-4 w-4" />
                    <AlertTitle>Application API credentials</AlertTitle>
                    <AlertDescription>
                        These tokens authenticate against the Bind9 web UI API itself. They do not replace BIND TSIG keys and they do not grant shell access to the managed DNS servers.
                    </AlertDescription>
                </Alert>

                {revealedToken ? (
                    <Alert className="border-amber-500/60 bg-amber-500/10 text-foreground">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <AlertTitle>Copy the token now</AlertTitle>
                        <AlertDescription className="space-y-3">
                            <p>
                                <strong>{revealedToken.name}</strong> was created with scope{" "}
                                <code className="rounded bg-background/70 px-1">{revealedToken.permissions}</code>.
                            </p>
                            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                <code className="block rounded-xl border border-border/70 bg-background/70 px-3 py-2 font-mono text-sm break-all">
                                    {revealedToken.token}
                                </code>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={handleCopyToken}>
                                        {copied ? (
                                            <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" />
                                        ) : (
                                            <Copy className="mr-2 h-4 w-4" />
                                        )}
                                        {copied ? "Copied" : "Copy"}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setRevealedToken(null)}>
                                        Dismiss
                                    </Button>
                                </div>
                            </div>
                        </AlertDescription>
                    </Alert>
                ) : null}

                <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
                    <CardHeader className="border-b border-border/60">
                        <CardTitle>Issued Tokens</CardTitle>
                        <CardDescription>
                            Revoke tokens that are no longer required. Expired tokens remain listed until deleted.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        {tokens.length === 0 ? (
                            <PageState
                                title="No API tokens yet"
                                description="Create a scoped token when automation needs to call the Bind9 web UI API."
                            />
                        ) : (
                            <div className="rounded-2xl border border-border/60">
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
                                        {tokens.map((token) => (
                                            <TableRow key={token.id}>
                                                <TableCell className="font-medium">{token.name}</TableCell>
                                                <TableCell>
                                                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                                        {token.tokenPrefix}...
                                                    </code>
                                                </TableCell>
                                                <TableCell className="max-w-[320px]">
                                                    <Badge
                                                        variant={token.permissions === "*" ? "default" : "secondary"}
                                                        className="max-w-full truncate"
                                                    >
                                                        {token.permissions}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {formatTokenDate(token.lastUsedAt, true)}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={isExpiringSoon(token.expiresAt) ? "destructive" : "outline"}
                                                    >
                                                        {formatTokenDate(token.expiresAt)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {formatTokenDate(token.createdAt)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => setRevokeTarget(token)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(open) => !open && setRevokeTarget(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Revoke API token</AlertDialogTitle>
                            <AlertDialogDescription>
                                {revokeTarget ? (
                                    <>
                                        Revoke <strong>{revokeTarget.name}</strong>? Any automation using this token will stop working immediately.
                                    </>
                                ) : null}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={revokeMutation.isPending}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
                                disabled={revokeMutation.isPending}
                            >
                                {revokeMutation.isPending ? "Revoking..." : "Revoke Token"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </DashboardLayout>
    );
}
