import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
    getFirewallStatus, toggleFirewall, addFirewallRule, deleteFirewallRule,
    type FirewallStatus
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Shield, ShieldAlert, ShieldCheck, Plus, Trash2, Loader2, AlertTriangle, ArrowRight, Activity, Ban, CheckCircle2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function FirewallPage() {
    const [status, setStatus] = useState<FirewallStatus>({ active: false, rules: [], installed: true });
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
            <DashboardLayout>
                <div className="flex items-center justify-center h-[50vh]">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </DashboardLayout>
        );
    }

    if (!isAdmin) {
        return (
            <DashboardLayout>
                <div className="p-8 text-center text-muted-foreground">
                    <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-destructive" />
                    <h2 className="text-xl font-bold">Access Denied</h2>
                    <p>Only administrators can manage the firewall.</p>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Firewall</h1>
                        <p className="text-muted-foreground mt-1">Manage system network security (UFW).</p>
                    </div>
                </div>

                {/* Status Card */}
                {!status.installed ? (
                    <Card className="glass-panel border-l-4 border-l-orange-500 bg-orange-500/5">
                        <CardContent className="flex items-center gap-6 py-8">
                            <div className="p-4 rounded-full bg-orange-500/10">
                                <AlertTriangle className="h-12 w-12 text-orange-500" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight text-foreground">Firewall Not Detected</h2>
                                <p className="text-muted-foreground mt-2 max-w-lg">
                                    The <code>ufw</code> command was not found on this system.
                                    This interface relies on UFW to manage rules.
                                    <br /><br />
                                    Please install UFW to use this feature:
                                    <code className="block mt-2 bg-black/20 p-2 rounded text-xs font-mono">sudo apt-get install ufw</code>
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className={`glass-panel border-l-4 ${status.active ? "border-l-green-500 shadow-[0_0_20px_rgba(34,197,94,0.1)]" : "border-l-destructive shadow-[0_0_20px_rgba(239,68,68,0.1)]"}`}>
                        <CardContent className="flex items-center justify-between py-8">
                            <div className="flex items-center gap-6">
                                <div className={`p-4 rounded-full ${status.active ? "bg-green-500/10" : "bg-destructive/10"}`}>
                                    {status.active ?
                                        <ShieldCheck className="h-12 w-12 text-green-500" /> :
                                        <ShieldAlert className="h-12 w-12 text-destructive" />
                                    }
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                                        Firewall is {status.active ? "Active" : "Inactive"}
                                        {status.active && <span className="relative flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                        </span>}
                                    </h2>
                                    <p className="text-muted-foreground mt-1 max-w-lg">
                                        {status.active
                                            ? "Your system is protected. Incoming connections are blocked unless explicitly allowed by the rules below."
                                            : "Your system is currently exposed to all incoming traffic. Enable the firewall to secure your network."}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 bg-card/50 p-4 rounded-lg border border-border/50">
                                <div className="text-right mr-2">
                                    <Label htmlFor="fw-toggle" className="block font-semibold mb-1 cursor-pointer">
                                        {toggling ? "Updating..." : (status.active ? "Enabled" : "Disabled")}
                                    </Label>
                                    <span className={`text-xs ${status.active ? "text-green-500 font-medium" : "text-muted-foreground"}`}>
                                        {status.active ? "Active on Startup" : "Inactive"}
                                    </span>
                                </div>
                                <Switch
                                    id="fw-toggle"
                                    checked={status.active}
                                    onCheckedChange={handleToggle}
                                    disabled={loading || toggling}
                                    className={status.active ? "data-[state=checked]:bg-green-500" : "data-[state=unchecked]:bg-destructive"}
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Rules Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                            <Activity className="w-5 h-5 text-primary" />
                            Active Rules
                        </h2>
                        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="shadow-[0_0_15px_rgba(0,240,255,0.3)]">
                                    <Plus className="h-4 w-4 mr-2" /> Add New Rule
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[450px] border-primary/20 bg-card/95 backdrop-blur-xl">
                                <DialogHeader>
                                    <DialogTitle>Add Firewall Rule</DialogTitle>
                                    <DialogDescription>Create a new rule for incoming traffic.</DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-5 py-4">
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
                                        <div className="col-span-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400 p-3 rounded-md text-sm flex items-start gap-2">
                                            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                                            <div>
                                                <span className="font-bold block">Warning</span>
                                                Denying SSH access may lock you out of the server immediately.
                                            </div>
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
                    </div>

                    {status.rules.length === 0 ? (
                        <Card className="glass-panel border-dashed border-2 border-primary/20 bg-muted/5">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                                <Shield className="h-12 w-12 mb-4 opacity-20" />
                                <h3 className="text-lg font-semibold">No Rules Defined</h3>
                                <p className="max-w-sm mt-2 mb-6">Your firewall policy is empty. Add rules to explicitly allow traffic to your services.</p>
                                <Button variant="outline" onClick={() => setDialogOpen(true)}>Create First Rule</Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {status.rules.map((rule) => {
                                const isAllow = rule.action === "ALLOW";
                                const isDeny = rule.action === "DENY";

                                return (
                                    <Card key={rule.id} className="glass-panel group hover:border-primary/40 transition-all duration-300">
                                        <CardContent className="p-5">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-md ${isAllow ? "bg-green-500/10 text-green-500" : isDeny ? "bg-red-500/10 text-red-500" : "bg-orange-500/10 text-orange-500"}`}>
                                                        {isAllow ? <CheckCircle2 className="w-5 h-5" /> : <Ban className="w-5 h-5" />}
                                                    </div>
                                                    <div>
                                                        <span className="font-mono text-lg font-bold block">{rule.to}</span>
                                                        <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{rule.action} IN</span>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mt-1 -mr-2"
                                                    onClick={() => handleDeleteRule(rule.id)}
                                                    title="Delete Rule"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>

                                            <Separator className="my-3 bg-border/40" />

                                            <div className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <ArrowRight className="w-4 h-4" />
                                                    <span>From:</span>
                                                </div>
                                                <Badge variant="outline" className="font-mono font-normal">
                                                    {rule.from}
                                                    {rule.ipv6 && <span className="ml-1 text-[10px] text-muted-foreground">(v6)</span>}
                                                </Badge>
                                            </div>

                                            <div className="mt-4 text-[10px] text-muted-foreground font-mono flex justify-between">
                                                <span>Rule ID: {rule.id}</span>
                                                {/* <span>{rule.comment}</span> */}
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
