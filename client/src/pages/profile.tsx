import { useState } from "react";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { User, KeyRound, Loader2, Shield, Clock } from "lucide-react";
import {
    Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function ProfilePage() {
    const { user, changeOwnPassword, mustChangePassword } = useAuth();
    const { toast } = useToast();
    const [currentPassword, setCurrentPassword] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!mustChangePassword && !currentPassword) {
            toast({ variant: "destructive", title: "Current password required" });
            return;
        }
        if (password.length < 8) {
            toast({ variant: "destructive", title: "Too short", description: "Minimum 8 characters" });
            return;
        }
        if (password !== confirm) {
            toast({ variant: "destructive", title: "Passwords don't match" });
            return;
        }
        setLoading(true);
        try {
            await changeOwnPassword(password, mustChangePassword ? undefined : currentPassword);
            setCurrentPassword("");
            setPassword("");
            setConfirm("");
            toast({ title: "Password updated", description: "Your password has been changed successfully" });
        } catch (err: any) {
            toast({ variant: "destructive", title: "Failed", description: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <DashboardLayout>
            <div className="space-y-6 max-w-2xl">
                <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <User className="h-8 w-8" /> My Profile
                </h2>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5" /> Account Information
                        </CardTitle>
                        <CardDescription>Your account details and role</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground text-2xl font-bold">
                                {user?.username?.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <p className="text-xl font-semibold">{user?.username}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant={user?.role === "admin" ? "default" : user?.role === "operator" ? "secondary" : "outline"}>
                                        <Shield className="h-3 w-3 mr-1" />
                                        {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : ""}
                                    </Badge>
                                    {mustChangePassword && (
                                        <Badge variant="destructive">
                                            <KeyRound className="h-3 w-3 mr-1" /> Must change password
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">User ID</p>
                                <p className="font-mono">{user?.id}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Created</p>
                                <p>{user?.createdAt ? new Date(user.createdAt as string).toLocaleDateString() : "N/A"}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <KeyRound className="h-5 w-5" /> Change Password
                        </CardTitle>
                        <CardDescription>
                            {mustChangePassword
                                ? "You must change your default password before continuing."
                                : "Update your account password"}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="grid gap-4">
                            {!mustChangePassword && (
                                <div className="grid gap-2">
                                    <Label htmlFor="current-password">Current Password</Label>
                                    <Input
                                        id="current-password"
                                        type="password"
                                        placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                                        value={currentPassword}
                                        onChange={e => setCurrentPassword(e.target.value)}
                                    />
                                </div>
                            )}
                            <div className="grid gap-2">
                                <Label htmlFor="password">New Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="confirm">Confirm Password</Label>
                                <Input
                                    id="confirm"
                                    type="password"
                                    placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                                    value={confirm}
                                    onChange={e => setConfirm(e.target.value)}
                                />
                            </div>
                            <Button type="submit" disabled={loading || !password || !confirm} className="w-fit">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Update Password
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}

