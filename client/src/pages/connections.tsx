import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
    getConnections, createConnection, deleteConnection,
    testConnection, activateConnection, deactivateConnections,
    type ConnectionData, type TestConnectionResult,
} from "@/lib/api";
import { Server, Plus, Trash2, Zap, ZapOff, TestTube, Wifi, WifiOff, Loader2 } from "lucide-react";

export default function ConnectionsPage() {
    const [connections, setConnections] = useState<ConnectionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [testing, setTesting] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
    const [activating, setActivating] = useState<string | null>(null);
    const { toast } = useToast();

    // Form state
    const [name, setName] = useState("");
    const [host, setHost] = useState("");
    const [port, setPort] = useState("22");
    const [username, setUsername] = useState("root");
    const [password, setPassword] = useState("");
    const [confDir, setConfDir] = useState("");
    const [zoneDir, setZoneDir] = useState("");

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
            setShowForm(false);
            setName(""); setHost(""); setPort("22"); setUsername("root"); setPassword(""); setConfDir(""); setZoneDir("");
            fetchConnections();
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
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
            fetchConnections(); // Refresh to get updated paths
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
            <div className="flex items-center justify-center h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">SSH Connections</h1>
                    <p className="text-muted-foreground">Connect to a remote BIND9 server via SSH</p>
                </div>
                <Button onClick={() => setShowForm(!showForm)}>
                    <Plus className="h-4 w-4 mr-2" /> Add Connection
                </Button>
            </div>

            {/* Active connection indicator */}
            <Card className={activeConn ? "border-green-500/50 bg-green-500/5" : "border-yellow-500/50 bg-yellow-500/5"}>
                <CardContent className="flex items-center gap-3 py-4">
                    {activeConn ? (
                        <>
                            <Wifi className="h-5 w-5 text-green-500" />
                            <div className="flex-1">
                                <span className="font-medium text-green-700 dark:text-green-400">
                                    SSH Mode — Connected to {activeConn.name}
                                </span>
                                <span className="text-sm text-muted-foreground ml-2">
                                    ({activeConn.host}:{activeConn.port})
                                </span>
                            </div>
                            <Button variant="outline" size="sm" onClick={handleDeactivate}>
                                <ZapOff className="h-4 w-4 mr-1" /> Disconnect
                            </Button>
                        </>
                    ) : (
                        <>
                            <WifiOff className="h-5 w-5 text-yellow-500" />
                            <span className="font-medium text-yellow-700 dark:text-yellow-400">
                                Local Mode — No remote connection active
                            </span>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* New Connection Form */}
            {showForm && (
                <Card>
                    <CardHeader>
                        <CardTitle>New SSH Connection</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Connection Name</Label>
                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="My BIND9 VM" />
                            </div>
                            <div className="space-y-2">
                                <Label>Host / IP</Label>
                                <Input value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.100" />
                            </div>
                            <div className="space-y-2">
                                <Label>SSH Port</Label>
                                <Input value={port} onChange={e => setPort(e.target.value)} placeholder="22" type="number" />
                            </div>
                            <div className="space-y-2">
                                <Label>Username</Label>
                                <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="root" />
                            </div>
                            <div className="col-span-2 space-y-2">
                                <Label>Password</Label>
                                <Input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="SSH password" />
                            </div>
                        </div>
                        <div className="border-t pt-4">
                            <p className="text-sm text-muted-foreground mb-3">
                                BIND9 paths — leave blank for auto-detection
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Config Directory</Label>
                                    <Input value={confDir} onChange={e => setConfDir(e.target.value)} placeholder="/etc/bind (auto-detect)" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Zone Directory</Label>
                                    <Input value={zoneDir} onChange={e => setZoneDir(e.target.value)} placeholder="/var/cache/bind (auto-detect)" />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                            <Button onClick={handleCreate}>
                                <Plus className="h-4 w-4 mr-2" /> Create
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Connection list */}
            {connections.length === 0 && !showForm && (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <Server className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-2">No connections configured</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Add a SSH connection to manage a remote BIND9 server
                        </p>
                        <Button onClick={() => setShowForm(true)}>
                            <Plus className="h-4 w-4 mr-2" /> Add Connection
                        </Button>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4">
                {connections.map(conn => (
                    <Card key={conn.id} className={conn.isActive ? "border-green-500/50" : ""}>
                        <CardContent className="flex items-center gap-4 py-4">
                            {/* Status dot */}
                            <div className={`h-3 w-3 rounded-full flex-shrink-0 ${conn.lastStatus === "connected" ? "bg-green-500" :
                                    conn.lastStatus === "failed" ? "bg-red-500" : "bg-yellow-500"
                                }`} />

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{conn.name}</span>
                                    {conn.isActive && (
                                        <span className="text-xs bg-green-500/20 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
                                            ACTIVE
                                        </span>
                                    )}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    {conn.username}@{conn.host}:{conn.port}
                                </div>
                                {(conn.bind9ConfDir || conn.bind9ZoneDir) && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                        {conn.bind9ConfDir && <span>conf: {conn.bind9ConfDir}</span>}
                                        {conn.bind9ConfDir && conn.bind9ZoneDir && <span className="mx-2">|</span>}
                                        {conn.bind9ZoneDir && <span>zones: {conn.bind9ZoneDir}</span>}
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 flex-shrink-0">
                                <Button
                                    variant="outline" size="sm"
                                    onClick={() => handleTest(conn.id)}
                                    disabled={testing === conn.id}
                                >
                                    {testing === conn.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <TestTube className="h-4 w-4" />
                                    )}
                                    <span className="ml-1">Test</span>
                                </Button>

                                {!conn.isActive ? (
                                    <Button
                                        variant="default" size="sm"
                                        onClick={() => handleActivate(conn.id)}
                                        disabled={activating === conn.id}
                                    >
                                        {activating === conn.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Zap className="h-4 w-4" />
                                        )}
                                        <span className="ml-1">Activate</span>
                                    </Button>
                                ) : (
                                    <Button variant="outline" size="sm" onClick={handleDeactivate}>
                                        <ZapOff className="h-4 w-4 mr-1" /> Disconnect
                                    </Button>
                                )}

                                <Button
                                    variant="ghost" size="sm"
                                    onClick={() => handleDelete(conn.id)}
                                    disabled={conn.isActive}
                                >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Test result */}
            {testResult && (
                <Card className={testResult.success ? "border-green-500/50" : "border-red-500/50"}>
                    <CardHeader>
                        <CardTitle className="text-sm">
                            {testResult.success ? "✅ Connection Test Passed" : "❌ Connection Test Failed"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-3">{testResult.message}</p>
                        {testResult.serverInfo && (
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div><strong>Hostname:</strong> {testResult.serverInfo.hostname}</div>
                                <div><strong>OS:</strong> {testResult.serverInfo.os}</div>
                                <div><strong>BIND9:</strong> {testResult.serverInfo.bind9Version}</div>
                                <div><strong>Running:</strong> {testResult.serverInfo.bind9Running ? "Yes ✅" : "No ❌"}</div>
                                <div><strong>Config Dir:</strong> {testResult.serverInfo.confDir}</div>
                                <div><strong>Zone Dir:</strong> {testResult.serverInfo.zoneDir}</div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
