import { FolderOpen, Loader2, Pencil, Server, Terminal, TestTube, Trash2, Wifi, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ConnectionData } from "@/lib/api";

type ConnectionCardProps = {
    connection: ConnectionData;
    isConnected: boolean;
    isAdmin: boolean;
    testing: boolean;
    activating: boolean;
    onEdit: (connection: ConnectionData) => void;
    onDelete: (connectionId: string) => void;
    onTest: (connectionId: string) => void;
    onActivate: (connectionId: string) => void;
};

export function ConnectionCard({
    connection,
    isConnected,
    isAdmin,
    testing,
    activating,
    onEdit,
    onDelete,
    onTest,
    onActivate,
}: ConnectionCardProps) {
    const accentClass = connection.isActive
        ? "bg-green-500/10 text-green-600"
        : isConnected
          ? "bg-blue-500/10 text-blue-600"
          : "bg-primary/10 text-primary";

    return (
        <Card className={connection.isActive ? "border-green-500" : isConnected ? "border-blue-400" : ""}>
            <CardContent className="flex h-full flex-col p-4">
                <div className="mb-3 flex items-start justify-between">
                    <div className="flex items-center gap-2">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${accentClass}`}>
                            <Terminal className="h-4 w-4" />
                        </div>
                        <div>
                            <div className="font-bold">{connection.name}</div>
                            <div>
                                <Badge variant={connection.isActive ? "default" : isConnected ? "outline" : "secondary"}>
                                    {connection.isActive ? "Active" : isConnected ? "Connected" : "Idle"}
                                </Badge>
                                {connection.lastStatus === "failed" && !isConnected && (
                                    <Badge variant="destructive" className="ml-1">Error</Badge>
                                )}
                            </div>
                        </div>
                    </div>
                    {isAdmin && (
                        <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(connection)}>
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => onDelete(connection.id)}
                                disabled={connection.isActive}
                            >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                        </div>
                    )}
                </div>

                <div className="mb-3 flex flex-col gap-1 text-sm">
                    <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Host:</span>
                        <code className="rounded bg-muted px-1 text-right">{connection.host}:{connection.port}</code>
                    </div>
                    <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">User:</span>
                        <code className="rounded bg-muted px-1 text-right">{connection.username}</code>
                    </div>
                    <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Auth:</span>
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-medium">
                            <Server className="h-3 w-3" />
                            {connection.authType === "key" ? "Private key" : "Password"}
                        </span>
                    </div>
                </div>

                {(connection.bind9ConfDir || connection.bind9ZoneDir) && (
                    <div className="mb-3 border-t pt-2">
                        <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <FolderOpen className="h-3 w-3" />
                            Detected Paths
                        </div>
                        {connection.bind9ConfDir && <div className="truncate font-mono text-xs">{connection.bind9ConfDir}</div>}
                        {connection.bind9ZoneDir && <div className="truncate font-mono text-xs">{connection.bind9ZoneDir}</div>}
                    </div>
                )}

                {isAdmin && (
                    <div className="mt-auto flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => onTest(connection.id)} disabled={testing}>
                            {testing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <TestTube className="mr-1 h-3 w-3" />}
                            Test
                        </Button>
                        {!connection.isActive && (
                            <Button size="sm" className="flex-1" onClick={() => onActivate(connection.id)} disabled={activating}>
                                {activating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Zap className="mr-1 h-3 w-3" />}
                                Connect
                            </Button>
                        )}
                        {connection.isActive && (
                            <div className="flex flex-1 items-center justify-center rounded-md border border-border/70 bg-muted/40 text-xs text-muted-foreground">
                                <Wifi className="mr-1 h-3 w-3" />
                                In use
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
