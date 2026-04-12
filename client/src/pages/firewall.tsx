import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
    getFirewallStatus, toggleFirewall, addFirewallRule, deleteFirewallRule,
    switchFirewallBackend,
    type FirewallStatus, type FirewallBackend, type RuleType, type RuleDirection,
    type AddFirewallRuleData
} from "@/lib/api";
import { Shield, ShieldAlert, ShieldCheck, Plus, Trash2, Loader2, AlertTriangle, ArrowRight, ArrowLeft, Activity, Ban, CheckCircle2, Network, Zap, FileCode, Radio, MessageSquare } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

const KNOWN_SERVICES = [
    { value: "ssh", label: "SSH", port: "22", proto: "tcp" },
    { value: "http", label: "HTTP", port: "80", proto: "tcp" },
    { value: "https", label: "HTTPS", port: "443", proto: "tcp" },
    { value: "dns", label: "DNS", port: "53", proto: "any" },
    { value: "ftp", label: "FTP", port: "21", proto: "tcp" },
    { value: "smtp", label: "SMTP", port: "25", proto: "tcp" },
    { value: "smtps", label: "SMTPS", port: "465", proto: "tcp" },
    { value: "imap", label: "IMAP", port: "143", proto: "tcp" },
    { value: "imaps", label: "IMAPS", port: "993", proto: "tcp" },
    { value: "pop3", label: "POP3", port: "110", proto: "tcp" },
    { value: "pop3s", label: "POP3S", port: "995", proto: "tcp" },
    { value: "mysql", label: "MySQL", port: "3306", proto: "tcp" },
    { value: "postgresql", label: "PostgreSQL", port: "5432", proto: "tcp" },
    { value: "redis", label: "Redis", port: "6379", proto: "tcp" },
    { value: "mongodb", label: "MongoDB", port: "27017", proto: "tcp" },
    { value: "nfs", label: "NFS", port: "2049", proto: "tcp" },
    { value: "samba", label: "Samba", port: "139", proto: "tcp" },
    { value: "ntp", label: "NTP", port: "123", proto: "udp" },
    { value: "syslog", label: "Syslog", port: "514", proto: "udp" },
    { value: "snmp", label: "SNMP", port: "161", proto: "udp" },
    { value: "rsync", label: "Rsync", port: "873", proto: "tcp" },
    { value: "vnc", label: "VNC", port: "5900", proto: "tcp" },
    { value: "rdp", label: "RDP", port: "3389", proto: "tcp" },
    { value: "openvpn", label: "OpenVPN", port: "1194", proto: "udp" },
    { value: "wireguard", label: "WireGuard", port: "51820", proto: "udp" },
];

const ICMP_TYPES = [
    { value: "echo-request", label: "Echo Request (Ping)" },
    { value: "echo-reply", label: "Echo Reply" },
    { value: "destination-unreachable", label: "Destination Unreachable" },
    { value: "time-exceeded", label: "Time Exceeded" },
    { value: "redirect", label: "Redirect" },
    { value: "router-advertisement", label: "Router Advertisement" },
    { value: "router-solicitation", label: "Router Solicitation" },
    { value: "parameter-problem", label: "Parameter Problem" },
    { value: "timestamp-request", label: "Timestamp Request" },
    { value: "timestamp-reply", label: "Timestamp Reply" },
];

const RATE_LIMIT_PRESETS = [
    { value: "3/min", label: "3/min (Strict)" },
    { value: "6/min", label: "6/min (Moderate)" },
    { value: "10/min", label: "10/min (Lenient)" },
    { value: "30/min", label: "30/min (Permissive)" },
    { value: "100/hour", label: "100/hour" },
];

const RULE_TYPE_CONFIG: { value: RuleType; label: string; icon: any; desc: string }[] = [
    { value: "port", label: "Port", icon: Network, desc: "Single port rule" },
    { value: "service", label: "Service", icon: Zap, desc: "Predefined service" },
    { value: "portRange", label: "Port Range", icon: Activity, desc: "Range of ports" },
    { value: "multiPort", label: "Multi-Port", icon: Radio, desc: "Multiple ports" },
    { value: "icmp", label: "ICMP", icon: MessageSquare, desc: "ICMP protocol" },
    { value: "raw", label: "Raw Rule", icon: FileCode, desc: "Custom command" },
];

function ruleTypeLabel(rt: string): string {
    return RULE_TYPE_CONFIG.find(c => c.value === rt)?.label || rt;
}

export default function FirewallPage() {
    const [status, setStatus] = useState<FirewallStatus>({ active: false, rules: [], installed: true, backend: "none", availableBackends: [] });
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(false);
    const [showModal, setShowModal] = useState(false);

    // Form state
    const [ruleType, setRuleType] = useState<RuleType>("port");
    const [toPort, setToPort] = useState("");
    const [toPortEnd, setToPortEnd] = useState("");
    const [proto, setProto] = useState("tcp");
    const [action, setAction] = useState("allow");
    const [fromIp, setFromIp] = useState("any");
    const [direction, setDirection] = useState<RuleDirection>("in");
    const [service, setService] = useState("");
    const [iface, setIface] = useState("");
    const [rateLimit, setRateLimit] = useState("");
    const [icmpType, setIcmpType] = useState("echo-request");
    const [logEnabled, setLogEnabled] = useState(false);
    const [comment, setComment] = useState("");
    const [rawRule, setRawRule] = useState("");
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

    const { toast } = useToast();
    const { isAdmin } = useAuth();

    const resetForm = () => {
        setRuleType("port"); setToPort(""); setToPortEnd(""); setProto("tcp");
        setAction("allow"); setFromIp("any"); setDirection("in"); setService("");
        setIface(""); setRateLimit(""); setIcmpType("echo-request"); setLogEnabled(false);
        setComment(""); setRawRule("");
    };

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
                description: checked ? "System is now protected." : "System is exposed."
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
        // Validate based on rule type
        if (ruleType === "port" && !toPort) {
            toast({ title: "Error", description: "Port number is required", variant: "destructive" }); return;
        }
        if (ruleType === "service" && !service) {
            toast({ title: "Error", description: "Service is required", variant: "destructive" }); return;
        }
        if (ruleType === "portRange" && (!toPort || !toPortEnd)) {
            toast({ title: "Error", description: "Start and end port are required", variant: "destructive" }); return;
        }
        if (ruleType === "multiPort" && !toPort) {
            toast({ title: "Error", description: "Comma-separated ports are required", variant: "destructive" }); return;
        }
        if (ruleType === "raw" && !rawRule) {
            toast({ title: "Error", description: "Raw rule command is required", variant: "destructive" }); return;
        }

        setSaving(true);
        try {
            const data: AddFirewallRuleData = {
                toPort: ruleType === "service" ? (KNOWN_SERVICES.find(s => s.value === service)?.port || toPort) : toPort,
                proto: ruleType === "service" ? (KNOWN_SERVICES.find(s => s.value === service)?.proto || proto) : proto,
                action, fromIp, direction, ruleType,
                toPortEnd: ruleType === "portRange" ? toPortEnd : undefined,
                service: ruleType === "service" ? service : undefined,
                interface: iface || undefined,
                rateLimit: rateLimit && rateLimit !== "_none" ? rateLimit : undefined,
                icmpType: ruleType === "icmp" ? icmpType : undefined,
                log: logEnabled || undefined,
                comment: comment || undefined,
                rawRule: ruleType === "raw" ? rawRule : undefined,
            };
            await addFirewallRule(data);
            toast({ title: "Rule added" });
            setShowModal(false);
            resetForm();
            fetchData();
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
                    <p className="text-muted-foreground">
                        Manage system network security
                        {status.backend !== "none" && (
                            <span className="ml-1">using <Badge variant="secondary" className="font-mono text-xs ml-1">{status.backend.toUpperCase()}</Badge></span>
                        )}
                    </p>
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
                                No firewall backend was found on this system. Install one of the supported backends:
                            </p>
                            <div className="flex flex-wrap gap-2 mb-2">
                                <Badge variant="outline">UFW</Badge>
                                <Badge variant="outline">firewalld</Badge>
                                <Badge variant="outline">nftables</Badge>
                                <Badge variant="outline">iptables</Badge>
                            </div>
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
                                {status.availableBackends.length > 1 && (
                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                        <span className="text-xs text-muted-foreground">Backend:</span>
                                        {status.availableBackends.map(b => (
                                            <Badge
                                                key={b}
                                                variant={b === status.backend ? "default" : "outline"}
                                                className="text-[10px] font-mono cursor-pointer hover:bg-primary/20"
                                                onClick={async () => {
                                                    if (b !== status.backend) {
                                                        try {
                                                            const res = await switchFirewallBackend(b);
                                                            setStatus(res.status);
                                                            toast({ title: `Switched to ${b === "nftables" ? "nft" : b.toUpperCase()}` });
                                                        } catch (e: any) {
                                                            toast({ title: "Error", description: e.message, variant: "destructive" });
                                                        }
                                                    }
                                                }}
                                            >
                                                {b === "nftables" ? "nft" : b.toUpperCase()}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
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
                    <Activity className="h-4 w-4 text-primary" /> {status.active ? "Active Rules" : "Configured Rules"}
                    <Badge variant="secondary" className="font-mono text-xs">{status.rules.length}</Badge>
                </h5>
                <Button className="gap-2" onClick={() => { resetForm(); setShowModal(true); }}>
                    <Plus className="h-4 w-4" /> Add Rule
                </Button>
            </div>

            {status.rules.length === 0 ? (
                <Card className="border-dashed text-center py-8">
                    <CardContent>
                        <Shield className="h-10 w-10 text-muted-foreground/25 mb-3 mx-auto" />
                        <h5 className="font-semibold">No Rules Defined</h5>
                        <p className="text-muted-foreground mb-4">Your firewall policy is empty. Add rules to explicitly allow traffic to your services.</p>
                        <Button variant="outline" onClick={() => { resetForm(); setShowModal(true); }}>Create First Rule</Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {status.rules.map((rule) => {
                        const isAllow = rule.action === "ALLOW" || rule.action === "LIMIT";
                        const isDeny = rule.action === "DENY";
                        const isLimit = rule.action === "LIMIT";

                        return (
                            <Card key={rule.id} className="overflow-hidden">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className={`flex h-9 w-9 items-center justify-center rounded-md ${isAllow ? (isLimit ? "bg-yellow-500/10 text-yellow-600" : "bg-green-500/10 text-green-600") : "bg-red-500/10 text-red-600"}`}>
                                                {isAllow ? (isLimit ? <Zap className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />) : <Ban className="h-4 w-4" />}
                                            </div>
                                            <div>
                                                <code className="font-bold text-base block">
                                                    {rule.ruleType === "service" && rule.service ? rule.service : rule.to}
                                                </code>
                                                <div className="flex items-center gap-1.5">
                                                    <small className="uppercase text-muted-foreground font-semibold text-[10px] tracking-widest">
                                                        {rule.action}
                                                    </small>
                                                    <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                                                        {rule.direction === "out" ? "OUT" : "IN"}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                                                        {ruleTypeLabel(rule.ruleType)}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(rule.id)} title="Delete Rule">
                                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                    </div>

                                    <div className="border-t my-2" />

                                    <div className="space-y-1.5 text-sm">
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-1 text-muted-foreground">
                                                {rule.direction === "out" ? <ArrowLeft className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
                                                From:
                                            </span>
                                            <Badge variant="secondary" className="font-mono text-xs">
                                                {rule.from}
                                                {rule.ipv6 && <span className="ml-1 opacity-60">(v6)</span>}
                                            </Badge>
                                        </div>

                                        {rule.proto && rule.proto !== "any" && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">Protocol:</span>
                                                <span className="font-mono text-xs">{rule.proto.toUpperCase()}</span>
                                            </div>
                                        )}

                                        {rule.interface && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">Interface:</span>
                                                <span className="font-mono text-xs">{rule.interface}</span>
                                            </div>
                                        )}

                                        {rule.rateLimit && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" />Limit:</span>
                                                <span className="font-mono text-xs">{rule.rateLimit}</span>
                                            </div>
                                        )}

                                        {rule.icmpType && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">ICMP:</span>
                                                <span className="font-mono text-xs">{rule.icmpType}</span>
                                            </div>
                                        )}

                                        {rule.log && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">Logging:</span>
                                                <Badge variant="outline" className="text-[9px] px-1 py-0">ON</Badge>
                                            </div>
                                        )}

                                        {rule.comment && (
                                            <div className="mt-1 text-xs text-muted-foreground italic border-t pt-1.5">
                                                "{rule.comment}"
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-between mt-2 text-muted-foreground text-[10px]">
                                        <span>Rule #{rule.id}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Add Rule Dialog */}
            <Dialog open={showModal} onOpenChange={setShowModal}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Add Firewall Rule</DialogTitle>
                    </DialogHeader>

                    {/* Rule Type Selector */}
                    <div className="mb-2">
                        <Label className="mb-2 block">Rule Type</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {RULE_TYPE_CONFIG.map(cfg => (
                                <button
                                    key={cfg.value}
                                    type="button"
                                    onClick={() => {
                                        setRuleType(cfg.value);
                                        if (cfg.value === "icmp") setProto("icmp");
                                        else if (cfg.value === "service") setProto("tcp");
                                        else if (!proto || proto === "icmp") setProto("tcp");
                                    }}
                                    className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs transition-colors ${ruleType === cfg.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50"}`}
                                >
                                    <cfg.icon className="h-4 w-4" />
                                    <span className="font-medium">{cfg.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-4 py-2">
                        {/* Direction */}
                        <div className="grid gap-2">
                            <Label>Direction</Label>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant={direction === "in" ? "default" : "outline"}
                                    size="sm"
                                    className="flex-1 gap-1.5"
                                    onClick={() => setDirection("in")}
                                >
                                    <ArrowRight className="h-3.5 w-3.5" /> Inbound
                                </Button>
                                <Button
                                    type="button"
                                    variant={direction === "out" ? "default" : "outline"}
                                    size="sm"
                                    className="flex-1 gap-1.5"
                                    onClick={() => setDirection("out")}
                                >
                                    <ArrowLeft className="h-3.5 w-3.5" /> Outbound
                                </Button>
                            </div>
                        </div>

                        {/* Action */}
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

                        {/* Port rule fields */}
                        {ruleType === "port" && (
                            <>
                                <div className="grid gap-2">
                                    <Label>Port</Label>
                                    <Input className="font-mono" value={toPort} onChange={e => setToPort(e.target.value)} placeholder="80, 443, 22" />
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
                            </>
                        )}

                        {/* Service rule fields */}
                        {ruleType === "service" && (
                            <div className="grid gap-2">
                                <Label>Service</Label>
                                <Select value={service} onValueChange={(v) => {
                                    setService(v);
                                    const svc = KNOWN_SERVICES.find(s => s.value === v);
                                    if (svc) { setToPort(svc.port); setProto(svc.proto); }
                                }}>
                                    <SelectTrigger><SelectValue placeholder="Select a service..." /></SelectTrigger>
                                    <SelectContent>
                                        {KNOWN_SERVICES.map(s => (
                                            <SelectItem key={s.value} value={s.value}>
                                                {s.label} ({s.port}/{s.proto})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Port range fields */}
                        {ruleType === "portRange" && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="grid gap-2">
                                        <Label>Start Port</Label>
                                        <Input className="font-mono" value={toPort} onChange={e => setToPort(e.target.value)} placeholder="1000" />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>End Port</Label>
                                        <Input className="font-mono" value={toPortEnd} onChange={e => setToPortEnd(e.target.value)} placeholder="2000" />
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Protocol</Label>
                                    <Select value={proto} onValueChange={setProto}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="tcp">TCP</SelectItem>
                                            <SelectItem value="udp">UDP</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}

                        {/* Multi-port fields */}
                        {ruleType === "multiPort" && (
                            <>
                                <div className="grid gap-2">
                                    <Label>Ports (comma-separated)</Label>
                                    <Input className="font-mono" value={toPort} onChange={e => setToPort(e.target.value)} placeholder="80, 443, 8080" />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Protocol</Label>
                                    <Select value={proto} onValueChange={setProto}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="tcp">TCP</SelectItem>
                                            <SelectItem value="udp">UDP</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}

                        {/* ICMP fields */}
                        {ruleType === "icmp" && (
                            <div className="grid gap-2">
                                <Label>ICMP Type</Label>
                                <Select value={icmpType} onValueChange={setIcmpType}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {ICMP_TYPES.map(t => (
                                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Raw rule fields */}
                        {ruleType === "raw" && (
                            <div className="grid gap-2">
                                <Label>Raw Command</Label>
                                <Textarea className="font-mono text-sm" rows={3} value={rawRule} onChange={e => setRawRule(e.target.value)} placeholder="e.g. allow from 192.168.1.0/24 to any port 22 proto tcp" />
                                <p className="text-xs text-muted-foreground">Enter the rule arguments after the firewall command prefix. Use with caution.</p>
                            </div>
                        )}

                        {/* Common fields for all non-raw types */}
                        {ruleType !== "raw" && (
                            <>
                                <div className="grid gap-2">
                                    <Label>From IP / Network</Label>
                                    <Input className="font-mono" value={fromIp} onChange={e => setFromIp(e.target.value)} placeholder="any, 192.168.1.0/24, 10.0.0.5" />
                                </div>

                                <div className="grid gap-2">
                                    <Label>Interface (optional)</Label>
                                    <Input className="font-mono" value={iface} onChange={e => setIface(e.target.value)} placeholder="eth0, wlan0, lo" />
                                </div>

                                {action === "allow" && (
                                    <div className="grid gap-2">
                                        <Label>Rate Limit (optional)</Label>
                                        <Select value={rateLimit} onValueChange={setRateLimit}>
                                            <SelectTrigger><SelectValue placeholder="No limit" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="_none">No limit</SelectItem>
                                                {RATE_LIMIT_PRESETS.map(r => (
                                                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <Checkbox id="log-rule" checked={logEnabled} onCheckedChange={(c) => setLogEnabled(!!c)} />
                                        <Label htmlFor="log-rule" className="text-sm cursor-pointer">Log matches</Label>
                                    </div>
                                </div>

                                <div className="grid gap-2">
                                    <Label>Comment (optional)</Label>
                                    <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Describe this rule..." />
                                </div>
                            </>
                        )}

                        {/* SSH warning */}
                        {((toPort === "22" || service === "ssh") && (action === "deny" || action === "reject")) && (
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
