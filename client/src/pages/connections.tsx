import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
    getConnections, createConnection, deleteConnection,
    testConnection, activateConnection, deactivateConnections,
    type ConnectionData, type TestConnectionResult,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Server, Plus, Trash2, Zap, ZapOff, TestTube, Loader2, Wifi, WifiOff, Terminal, FolderOpen, ArrowRight } from "lucide-react";

export default function ConnectionsPage() {
    const [connections, setConnections] = useState<ConnectionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [testing, setTesting] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
    const [activating, setActivating] = useState<string | null>(null);
    const { toast } = useToast();
    const { isAdmin } = useAuth();

    // Form state
    const [name, setName] = useState("");
    const [host, setHost] = useState("");
    const [port, setPort] = useState("22");
    const [username, setUsername] = useState("root");
    const [password, setPassword] = useState("");
    const [confDir, setConfDir] = useState("");
    const [zoneDir, setZoneDir] = useState("");
    const [creating, setCreating] = useState(false);

    const fetchConnections = async () => {
        try {
            const data = await getConnections();
            setConnections(data);
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchConnections(); }, []);

    const handleCreate = async () => {
        if (!name.trim() || !host.trim() || !username.trim()) {
            toast({ title: "Error", description: "Name, host and username are required", variant: "destructive" });
            return;
        }
        setCreating(true);
        try {
            await createConnection({
                name: name.trim(),
                host: host.trim(),
                port: parseInt(port) || 22,
                username: username.trim(),
                authType: "password",
                password: password,
                bind9ConfDir: confDir.trim() || undefined,
                bind9ZoneDir: zoneDir.trim() || undefined,
            });
            toast({ title: "Connection created" });
            setDialogOpen(false);
            setName(""); setHost(""); setPort("22"); setUsername("root"); setPassword(""); setConfDir(""); setZoneDir("");
            fetchConnections();
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setCreating(false);
        }
    };

    const handleTest = async (id: string) => {
        setTesting(id);
        setTestResult(null);
        try {
            const result = await testConnection(id);
            setTestResult(result);
            toast({
                title: result.success ? "Connection successful" : "Connection failed",
                description: result.message,
                variant: result.success ? "default" : "destructive",
            });
            fetchConnections();
        } catch (e: any) {
            toast({ title: "Test failed", description: e.message, variant: "destructive" });
        } finally {
            setTesting(null);
        }
    };

    const handleActivate = async (id: string) => {
        setActivating(id);
        try {
            await activateConnection(id);
            toast({ title: "Connection activated", description: "Switched to SSH mode" });
            fetchConnections();
        } catch (e: any) {
            toast({ title: "Activation failed", description: e.message, variant: "destructive" });
        } finally {
            setActivating(null);
        }
    };

    const handleDeactivate = async () => {
        try {
            await deactivateConnections();
            toast({ title: "Disconnected", description: "Switched to local mode" });
            fetchConnections();
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this connection?")) return;
        try {
            await deleteConnection(id);
            toast({ title: "Connection deleted" });
            fetchConnections();
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        }
    };

    const activeConn = connections.find(c => c.isActive);

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center h-[50vh]">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">SSH Connections</h1>
                        <p className="text-muted-foreground mt-1">Manage remote BIND9 servers securely.</p>
                    </div>
                    {isAdmin && (
                        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="shadow-[0_0_15px_rgba(0,240,255,0.3)]">
                                    <Plus className="h-4 w-4 mr-2" /> Add Connection
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[450px] border-primary/20 bg-card/95 backdrop-blur-xl">
                                <DialogHeader>
                                    <DialogTitle>New SSH Connection</DialogTitle>
                                    <DialogDescription>Enter the details of the remote BIND9 server.</DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label className="text-right">Name</Label>
                                        <Input
                                            value={name} onChange={e => setName(e.target.value)}
                                            placeholder="e.g. Production DNS"
                                            className="col-span-3"
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label className="text-right">Host</Label>
                                        <Input
                                            value={host} onChange={e => setHost(e.target.value)}
                                            placeholder="IP or Hostname"
                                            className="col-span-3 font-mono"
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label className="text-right">Port</Label>
                                        <Input
                                            value={port} onChange={e => setPort(e.target.value)}
                                            placeholder="22"
                                            className="col-span-3 font-mono"
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label className="text-right">User</Label>
                                        <Input
                                            value={username} onChange={e => setUsername(e.target.value)}
                                            placeholder="root"
                                            className="col-span-3 font-mono"
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label className="text-right">Password</Label>
                                        <Input
                                            value={password} onChange={e => setPassword(e.target.value)}
                                            type="password"
                                            placeholder="SSH Password"
                                            className="col-span-3 font-mono"
                                        />
                                    </div>

                                    <div className="my-2 border-t border-border/50"></div>
                                    <p className="text-xs text-muted-foreground text-center">Optional: Override default paths if auto-detection fails</p>

                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label className="text-right text-xs">Config Dir</Label>
                                        <Input
                                            value={confDir} onChange={e => setConfDir(e.target.value)}
                                            placeholder="/etc/bind"
                                            className="col-span-3 font-mono text-xs h-8"
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label className="text-right text-xs">Zone Dir</Label>
                                        <Input
                                            value={zoneDir} onChange={e => setZoneDir(e.target.value)}
                                            placeholder="/var/cache/bind"
                                            className="col-span-3 font-mono text-xs h-8"
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button onClick={handleCreate} disabled={creating}>
                                        {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                        Create Connection
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>

                {/* Status Banner */}
                <Card className={`glass-panel border-l-4 ${activeConn ? "border-l-green-500 bg-green-500/5" : "border-l-yellow-500 bg-yellow-500/5"}`}>
                    <CardContent className="flex items-center gap-4 py-6">
                        <div className={`p-3 rounded-full ${activeConn ? "bg-green-500/10" : "bg-yellow-500/10"}`}>
                            {activeConn ? <Wifi className="h-6 w-6 text-green-500" /> : <WifiOff className="h-6 w-6 text-yellow-500" />}
                        </div>
                        <div className="flex-1">
                            <h2 className="text-lg font-semibold tracking-tight">
                                {activeConn ? `Connected to ${activeConn.name}` : "Local Mode Active"}
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                {activeConn
                                    ? `Managing remote BIND9 server at ${activeConn.host}`
                                    : "You are managing the local BIND9 instance on this machine."}
                            </p>
                        </div>
                        {activeConn && isAdmin && (
                            <Button variant="outline" onClick={handleDeactivate} className="border-red-500/20 hover:bg-red-500/10 hover:text-red-500">
                                <ZapOff className="h-4 w-4 mr-2" /> Disconnect
                            </Button>
                        )}
                    </CardContent>
                </Card>

                {/* Connections Grid */}
                <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Server className="w-5 h-5 text-primary" />
                        Available Connections
                    </h3>

                    {connections.length === 0 ? (
                        <Card className="glass-panel border-dashed border-2 border-primary/20 bg-muted/5">
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                                <Server className="h-12 w-12 mb-4 opacity-20" />
                                <h3 className="text-lg font-semibold">No Connections Configured</h3>
                                <p className="max-w-sm mt-2 mb-6">Add a remote SSH connection to manage another BIND9 server from this panel.</p>
                                <Button variant="outline" onClick={() => setDialogOpen(true)}>Add First Connection</Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {connections.map((conn) => (
                                <Card key={conn.id} className={`glass-panel group transition-all duration-300 ${conn.isActive ? "border-green-500/40 shadow-[0_0_15px_rgba(34,197,94,0.1)]" : "hover:border-primary/40"}`}>
                                    <CardContent className="p-5">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${conn.isActive ? "bg-green-500/10 text-green-500" : "bg-primary/10 text-primary"}`}>
                                                    <Terminal className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-lg leading-none">{conn.name}</h3>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Badge variant={conn.isActive ? "default" : "outline"} className={conn.isActive ? "bg-green-500 hover:bg-green-600" : "text-muted-foreground font-normal"}>
                                                            {conn.isActive ? "Active" : "Idle"}
                                                        </Badge>
                                                        {conn.lastStatus === "failed" && <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">Error</Badge>}
                                                    </div>
                                                </div>
                                            </div>
                                            {isAdmin && (
                                                <Button
                                                    variant="ghost" size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mt-1 -mr-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => handleDelete(conn.id)}
                                                    disabled={conn.isActive}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>

                                        <div className="space-y-2 mb-4">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">Host:</span>
                                                <span className="font-mono bg-muted/50 px-1 rounded">{conn.host}:{conn.port}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">User:</span>
                                                <span className="font-mono bg-muted/50 px-1 rounded">{conn.username}</span>
                                            </div>
                                        </div>

                                        {(conn.bind9ConfDir || conn.bind9ZoneDir) && (
                                            <div className="mb-4 pt-3 border-t border-border/40">
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                                                    <FolderOpen className="h-3 w-3" />
                                                    <span>Detected Paths</span>
                                                </div>
                                                <div className="grid gap-1">
                                                    {conn.bind9ConfDir && <div className="text-[10px] font-mono truncate" title={conn.bind9ConfDir}>{conn.bind9ConfDir}</div>}
                                                    {conn.bind9ZoneDir && <div className="text-[10px] font-mono truncate" title={conn.bind9ZoneDir}>{conn.bind9ZoneDir}</div>}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex gap-2 mt-4">
                                            {isAdmin && (
                                                <>
                                                    <Button
                                                        variant="outline" size="sm" className="flex-1"
                                                        onClick={() => handleTest(conn.id)}
                                                        disabled={testing === conn.id}
                                                    >
                                                        {testing === conn.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <TestTube className="h-3 w-3 mr-1" />}
                                                        Test
                                                    </Button>
                                                    {!conn.isActive && (
                                                        <Button
                                                            size="sm" className="flex-1"
                                                            onClick={() => handleActivate(conn.id)}
                                                            disabled={activating === conn.id}
                                                        >
                                                            {activating === conn.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                                                            Connect
                                                        </Button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                {/* Detailed Test Result */}
                {testResult && (
                    <Dialog open={!!testResult} onOpenChange={(open) => !open && setTestResult(null)}>
                        <DialogContent className={`${testResult.success ? "border-green-500/50" : "border-red-500/50"} glass-panel`}>
                            <DialogHeader>
                                <DialogTitle className={testResult.success ? "text-green-500" : "text-red-500"}>
                                    {testResult.success ? "Connection Successful" : "Connection Failed"}
                                </DialogTitle>
                                <DialogDescription>
                                    Result of the connection test to remote server.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                                <p className="mb-4">{testResult.message}</p>
                                {testResult.serverInfo && (
                                    <div className="bg-muted/30 p-3 rounded-md space-y-2 text-sm">
                                        <div className="flex justify-between"><span>Hostname:</span> <span className="font-mono">{testResult.serverInfo.hostname}</span></div>
                                        <div className="flex justify-between"><span>OS:</span> <span className="font-mono">{testResult.serverInfo.os}</span></div>
                                        <div className="flex justify-between"><span>BIND Version:</span> <span className="font-mono">{testResult.serverInfo.bind9Version}</span></div>
                                        <div className="flex justify-between"><span>Service Status:</span> <span className="font-mono">{testResult.serverInfo.bind9Running ? "Running" : "Stopped"}</span></div>
                                        <div className="border-t border-border/30 my-2"></div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-muted-foreground text-xs">Config Directory:</span>
                                            <span className="font-mono text-xs break-all">{testResult.serverInfo.confDir}</span>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-muted-foreground text-xs">Zone Directory:</span>
                                            <span className="font-mono text-xs break-all">{testResult.serverInfo.zoneDir}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button onClick={() => setTestResult(null)}>Close</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </div>
        </DashboardLayout>
    );
}
