import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
    getConnections, createConnection, deleteConnection,
    testConnection, activateConnection, deactivateConnections,
    type ConnectionData, type TestConnectionResult,
} from "@/lib/api";
import { Server, Plus, Trash2, Zap, ZapOff, TestTube, Loader2, Wifi, WifiOff, Terminal, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function ConnectionsPage() {
    const [connections, setConnections] = useState<ConnectionData[]>([]);
    const [poolStatus, setPoolStatus] = useState<Record<string, { isConnected: boolean }>>({});
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [testing, setTesting] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
    const [activating, setActivating] = useState<string | null>(null);
    const { toast } = useToast();
    const { isAdmin } = useAuth();

    const [name, setName] = useState("");
    const [host, setHost] = useState("");
    const [port, setPort] = useState("22");
    const [username, setUsername] = useState("root");
    const [password, setPassword] = useState("");
    const [confDir, setConfDir] = useState("");
    const [zoneDir, setZoneDir] = useState("");
    const [creating, setCreating] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    const fetchConnections = async () => {
        try {
            const data = await getConnections();
            setConnections(data);
            // Also fetch pool status for connected indicators
            try {
                const pool = await fetch("/api/connections/pool/status").then(r => r.json());
                const statusMap: Record<string, { isConnected: boolean }> = {};
                for (const c of pool.connections || []) {
                    statusMap[c.id] = { isConnected: c.isConnected };
                }
                setPoolStatus(statusMap);
            } catch {}
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
                name: name.trim(), host: host.trim(), port: parseInt(port) || 22,
                username: username.trim(), authType: "password", password: password,
                bind9ConfDir: confDir.trim() || undefined, bind9ZoneDir: zoneDir.trim() || undefined,
            });
            toast({ title: "Connection created" });
            setShowModal(false);
            setName(""); setHost(""); setPort("22"); setUsername("root"); setPassword(""); setConfDir(""); setZoneDir("");
            fetchConnections();
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setCreating(false);
        }
    };

    const handleTest = async (id: string) => {
        setTesting(id); setTestResult(null);
        try { const r = await testConnection(id); setTestResult(r); fetchConnections(); }
        catch (e: any) { toast({ title: "Test failed", description: e.message, variant: "destructive" }); }
        finally { setTesting(null); }
    };

    const handleActivate = async (id: string) => {
        setActivating(id);
        try { await activateConnection(id); toast({ title: "Connection activated", description: "Switched to SSH mode" }); fetchConnections(); }
        catch (e: any) { toast({ title: "Activation failed", description: e.message, variant: "destructive" }); }
        finally { setActivating(null); }
    };

    const handleDeactivate = async () => {
        try { await deactivateConnections(); toast({ title: "Disconnected", description: "Switched to local mode" }); fetchConnections(); }
        catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    };

    const handleDelete = async (id: string) => {
        try { await deleteConnection(id); toast({ title: "Connection deleted" }); setDeleteTarget(null); fetchConnections(); }
        catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    };

    const activeConn = connections.find(c => c.isActive);

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center" style={{ height: "60vh" }}>
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">SSH Connections</h2>
                    <p className="text-muted-foreground">Manage remote BIND9 servers securely.</p>
                </div>
                {isAdmin && (
                    <Button className="gap-2" onClick={() => setShowModal(true)}>
                        <Plus className="h-4 w-4" /> Add Connection
                    </Button>
                )}
            </div>

            {/* Status Banner */}
            <Card className={`mb-6 border-l-4 ${activeConn ? "border-green-500" : "border-yellow-500"}`}>
                <CardContent className="flex items-center gap-3 py-5">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full shrink-0 ${activeConn ? "bg-green-500/10 text-green-600" : "bg-yellow-500/10 text-yellow-600"}`}>
                        {activeConn ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
                    </div>
                    <div className="flex-1">
                        <h5 className="mb-1 font-semibold">
                            {activeConn ? `Active: ${activeConn.name}` : "Local Mode Active"}
                        </h5>
                        <p className="text-muted-foreground mb-0 text-sm">
                            {activeConn
                              ? `Managing ${activeConn.host} — ${connections.filter(c => poolStatus[c.id]?.isConnected && c.id !== activeConn.id).length} other connection(s) in pool`
                              : "You are managing the local BIND9 instance on this machine."}
                        </p>
                    </div>
                    {activeConn && isAdmin && (
                        <Button variant="outline" size="sm" className="gap-2" onClick={handleDeactivate}>
                            <ZapOff className="h-3.5 w-3.5" /> Switch to Local
                        </Button>
                    )}
                </CardContent>
            </Card>

            <h5 className="flex items-center gap-2 mb-4 font-semibold">
                <Server className="h-4 w-4 text-primary" /> Available Connections
                <span className="text-muted-foreground font-normal text-sm">({connections.filter(c => poolStatus[c.id]?.isConnected).length} connected)</span>
            </h5>

            {connections.length === 0 ? (
                <Card className="border-dashed text-center py-8">
                    <CardContent>
                        <Server className="h-10 w-10 text-muted-foreground/25 mb-3 mx-auto" />
                        <h5 className="font-semibold">No Connections Configured</h5>
                        <p className="text-muted-foreground mb-4">Add a remote SSH connection to manage another BIND9 server.</p>
                        <Button variant="outline" onClick={() => setShowModal(true)}>Add First Connection</Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {connections.map((conn) => (
                        <Card key={conn.id} className={conn.isActive ? "border-green-500" : poolStatus[conn.id]?.isConnected ? "border-blue-400" : ""}>
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${conn.isActive ? "bg-green-500/10 text-green-600" : poolStatus[conn.id]?.isConnected ? "bg-blue-500/10 text-blue-600" : "bg-primary/10 text-primary"}`}>
                                            <Terminal className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="font-bold">{conn.name}</div>
                                            <div>
                                                <Badge variant={conn.isActive ? "default" : poolStatus[conn.id]?.isConnected ? "outline" : "secondary"}>
                                                    {conn.isActive ? "Active" : poolStatus[conn.id]?.isConnected ? "Connected" : "Idle"}
                                                </Badge>
                                                {conn.lastStatus === "failed" && !poolStatus[conn.id]?.isConnected && (
                                                    <Badge variant="destructive" className="ml-1">Error</Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {isAdmin && (
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(conn.id)} disabled={conn.isActive}>
                                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                    )}
                                </div>

                                <div className="flex flex-col gap-1 mb-3 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Host:</span>
                                        <code className="rounded bg-muted px-1">{conn.host}:{conn.port}</code>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">User:</span>
                                        <code className="rounded bg-muted px-1">{conn.username}</code>
                                    </div>
                                </div>

                                {(conn.bind9ConfDir || conn.bind9ZoneDir) && (
                                    <div className="border-t pt-2 mb-3">
                                        <div className="flex items-center gap-1 text-muted-foreground mb-1 text-xs">
                                            <FolderOpen className="h-3 w-3" /> Detected Paths
                                        </div>
                                        {conn.bind9ConfDir && <div className="font-mono truncate text-xs">{conn.bind9ConfDir}</div>}
                                        {conn.bind9ZoneDir && <div className="font-mono truncate text-xs">{conn.bind9ZoneDir}</div>}
                                    </div>
                                )}

                                {isAdmin && (
                                    <div className="flex gap-2 mt-auto">
                                        <Button variant="outline" size="sm" className="flex-1" onClick={() => handleTest(conn.id)} disabled={testing === conn.id}>
                                            {testing === conn.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <TestTube className="h-3 w-3 mr-1" />}
                                            Test
                                        </Button>
                                        {!conn.isActive && (
                                            <Button size="sm" className="flex-1" onClick={() => handleActivate(conn.id)} disabled={activating === conn.id}>
                                                {activating === conn.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                                                Connect
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create Connection Dialog */}
            <Dialog open={showModal} onOpenChange={setShowModal}>
                <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>New SSH Connection</DialogTitle>
                    </DialogHeader>
                    <p className="text-muted-foreground text-sm">Enter the details of the remote BIND9 server.</p>
                    <div className="grid gap-4 py-4 overflow-y-auto flex-1 min-h-0">
                        {[
                            { label: "Name", value: name, setter: setName, placeholder: "e.g. Production DNS", mono: false },
                            { label: "Host", value: host, setter: setHost, placeholder: "IP or Hostname", mono: true },
                            { label: "Port", value: port, setter: setPort, placeholder: "22", mono: true },
                            { label: "User", value: username, setter: setUsername, placeholder: "root", mono: true },
                        ].map(({ label, value, setter, placeholder, mono }) => (
                            <div key={label} className="grid gap-2">
                                <Label>{label}</Label>
                                <Input className={mono ? "font-mono" : ""} value={value} onChange={e => setter(e.target.value)} placeholder={placeholder} />
                            </div>
                        ))}
                        <div className="grid gap-2">
                            <Label>Password</Label>
                            <Input type="password" className="font-mono" value={password} onChange={e => setPassword(e.target.value)} placeholder="SSH Password" />
                        </div>
                        <div className="border-t pt-4">
                            <p className="text-muted-foreground text-center mb-3 text-xs">Optional: Override default paths if auto-detection fails</p>
                            <div className="grid gap-3">
                                <div className="grid gap-2">
                                    <Label className="text-sm">Config Dir</Label>
                                    <Input className="font-mono h-8 text-sm" value={confDir} onChange={e => setConfDir(e.target.value)} placeholder="/etc/bind" />
                                </div>
                                <div className="grid gap-2">
                                    <Label className="text-sm">Zone Dir</Label>
                                    <Input className="font-mono h-8 text-sm" value={zoneDir} onChange={e => setZoneDir(e.target.value)} placeholder="/var/cache/bind" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
                        <Button className="gap-2" onClick={handleCreate} disabled={creating}>
                            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                            Create Connection
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Test Result Dialog */}
            <Dialog open={!!testResult} onOpenChange={(open) => { if (!open) setTestResult(null); }}>
                <DialogContent className={testResult?.success ? "border-green-500" : "border-red-500"}>
                    <DialogHeader>
                        <DialogTitle className={testResult?.success ? "text-green-600" : "text-red-600"}>
                            {testResult?.success ? "Connection Successful" : "Connection Failed"}
                        </DialogTitle>
                    </DialogHeader>
                    <p className="mb-3">{testResult?.message}</p>
                    {testResult?.serverInfo && (
                        <div className="rounded-md bg-muted/50 p-3 text-sm">
                            {[
                                ["Hostname", testResult.serverInfo.hostname],
                                ["OS", testResult.serverInfo.os],
                                ["BIND Version", testResult.serverInfo.bind9Version],
                                ["Service Status", testResult.serverInfo.bind9Running ? "Running" : "Stopped"],
                            ].map(([k, v]) => (
                                <div key={k} className="flex justify-between mb-1">
                                    <span className="text-muted-foreground">{k}:</span>
                                    <code>{String(v)}</code>
                                </div>
                            ))}
                            <div className="border-t my-2" />
                            <div className="mb-1 text-muted-foreground text-xs">Config Dir:</div>
                            <code className="block break-all mb-2 text-xs">{testResult.serverInfo.confDir}</code>
                            <div className="mb-1 text-muted-foreground text-xs">Zone Dir:</div>
                            <code className="block break-all text-xs">{testResult.serverInfo.zoneDir}</code>
                        </div>
                    )}
                    <DialogFooter>
                        <Button onClick={() => setTestResult(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Connection</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this connection? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteTarget) handleDelete(deleteTarget); }}>
                            Delete Connection
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DashboardLayout>
    );
}
