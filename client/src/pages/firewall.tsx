import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
    getFirewallStatus, toggleFirewall, addFirewallRule, deleteFirewallRule,
    type FirewallStatus
} from "@/lib/api";
import { Shield, ShieldAlert, ShieldCheck, Plus, Trash2, Loader2, AlertTriangle, ArrowRight, Activity, Ban, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";

export default function FirewallPage() {
    const [status, setStatus] = useState<FirewallStatus>({ active: false, rules: [], installed: true });
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(false);
    const [showModal, setShowModal] = useState(false);

    const [toPort, setToPort] = useState("");
    const [proto, setProto] = useState("tcp");
    const [action, setAction] = useState("allow");
    const [fromIp, setFromIp] = useState("any");
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

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

    useEffect(() => { fetchData(); }, []);

    const handleToggle = async (checked: boolean) => {
        setToggling(true);
        try {
            await toggleFirewall(checked);
            setStatus(prev => ({ ...prev, active: checked }));
            toast({
                title: checked ? "Firewall Enabled" : "Firewall Disabled",
                description: checked ? "System is now protected." : "System is rightfully exposed."
            });
            fetchData();
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
            setShowModal(false);
            fetchData();
            setToPort(""); setProto("tcp"); setAction("allow"); setFromIp("any");
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteRule = async (id: number) => {
        try {
            await deleteFirewallRule(id);
            toast({ title: "Rule deleted" });
            setDeleteTarget(null);
            fetchData();
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        }
    };

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center" style={{ height: "60vh" }}>
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </DashboardLayout>
        );
    }

    if (!isAdmin) {
        return (
            <DashboardLayout>
                <div className="text-center py-8">
                    <ShieldAlert className="h-12 w-12 text-destructive mb-3 mx-auto" />
                    <h4 className="font-semibold">Access Denied</h4>
                    <p className="text-muted-foreground">Only administrators can manage the firewall.</p>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Firewall</h2>
                    <p className="text-muted-foreground">Manage system network security (UFW).</p>
                </div>
            </div>

            {/* Status Banner */}
            {!status.installed ? (
                <Card className="mb-6 border-l-4 border-yellow-500">
                    <CardContent className="flex items-center gap-4 py-5">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500/10 shrink-0">
                            <AlertTriangle className="h-7 w-7 text-yellow-500" />
                        </div>
                        <div>
                            <h5 className="font-bold mb-1">Firewall Not Detected</h5>
                            <p className="text-muted-foreground mb-2">
                                The <code className="rounded bg-muted px-1">ufw</code> command was not found on this system. Please install UFW to use this feature:
                            </p>
                            <code className="block bg-zinc-900 dark:bg-zinc-900 text-zinc-100 dark:text-zinc-100 rounded p-2 text-sm">
                                sudo apt-get install ufw
                            </code>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card className={`mb-6 border-l-4 ${status.active ? "border-green-500" : "border-red-500"}`}>
                    <CardContent className="flex items-center justify-between gap-4 py-5">
                        <div className="flex items-center gap-4">
                            <div className={`flex h-14 w-14 items-center justify-center rounded-full shrink-0 ${status.active ? "bg-green-500/10" : "bg-red-500/10"}`}>
                                {status.active
                                    ? <ShieldCheck className="h-7 w-7 text-green-500" />
                                    : <ShieldAlert className="h-7 w-7 text-red-500" />}
                            </div>
                            <div>
                                <h5 className="mb-1 flex items-center gap-2">
                                    Firewall is {status.active ? "Active" : "Inactive"}
                                    {status.active && (
                                        <span className="relative ml-1" style={{ width: 10, height: 10, display: "inline-block" }}>
                                            <span className="absolute inset-0 rounded-full bg-green-500 opacity-75 animate-ping" />
                                            <span className="relative inline-block rounded-full bg-green-500" style={{ width: 10, height: 10 }} />
                                        </span>
                                    )}
                                </h5>
                                <p className="text-muted-foreground mb-0 text-sm max-w-md">
                                    {status.active
                                        ? "Your system is protected. Incoming connections are blocked unless explicitly allowed."
                                        : "Your system is currently exposed to all incoming traffic. Enable the firewall to secure your network."}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 rounded-md border bg-muted/50 p-3">
                            <div className="text-right">
                                <label className="font-semibold block mb-0 cursor-pointer" htmlFor="fw-toggle">
                                    {toggling ? "Updating..." : status.active ? "Enabled" : "Disabled"}
                                </label>
                                <small className={`text-xs ${status.active ? "text-green-600" : "text-muted-foreground"}`}>
                                    {status.active ? "Active on Startup" : "Inactive"}
                                </small>
                            </div>
                            <Switch
                                id="fw-toggle"
                                checked={status.active}
                                onCheckedChange={handleToggle}
                                disabled={loading || toggling}
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Rules Section */}
            <div className="flex items-center justify-between mb-4">
                <h5 className="flex items-center gap-2 font-semibold">
                    <Activity className="h-4 w-4 text-primary" /> Active Rules
                </h5>
                <Button className="gap-2" onClick={() => setShowModal(true)}>
                    <Plus className="h-4 w-4" /> Add New Rule
                </Button>
            </div>

            {status.rules.length === 0 ? (
                <Card className="border-dashed text-center py-8">
                    <CardContent>
                        <Shield className="h-10 w-10 text-muted-foreground/25 mb-3 mx-auto" />
                        <h5 className="font-semibold">No Rules Defined</h5>
                        <p className="text-muted-foreground mb-4">Your firewall policy is empty. Add rules to explicitly allow traffic to your services.</p>
                        <Button variant="outline" onClick={() => setShowModal(true)}>Create First Rule</Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {status.rules.map((rule) => {
                        const isAllow = rule.action === "ALLOW";
                        const isDeny = rule.action === "DENY";

                        return (
                            <Card key={rule.id}>
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className={`flex h-9 w-9 items-center justify-center rounded-md ${isAllow ? "bg-green-500/10 text-green-600" : isDeny ? "bg-red-500/10 text-red-600" : "bg-yellow-500/10 text-yellow-600"}`}>
                                                {isAllow ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                                            </div>
                                            <div>
                                                <code className="font-bold text-base block">{rule.to}</code>
                                                <small className="uppercase text-muted-foreground font-semibold text-[10px] tracking-widest">
                                                    {rule.action} IN
                                                </small>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(rule.id)} title="Delete Rule">
                                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                    </div>

                                    <div className="border-t my-2" />

                                    <div className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-1 text-muted-foreground">
                                            <ArrowRight className="h-3.5 w-3.5" /> From:
                                        </div>
                                        <Badge variant="secondary" className="font-mono">
                                            {rule.from}
                                            {rule.ipv6 && <span className="ml-1 opacity-60">(v6)</span>}
                                        </Badge>
                                    </div>

                                    <div className="flex justify-between mt-2 text-muted-foreground text-[10px]">
                                        <span>Rule ID: {rule.id}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Add Rule Dialog */}
            <Dialog open={showModal} onOpenChange={setShowModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Firewall Rule</DialogTitle>
                    </DialogHeader>
                    <p className="text-muted-foreground text-sm">Create a new rule for incoming traffic.</p>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Port / App</Label>
                            <Input className="font-mono" value={toPort} onChange={e => setToPort(e.target.value)} placeholder="80, 443, ssh" />
                        </div>
                        <div className="grid gap-2">
                            <Label>Protocol</Label>
                            <Select value={proto} onValueChange={setProto}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="tcp">TCP</SelectItem>
                                    <SelectItem value="udp">UDP</SelectItem>
                                    <SelectItem value="any">Any</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>Action</Label>
                            <Select value={action} onValueChange={setAction}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="allow">ALLOW</SelectItem>
                                    <SelectItem value="deny">DENY</SelectItem>
                                    <SelectItem value="reject">REJECT</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>From IP</Label>
                            <Input className="font-mono" value={fromIp} onChange={e => setFromIp(e.target.value)} placeholder="any, 192.168.1.5" />
                        </div>

                        {(toPort === "22" || toPort === "ssh") && action === "deny" && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Warning</AlertTitle>
                                <AlertDescription>Denying SSH access may lock you out of the server immediately.</AlertDescription>
                            </Alert>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
                        <Button className="gap-2" onClick={handleAddRule} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            Add Rule
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Firewall Rule</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this rule? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteTarget !== null) handleDeleteRule(deleteTarget); }}>
                            Delete Rule
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DashboardLayout>
    );
}
