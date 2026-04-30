import { useMemo, useState } from "react";
import { AlertTriangle, Clock, KeyRound, Loader2, Shield, User } from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard, PageHeader } from "@/components/layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-provider";
import {
    validateOwnPasswordChange,
    type OwnPasswordChangeValues,
} from "@/lib/client-schemas";

type PasswordField = "currentPassword" | "newPassword" | "confirmPassword";

function collectFieldErrors(
    issues: Array<{ path: Array<string | number>; message: string }>,
) {
    const next: Partial<Record<PasswordField, string>> = {};
    for (const issue of issues) {
        const field = String(issue.path[0] ?? "") as PasswordField;
        if (field && !next[field]) {
            next[field] = issue.message;
        }
    }
    return next;
}

function roleTone(role: string | undefined) {
    switch (role) {
        case "admin":
            return "default";
        case "operator":
            return "secondary";
        default:
            return "outline";
    }
}

export default function ProfilePage() {
    const { user, changeOwnPassword, mustChangePassword } = useAuth();
    const { toast } = useToast();
    const [form, setForm] = useState<OwnPasswordChangeValues>({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });
    const [errors, setErrors] = useState<Partial<Record<PasswordField, string>>>({});
    const [loading, setLoading] = useState(false);

    const joinedLabel = useMemo(() => {
        if (!user?.createdAt) {
            return "Unknown";
        }
        return new Date(user.createdAt as string).toLocaleDateString();
    }, [user?.createdAt]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        const parsed = validateOwnPasswordChange(form, {
            requireCurrentPassword: !mustChangePassword,
        });
        if (!parsed.success) {
            setErrors(collectFieldErrors(parsed.error.issues));
            return;
        }

        setLoading(true);
        try {
            await changeOwnPassword(
                parsed.data.newPassword,
                mustChangePassword ? undefined : parsed.data.currentPassword,
            );
            setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
            setErrors({});
            toast({
                title: "Password updated",
                description: "Your password has been changed successfully.",
            });
        } catch (err: any) {
            toast({
                variant: "destructive",
                title: "Password change failed",
                description: err.message,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <PageHeader
                    title="My Profile"
                    description="Review your account identity and keep your access credentials current."
                    icon={User}
                    badge={
                        <Badge variant={roleTone(user?.role)} className="border-border/70 bg-background/70 capitalize">
                            {user?.role || "viewer"}
                        </Badge>
                    }
                />

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        label="Role"
                        value={user?.role ? user.role.toUpperCase() : "UNKNOWN"}
                        description="Current authorization profile"
                        icon={Shield}
                        tone={user?.role === "admin" ? "success" : "default"}
                    />
                    <MetricCard
                        label="Password state"
                        value={mustChangePassword ? "Rotation required" : "Current"}
                        description={mustChangePassword ? "Change required before continuing" : "No pending reset flag"}
                        icon={KeyRound}
                        tone={mustChangePassword ? "warning" : "success"}
                    />
                    <MetricCard
                        label="User ID"
                        value={user?.id || "Unknown"}
                        description="Internal account identifier"
                        icon={User}
                    />
                    <MetricCard
                        label="Joined"
                        value={joinedLabel}
                        description="Account creation date"
                        icon={Clock}
                    />
                </div>

                {mustChangePassword ? (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Password change required</AlertTitle>
                        <AlertDescription>
                            This account still carries a forced password reset flag. Until the password is changed, the application will continue redirecting you to the password update flow.
                        </AlertDescription>
                    </Alert>
                ) : (
                    <Alert>
                        <Shield className="h-4 w-4" />
                        <AlertTitle>Account security</AlertTitle>
                        <AlertDescription>
                            Keep this password unique to the Bind9 web UI. API tokens and BIND TSIG secrets are managed separately and should not reuse your user password.
                        </AlertDescription>
                    </Alert>
                )}

                <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
                        <CardHeader className="border-b border-border/60">
                            <CardTitle className="flex items-center gap-2">
                                <User className="h-5 w-5" />
                                Account Identity
                            </CardTitle>
                            <CardDescription>Your account metadata and assigned role.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5 pt-5">
                            <div className="flex items-center gap-4">
                                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
                                    {user?.username?.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xl font-semibold">{user?.username}</p>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant={roleTone(user?.role)} className="capitalize">
                                            <Shield className="mr-1 h-3 w-3" />
                                            {user?.role || "viewer"}
                                        </Badge>
                                        {mustChangePassword ? (
                                            <Badge variant="destructive">
                                                <KeyRound className="mr-1 h-3 w-3" />
                                                Password reset required
                                            </Badge>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="rounded-2xl border border-border/60 bg-background/45 p-4">
                                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                        User ID
                                    </div>
                                    <div className="font-mono text-sm">{user?.id}</div>
                                </div>
                                <div className="rounded-2xl border border-border/60 bg-background/45 p-4">
                                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                        Created
                                    </div>
                                    <div className="text-sm">{joinedLabel}</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="linear-panel border-border/60 bg-card/78 shadow-none">
                        <CardHeader className="border-b border-border/60">
                            <CardTitle className="flex items-center gap-2">
                                <KeyRound className="h-5 w-5" />
                                Change Password
                            </CardTitle>
                            <CardDescription>
                                {mustChangePassword
                                    ? "Set a new password now to finish account activation."
                                    : "Update your password without affecting your API tokens or managed DNS targets."}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-5">
                            <form onSubmit={handleSubmit} className="grid gap-4">
                                {!mustChangePassword ? (
                                    <div className="grid gap-2">
                                        <Label htmlFor="current-password">Current password</Label>
                                        <Input
                                            id="current-password"
                                            type="password"
                                            value={form.currentPassword}
                                            onChange={(event) => {
                                                setForm((current) => ({
                                                    ...current,
                                                    currentPassword: event.target.value,
                                                }));
                                                setErrors((current) => ({
                                                    ...current,
                                                    currentPassword: undefined,
                                                }));
                                            }}
                                        />
                                        {errors.currentPassword ? (
                                            <p className="text-sm text-destructive">{errors.currentPassword}</p>
                                        ) : null}
                                    </div>
                                ) : null}

                                <div className="grid gap-2">
                                    <Label htmlFor="new-password">New password</Label>
                                    <Input
                                        id="new-password"
                                        type="password"
                                        value={form.newPassword}
                                        onChange={(event) => {
                                            setForm((current) => ({
                                                ...current,
                                                newPassword: event.target.value,
                                            }));
                                            setErrors((current) => ({
                                                ...current,
                                                newPassword: undefined,
                                            }));
                                        }}
                                    />
                                    <p className="text-sm text-muted-foreground">
                                        The backend currently enforces a minimum of 8 characters.
                                    </p>
                                    {errors.newPassword ? (
                                        <p className="text-sm text-destructive">{errors.newPassword}</p>
                                    ) : null}
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="confirm-password">Confirm password</Label>
                                    <Input
                                        id="confirm-password"
                                        type="password"
                                        value={form.confirmPassword}
                                        onChange={(event) => {
                                            setForm((current) => ({
                                                ...current,
                                                confirmPassword: event.target.value,
                                            }));
                                            setErrors((current) => ({
                                                ...current,
                                                confirmPassword: undefined,
                                            }));
                                        }}
                                    />
                                    {errors.confirmPassword ? (
                                        <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                                    ) : null}
                                </div>

                                <Button type="submit" disabled={loading} className="w-fit rounded-xl">
                                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Update Password
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    );
}
