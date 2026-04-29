import { useEffect, useState } from "react";
import { Plus, Server, Wifi, WifiOff, Zap, ZapOff } from "lucide-react";

import { ConnectionCard } from "@/components/connections/ConnectionCard";
import { ConnectionFormDialog } from "@/components/connections/ConnectionFormDialog";
import { ConnectionTestResultDialog } from "@/components/connections/ConnectionTestResultDialog";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard, PageHeader, PageState } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-provider";
import { validateConnectionForm, type ConnectionFormValues } from "@/lib/client-schemas";
import {
    activateConnection,
    createConnection,
    deactivateConnections,
    deleteConnection,
    getConnectionPoolStatus,
    getConnections,
    testConnection,
    testConnectionInline,
    updateConnection,
    type ConnectionData,
    type ConnectionPayload,
    type TestConnectionResult,
} from "@/lib/api";

const DEFAULT_FORM: ConnectionFormValues = {
    name: "",
    host: "",
    port: "22",
    username: "root",
    authType: "password",
    password: "",
    privateKey: "",
    bind9ConfDir: "",
    bind9ZoneDir: "",
    rndcBin: "",
};

type PoolStatusMap = Record<string, { isConnected: boolean }>;

export default function ConnectionsPage() {
    const [connections, setConnections] = useState<ConnectionData[]>([]);
    const [poolStatus, setPoolStatus] = useState<PoolStatusMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState<ConnectionFormValues>(DEFAULT_FORM);
    const [editingConnection, setEditingConnection] = useState<ConnectionData | null>(null);
    const [saving, setSaving] = useState(false);
    const [testingDraft, setTestingDraft] = useState(false);
    const [testingConnectionId, setTestingConnectionId] = useState<string | null>(null);
    const [activatingConnectionId, setActivatingConnectionId] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const { toast } = useToast();
    const { isAdmin } = useAuth();

    const authChanged = Boolean(editingConnection && editingConnection.authType !== form.authType);
    const saveValidation = validateConnectionForm(form, {
        requirePassword: form.authType === "password" && (!editingConnection || authChanged),
        requirePrivateKey: form.authType === "key" && (!editingConnection || authChanged),
    });
    const draftValidation = validateConnectionForm(form, {
        requirePassword: form.authType === "password",
        requirePrivateKey: form.authType === "key",
    });
    const validationMessage = saveValidation.success ? null : saveValidation.error.issues[0]?.message ?? "Invalid form";
    const canSave = saveValidation.success;
    const canTestDraft = draftValidation.success;

    const resetForm = () => {
        setEditingConnection(null);
        setForm(DEFAULT_FORM);
    };

    const setFormField = <K extends keyof ConnectionFormValues>(field: K, value: ConnectionFormValues[K]) => {
        setForm((current) => ({ ...current, [field]: value }));
    };

    const buildPayload = (): ConnectionPayload => ({
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number.parseInt(form.port, 10) || 22,
        username: form.username.trim(),
        authType: form.authType,
        bind9ConfDir: form.bind9ConfDir.trim() || undefined,
        bind9ZoneDir: form.bind9ZoneDir.trim() || undefined,
        rndcBin: form.rndcBin.trim() || undefined,
        ...(form.authType === "password"
            ? { password: form.password || undefined }
            : { privateKey: form.privateKey || undefined }),
    });

    const fetchConnections = async () => {
        try {
            const [connectionList, pool] = await Promise.all([
                getConnections(),
                getConnectionPoolStatus().catch(() => null),
            ]);

            setConnections(connectionList);
            if (pool) {
                const nextStatus: PoolStatusMap = {};
                for (const connection of pool.connections) {
                    nextStatus[connection.id] = { isConnected: connection.isConnected };
                }
                setPoolStatus(nextStatus);
            } else {
                setPoolStatus({});
            }
            setError(null);
        } catch (fetchError: any) {
            setError(fetchError.message);
            toast({ title: "Error", description: fetchError.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConnections();
    }, []);

    const handleDialogOpenChange = (open: boolean) => {
        setShowModal(open);
        if (!open) {
            resetForm();
        }
    };

    const openCreateModal = () => {
        resetForm();
        setShowModal(true);
    };

    const openEditModal = (connection: ConnectionData) => {
        setEditingConnection(connection);
        setForm({
            name: connection.name,
            host: connection.host,
            port: String(connection.port),
            username: connection.username,
            authType: connection.authType,
            password: "",
            privateKey: "",
            bind9ConfDir: connection.bind9ConfDir || "",
            bind9ZoneDir: connection.bind9ZoneDir || "",
            rndcBin: connection.rndcBin || "",
        });
        setShowModal(true);
    };

    const handleSaveConnection = async () => {
        if (!saveValidation.success) {
            toast({ title: "Error", description: validationMessage ?? "Invalid form", variant: "destructive" });
            return;
        }

        setSaving(true);
        try {
            const payload = buildPayload();
            if (editingConnection) {
                await updateConnection(editingConnection.id, payload);
                toast({ title: "Connection updated" });
            } else {
                await createConnection(payload);
                toast({ title: "Connection created" });
            }

            handleDialogOpenChange(false);
            await fetchConnections();
        } catch (saveError: any) {
            toast({ title: "Error", description: saveError.message, variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const handleTestDraft = async () => {
        if (!draftValidation.success) {
            const message = draftValidation.error.issues[0]?.message ?? "Invalid form";
            toast({ title: "Unable to test draft", description: message, variant: "destructive" });
            return;
        }

        setTestingDraft(true);
        try {
            const result = await testConnectionInline({
                host: form.host.trim(),
                port: Number.parseInt(form.port, 10) || 22,
                username: form.username.trim(),
                authType: form.authType,
                password: form.authType === "password" ? form.password : undefined,
                privateKey: form.authType === "key" ? form.privateKey : undefined,
            });
            setTestResult(result);

            if (result.success && result.serverInfo) {
                setForm((current) => ({
                    ...current,
                    bind9ConfDir: current.bind9ConfDir || result.serverInfo?.confDir || "",
                    bind9ZoneDir: current.bind9ZoneDir || result.serverInfo?.zoneDir || "",
                }));
            }
        } catch (testError: any) {
            toast({ title: "Test failed", description: testError.message, variant: "destructive" });
        } finally {
            setTestingDraft(false);
        }
    };

    const handleTestConnection = async (connectionId: string) => {
        setTestingConnectionId(connectionId);
        try {
            const result = await testConnection(connectionId);
            setTestResult(result);
            await fetchConnections();
        } catch (testError: any) {
            toast({ title: "Test failed", description: testError.message, variant: "destructive" });
        } finally {
            setTestingConnectionId(null);
        }
    };

    const handleActivate = async (connectionId: string) => {
        setActivatingConnectionId(connectionId);
        try {
            await activateConnection(connectionId);
            toast({ title: "Connection activated", description: "Switched to SSH mode" });
            await fetchConnections();
        } catch (activateError: any) {
            toast({ title: "Activation failed", description: activateError.message, variant: "destructive" });
        } finally {
            setActivatingConnectionId(null);
        }
    };

    const handleDeactivate = async () => {
        try {
            await deactivateConnections();
            toast({ title: "Disconnected", description: "Switched to local mode" });
            await fetchConnections();
        } catch (deactivateError: any) {
            toast({ title: "Error", description: deactivateError.message, variant: "destructive" });
        }
    };

    const handleDelete = async (connectionId: string) => {
        try {
            await deleteConnection(connectionId);
            toast({ title: "Connection deleted" });
            setDeleteTarget(null);
            await fetchConnections();
        } catch (deleteError: any) {
            toast({ title: "Error", description: deleteError.message, variant: "destructive" });
        }
    };

    const activeConnection = connections.find((connection) => connection.isActive);
    const connectedCount = connections.filter((connection) => poolStatus[connection.id]?.isConnected).length;
    const idleCount = connections.filter((connection) => !poolStatus[connection.id]?.isConnected && !connection.isActive).length;

    if (loading) {
        return (
            <DashboardLayout>
                <PageState
                    loading
                    title="Loading connections"
                    description="Fetching remote BIND9 connection profiles and pool status."
                    className="min-h-[60vh]"
                />
            </DashboardLayout>
        );
    }

    if (error && connections.length === 0) {
        return (
            <DashboardLayout>
                <PageState
                    title="Unable to load connections"
                    description={error}
                    tone="danger"
                    action={<Button onClick={fetchConnections}>Retry</Button>}
                    className="min-h-[60vh]"
                />
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <PageHeader
                    title="SSH Connections"
                    description="Manage local and remote BIND9 targets from the same control surface."
                    icon={Server}
                    badge={<Badge variant="outline">{connections.length} saved profiles</Badge>}
                    actions={
                        isAdmin ? (
                            <Button className="gap-2" onClick={openCreateModal}>
                                <Plus className="h-4 w-4" />
                                Add Connection
                            </Button>
                        ) : undefined
                    }
                />

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        label="Configured Profiles"
                        value={connections.length}
                        description="Saved remote endpoints for BIND9 administration."
                        icon={Server}
                    />
                    <MetricCard
                        label="Connected"
                        value={connectedCount}
                        description="Profiles with an active SSH session."
                        icon={Wifi}
                        tone="success"
                    />
                    <MetricCard
                        label="Idle"
                        value={idleCount}
                        description="Profiles available but not currently connected."
                        icon={WifiOff}
                        tone="warning"
                    />
                    <MetricCard
                        label="Current Mode"
                        value={activeConnection ? "SSH" : "Local"}
                        description={activeConnection ? activeConnection.host : "Managing this server directly."}
                        icon={activeConnection ? Zap : ZapOff}
                    />
                </div>

                <Card className={`border-l-4 ${activeConnection ? "border-green-500" : "border-yellow-500"}`}>
                    <CardContent className="flex items-center gap-3 py-5">
                        <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${activeConnection ? "bg-green-500/10 text-green-600" : "bg-yellow-500/10 text-yellow-600"}`}
                        >
                            {activeConnection ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
                        </div>
                        <div className="flex-1">
                            <h5 className="mb-1 font-semibold">
                                {activeConnection ? `Active: ${activeConnection.name}` : "Local Mode Active"}
                            </h5>
                            <p className="mb-0 text-sm text-muted-foreground">
                                {activeConnection
                                    ? `Managing ${activeConnection.host} - ${connections.filter((connection) => poolStatus[connection.id]?.isConnected && connection.id !== activeConnection.id).length} other connection(s) in pool`
                                    : "You are managing the local BIND9 instance on this machine."}
                            </p>
                        </div>
                        {activeConnection && isAdmin && (
                            <Button variant="outline" size="sm" className="gap-2" onClick={handleDeactivate}>
                                <ZapOff className="h-3.5 w-3.5" />
                                Switch to Local
                            </Button>
                        )}
                    </CardContent>
                </Card>

                <div className="flex items-center gap-2 font-semibold">
                    <Server className="h-4 w-4 text-primary" />
                    <span>Available Connections</span>
                    <span className="text-sm font-normal text-muted-foreground">({connectedCount} connected)</span>
                </div>

                {connections.length === 0 ? (
                    <PageState
                        title="No connections configured"
                        description="Add a remote SSH endpoint to manage another BIND9 server."
                        action={
                            isAdmin ? (
                                <Button variant="outline" onClick={openCreateModal}>
                                    Add First Connection
                                </Button>
                            ) : null
                        }
                    />
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {connections.map((connection) => (
                            <ConnectionCard
                                key={connection.id}
                                connection={connection}
                                isConnected={Boolean(poolStatus[connection.id]?.isConnected)}
                                isAdmin={isAdmin}
                                testing={testingConnectionId === connection.id}
                                activating={activatingConnectionId === connection.id}
                                onEdit={openEditModal}
                                onDelete={setDeleteTarget}
                                onTest={handleTestConnection}
                                onActivate={handleActivate}
                            />
                        ))}
                    </div>
                )}
            </div>

            <ConnectionFormDialog
                open={showModal}
                editingConnection={editingConnection}
                values={form}
                validationMessage={validationMessage}
                authChanged={authChanged}
                canTestDraft={canTestDraft}
                canSave={canSave}
                saving={saving}
                testingDraft={testingDraft}
                onOpenChange={handleDialogOpenChange}
                onFieldChange={setFormField}
                onSave={handleSaveConnection}
                onTestDraft={handleTestDraft}
            />

            <ConnectionTestResultDialog
                result={testResult}
                onOpenChange={(open) => {
                    if (!open) {
                        setTestResult(null);
                    }
                }}
            />

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
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                if (deleteTarget) {
                                    handleDelete(deleteTarget);
                                }
                            }}
                        >
                            Delete Connection
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DashboardLayout>
    );
}
