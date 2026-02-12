
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";
import {
    getFirewallStatus, toggleFirewall, addFirewallRule, deleteFirewallRule,
    type FirewallStatus, type FirewallRule
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Shield, ShieldAlert, ShieldCheck, Plus, Trash2, Loader2, AlertTriangle } from "lucide-react";

export default function FirewallPage() {
    const [status, setStatus] = useState<FirewallStatus>({ active: false, rules: [] });
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);

    // Form state
    const [toPort, setToPort] = useState("");
    const [proto, setProto] = useState("tcp");
    const [action, setAction] = useState("allow");
    const [fromIp, setFromIp] = useState("any");
    const [saving, setSaving] = useState(false);

    const { toast } = useToast();
    const { isAdmin } = useAuth();

    const fetchData = async () => {
        try {
            const data = await getFirewallStatus();
            setStatus(data);
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleToggle = async (checked: boolean) => {
        setToggling(true);
        try {
            await toggleFirewall(checked);
            setStatus(prev => ({ ...prev, active: checked }));
            toast({
                title: checked ? "Firewall Enabled" : "Firewall Disabled",
                description: checked ? "System is now protected." : "System is rightfully exposed."
            });
            fetchData(); // Refresh to get updated rules/status
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
            // Revert switch visually
            fetchData();
        } finally {
            setToggling(false);
        }
    };

    const handleAddRule = async () => {
        if (!toPort) {
            toast({ title: "Error", description: "Port/Service is required", variant: "destructive" });
            return;
        }
        setSaving(true);
        try {
            await addFirewallRule({ toPort, proto, action, fromIp });
            toast({ title: "Rule added" });
            setDialogOpen(false);
            fetchData();
            // Reset form
            setToPort(""); setProto("tcp"); setAction("allow"); setFromIp("any");
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteRule = async (id: number) => {
        if (!confirm("Delete this rule?")) return;
        try {
            await deleteFirewallRule(id);
            toast({ title: "Rule deleted" });
            fetchData();
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="p-8 text-center text-muted-foreground">
                <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-destructive" />
                <h2 className="text-xl font-bold">Access Denied</h2>
                <p>Only administrators can manage the firewall.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Firewall</h1>
                    <p className="text-muted-foreground mt-1">Manage system network security (UFW).</p>
                </div>
            </div>

            {/* Status Card */}
            <Card className={status.active ? "border-green-500/50 bg-green-500/5" : "border-destructive/50 bg-destructive/5"}>
                <CardContent className="flex items-center justify-between py-6">
                    <div className="flex items-center gap-4">
                        {status.active ?
                            <ShieldCheck className="h-10 w-10 text-green-500" /> :
                            <ShieldAlert className="h-10 w-10 text-destructive" />
                        }
                        <div>
                            <h2 className="text-xl font-semibold">
                                Firewall is {status.active ? "Active" : "Inactive"}
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                {status.active ? "Incoming connections are blocked unless allowed." : "All incoming connections are currently allowed."}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Label htmlFor="fw-toggle" className="font-medium">
                            {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : (status.active ? "Enabled" : "Disabled")}
                        </Label>
                        <Switch
                            id="fw-toggle"
                            checked={status.active}
                            onCheckedChange={handleToggle}
                            disabled={toggling}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Rules */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Rules</CardTitle>
                        <CardDescription>Active firewall allow/deny rules.</CardDescription>
                    </div>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 mr-2" /> Add Rule
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>Add Firewall Rule</DialogTitle>
                                <DialogDescription>Create a new rule for incoming traffic.</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label className="text-right">Port / App</Label>
                                    <Input
                                        value={toPort} onChange={e => setToPort(e.target.value)}
                                        placeholder="80, 443, ssh"
                                        className="col-span-3 font-mono"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label className="text-right">Protocol</Label>
                                    <Select value={proto} onValueChange={setProto}>
                                        <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="tcp">TCP</SelectItem>
                                            <SelectItem value="udp">UDP</SelectItem>
                                            <SelectItem value="any">Any</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label className="text-right">Action</Label>
                                    <Select value={action} onValueChange={setAction}>
                                        <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="allow">ALLOW</SelectItem>
                                            <SelectItem value="deny">DENY</SelectItem>
                                            <SelectItem value="reject">REJECT</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label className="text-right">From IP</Label>
                                    <Input
                                        value={fromIp} onChange={e => setFromIp(e.target.value)}
                                        placeholder="any, 192.168.1.5"
                                        className="col-span-3 font-mono"
                                    />
                                </div>
                                {(toPort === "22" || toPort === "ssh") && action === "deny" && (
                                    <div className="col-span-4 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 p-2 rounded text-xs flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        Warning: Denying SSH may lock you out!
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button onClick={handleAddRule} disabled={saving}>
                                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Add Rule
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </CardHeader>
                <CardContent>
                    {status.rules.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No rules defined.
                        </div>
                    ) : (
                        <div className="rounded-md border">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted/50 font-medium">
                                    <tr className="border-b">
                                        <th className="p-3 w-[60px]">ID</th>
                                        <th className="p-3">Traffic (To)</th>
                                        <th className="p-3">Action</th>
                                        <th className="p-3">From</th>
                                        <th className="p-3 w-[50px]"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {status.rules.map((rule) => (
                                        <tr key={rule.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                                            <td className="p-3 text-muted-foreground font-mono">[{rule.id}]</td>
                                            <td className="p-3 font-mono">
                                                {rule.to}
                                                {rule.ipv6 && <Badge variant="outline" className="ml-2 text-[10px] h-4 px-1">v6</Badge>}
                                            </td>
                                            <td className="p-3">
                                                <Badge variant={rule.action === "ALLOW" ? "default" : "destructive"}>
                                                    {rule.action}
                                                </Badge>
                                            </td>
                                            <td className="p-3 font-mono">{rule.from}</td>
                                            <td className="p-3 text-right">
                                                <Button
                                                    variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                                                    onClick={() => handleDeleteRule(rule.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
