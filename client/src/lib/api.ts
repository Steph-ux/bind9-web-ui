/** API client for BIND9 Admin Panel */

const BASE = "/api";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${url}`, {
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        ...options,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || `HTTP ${res.status}`);
    }
    try {
        return await res.json();
    } catch {
        throw new Error("Server returned an invalid response. Please ensure the backend is running.");
    }
}

// ── Dashboard ──────────────────────────────────────────────
export interface DashboardData {
    zones: { total: number; active: number };
    records: number;
    bind9: { running: boolean; version: string; uptime: string; zones: number; pid: number | null; threads: number };
    uptime: string;
    system: { cpu: number; memory: { used: number; total: number } };
    typeDistribution: Array<{ name: string; value: number }>;
    recentLogs: Array<{ id: string; timestamp: string; level: string; source: string; message: string }>;
}

export const getDashboard = () => request<DashboardData>("/dashboard");

// ── Zones ──────────────────────────────────────────────────
export interface ZoneData {
    id: string;
    domain: string;
    type: string;
    status: string;
    serial: string;
    filePath: string;
    adminEmail: string;
    masterServers: string;
    forwarders: string;
    replicationEnabled: boolean;
    records: number;
    createdAt: string;
    updatedAt: string;
}

export interface ZoneDetail extends Omit<ZoneData, "records"> {
    records: any[];
}

export const getZones = () => request<ZoneData[]>("/zones");
export const getZone = (id: string) => request<ZoneDetail>(`/zones/${id}`);
export const createZone = (data: {
    domain: string;
    type: string;
    adminEmail?: string;
    masterServers?: string;
    forwarders?: string;
    autoReverse?: boolean;
    network?: string;
}) =>
    request<ZoneData>("/zones", { method: "POST", body: JSON.stringify(data) });
export const updateZone = (id: string, data: Partial<ZoneData>) =>
    request<ZoneData>(`/zones/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteZone = (id: string) =>
    request<{ message: string }>(`/zones/${id}`, { method: "DELETE" });

// ── DNS Records ────────────────────────────────────────────
export interface RecordData {
    id: string;
    zoneId: string;
    name: string;
    type: string;
    value: string;
    ttl: number;
    priority: number | null;
}

export const getRecords = (zoneId: string) => request<RecordData[]>(`/zones/${zoneId}/records`);
export const createRecord = (zoneId: string, data: Omit<RecordData, "id" | "zoneId">) =>
    request<RecordData>(`/zones/${zoneId}/records`, { method: "POST", body: JSON.stringify(data) });
export const updateRecord = (id: string, data: Partial<RecordData>) =>
    request<RecordData>(`/records/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteRecord = (id: string) =>
    request<{ message: string }>(`/records/${id}`, { method: "DELETE" });

// ── Config ─────────────────────────────────────────────────
export interface ConfigData {
    section: string;
    content: string;
}

export const getConfig = (section: string) => request<ConfigData>(`/config/${section}`);
export const saveConfig = (section: string, content: string) =>
    request<any>(`/config/${section}`, { method: "PUT", body: JSON.stringify({ content }) });

// ── ACLs ───────────────────────────────────────────────────
export interface AclData {
    id: string;
    name: string;
    networks: string;
    comment: string;
    createdAt: string;
}

export const getAcls = () => request<AclData[]>("/acls");
export const createAcl = (data: { name: string; networks: string; comment?: string }) =>
    request<AclData>("/acls", { method: "POST", body: JSON.stringify(data) });
export const updateAcl = (id: string, data: Partial<AclData>) =>
    request<AclData>(`/acls/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteAcl = (id: string) =>
    request<{ message: string }>(`/acls/${id}`, { method: "DELETE" });

// ── TSIG Keys ──────────────────────────────────────────────
export interface KeyData {
    id: string;
    name: string;
    algorithm: string;
    secret: string;
    createdAt: string;
}

export const getKeys = () => request<KeyData[]>("/keys");
export const createKey = (data: { name: string; algorithm: string; secret: string }) =>
    request<KeyData>("/keys", { method: "POST", body: JSON.stringify(data) });
export const deleteKey = (id: string) =>
    request<{ message: string }>(`/keys/${id}`, { method: "DELETE" });

// ── Logs ───────────────────────────────────────────────────
export interface LogData {
    id: string;
    timestamp: string;
    level: string;
    source: string;
    message: string;
}

export const getLogs = (params?: { level?: string; source?: string; search?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.level) query.set("level", params.level);
    if (params?.source) query.set("source", params.source);
    if (params?.search) query.set("search", params.search);
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return request<LogData[]>(`/logs${qs ? `?${qs}` : ""}`);
};
export const clearLogs = () => request<{ message: string }>("/logs", { method: "DELETE" });

// ── Status ─────────────────────────────────────────────────
export interface StatusData {
    bind9: { running: boolean; version: string; uptime: string; zones: number; pid: number | null; threads: number };
    system: {
        cpu: { user: number; system: number; total: number };
        memory: { used: number; total: number; cached: number };
        openFiles: number;
        interfaces: Array<{ name: string; ip: string; rx: string; tx: string }>;
    };
    uptime: string;
    hostname: string;
    connectionMode?: string;
    sshState?: { configured: boolean; connected: boolean; host: string | null };
    management?: {
        mode: string;
        available: boolean;
        includes: {
            namedConfLocalIncluded: boolean;
            namedConfAclsIncluded: boolean;
            namedConfKeysIncluded: boolean;
        };
        zoneLayout: {
            strategy: "flat" | "split";
            forwardDir: string | null;
            reverseDir: string | null;
        };
        writablePaths: {
            namedConfLocal: boolean;
            namedConfOptions: boolean;
            namedConfAcls: boolean;
            namedConfKeys: boolean;
        };
        rpz: {
            configured: boolean;
            zoneName: string | null;
            filePath: string | null;
            writable: boolean;
        };
        features: {
            zones: boolean;
            acls: boolean;
            keys: boolean;
            rpz: boolean;
        };
    };
}

export const getStatus = () => request<StatusData>("/status");

// ── BIND9 Advanced Info ────────────────────────────────────
export interface BindInfoData {
    forwarders: string[];
    allowRecursion: string[];
    allowQuery: string[];
    allowTransfer: string[];
    dnssec: Array<{ zone: string; signed: boolean; keys: Array<{ name: string; algorithm: string; status: string }> }>;
    transfers: { incoming: number; outgoing: number; details: string[] };
    slaveZones: Array<{ zone: string; file: string; lastModified: string | null; size: number }>;
    management?: StatusData["management"];
}

export const getBindInfo = () => request<BindInfoData>("/server/bind-info");

// ── rndc ───────────────────────────────────────────────────
export const executeRndc = (command: string) =>
    request<{ command: string; output: string }>(`/rndc/${command}`, { method: "POST" });

// ── SSH Connections ────────────────────────────────────────
export interface ConnectionData {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    authType: string;
    password: string;
    privateKey: string;
    bind9ConfDir: string;
    bind9ZoneDir: string;
    rndcBin: string;
    isActive: boolean;
    lastStatus: string;
    createdAt: string;
}

export interface TestConnectionResult {
    success: boolean;
    message: string;
    serverInfo?: {
        hostname: string;
        os: string;
        bind9Version: string;
        bind9Running: boolean;
        confDir: string;
        zoneDir: string;
    };
}

export const getConnections = () => request<ConnectionData[]>("/connections");
export const createConnection = (data: {
    name: string; host: string; port?: number; username: string;
    authType?: string; password?: string; privateKey?: string;
    bind9ConfDir?: string; bind9ZoneDir?: string;
}) => request<ConnectionData>("/connections", { method: "POST", body: JSON.stringify(data) });

export const updateConnection = (id: string, data: Partial<ConnectionData>) =>
    request<ConnectionData>(`/connections/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteConnection = (id: string) =>
    request<{ message: string }>(`/connections/${id}`, { method: "DELETE" });

export const testConnection = (id: string) =>
    request<TestConnectionResult>(`/connections/${id}/test`, { method: "POST" });

export const testConnectionInline = (data: {
    host: string; port?: number; username: string;
    authType?: string; password?: string;
}) => request<TestConnectionResult>("/connections/test", { method: "POST", body: JSON.stringify(data) });

export const activateConnection = (id: string) =>
    request<ConnectionData & { message: string }>(`/connections/${id}/activate`, { method: "PUT" });

export const deactivateConnections = () =>
    request<{ message: string }>("/connections/deactivate", { method: "PUT" });

// ── Zone Sync ──────────────────────────────────────────────
export const syncZones = () =>
    request<{ message: string; total: number; synced: number; skipped: number }>("/zones/sync", { method: "POST" });

// ── Firewall ──────────────────────────────────────────────
export type RuleDirection = "in" | "out";
export type RuleType = "port" | "service" | "portRange" | "multiPort" | "icmp" | "raw";

export interface FirewallRule {
    id: number;
    to: string;
    action: "ALLOW" | "DENY" | "REJECT" | "LIMIT";
    from: string;
    ipv6: boolean;
    direction: RuleDirection;
    ruleType: RuleType;
    proto: string;
    toPortEnd?: string;
    service?: string;
    interface?: string;
    rateLimit?: string;
    icmpType?: string;
    log?: boolean;
    comment?: string;
    rawRule?: string;
}

export type FirewallBackend = "ufw" | "firewalld" | "iptables" | "nftables" | "none";

export interface FirewallStatus {
    active: boolean;
    rules: FirewallRule[];
    installed: boolean;
    backend: FirewallBackend;
    availableBackends: FirewallBackend[];
}

export interface AddFirewallRuleData {
    toPort: string;
    proto: string;
    action: string;
    fromIp: string;
    direction?: RuleDirection;
    ruleType?: RuleType;
    toPortEnd?: string;
    service?: string;
    interface?: string;
    rateLimit?: string;
    icmpType?: string;
    log?: boolean;
    comment?: string;
    rawRule?: string;
}

export const getFirewallStatus = () => request<FirewallStatus>("/firewall/status");
export const toggleFirewall = (enable: boolean) => request<{ message: string }>("/firewall/toggle", { method: "POST", body: JSON.stringify({ enable }) });
export const switchFirewallBackend = (backend: FirewallBackend) => request<{ message: string; status: FirewallStatus }>("/firewall/backend", { method: "POST", body: JSON.stringify({ backend }) });
export const getFirewallRules = () => request<FirewallRule[]>("/firewall/rules");
export const addFirewallRule = (data: AddFirewallRuleData) =>
    request<{ message: string }>("/firewall/rules", { method: "POST", body: JSON.stringify(data) });
export const deleteFirewallRule = (id: number) =>
    request<{ message: string }>(`/firewall/rules/${id}`, { method: "DELETE" });

// ── IP Blacklist ──────────────────────────────────────────
export interface IpBlacklistEntry {
    id: string;
    ip: string;
    attemptCount: number;
    reason: "login_failed" | "api_abuse" | "brute_force" | "manual";
    bannedAt: string;
    expiresAt: string | null;
    createdAt: string;
}

export const getIpBlacklist = () => request<IpBlacklistEntry[]>("/blacklist");
export const banIp = (ip: string, reason?: string, durationMs?: number) =>
    request<{ message: string }>("/blacklist", { method: "POST", body: JSON.stringify({ ip, reason, durationMs }) });
export const unbanIp = (ip: string) =>
    request<{ message: string }>(`/blacklist/${encodeURIComponent(ip)}`, { method: "DELETE" });
export const cleanupBlacklist = () =>
    request<{ message: string }>("/blacklist/cleanup", { method: "POST" });

// ── API Tokens ──────────────────────────────────────────────────
export interface ApiTokenEntry {
    id: string;
    name: string;
    tokenPrefix: string;
    permissions: string;
    createdBy: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
}

export interface CreateTokenResponse extends ApiTokenEntry {
    token: string; // Only returned on creation
}

export const getApiTokens = () => request<ApiTokenEntry[]>("/tokens");
export const createApiToken = (name: string, permissions?: string, expiresAt?: string) =>
    request<CreateTokenResponse>("/tokens", {
        method: "POST",
        body: JSON.stringify({ name, permissions, expiresAt }),
    });
export const revokeApiToken = (id: string) =>
    request<{ message: string }>(`/tokens/${id}`, { method: "DELETE" });

// ── Domain Jailing ──────────────────────────────────────────────
export interface UserDomainAssignment {
    id: string;
    userId: string;
    zoneId: string;
    createdAt: string;
}

export const getUserDomains = (userId: string) =>
    request<UserDomainAssignment[]>(`/users/${userId}/domains`);
export const setUserDomains = (userId: string, zoneIds: string[]) =>
    request<{ message: string }>(`/users/${userId}/domains`, {
        method: "PUT",
        body: JSON.stringify({ zoneIds }),
    });

// ── Replication Servers ─────────────────────────────────────────
export interface ReplicationServerEntry {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    authType: "password" | "key";
    password: string;
    privateKey: string;
    bind9ConfDir: string | null;
    bind9ZoneDir: string | null;
    role: "slave" | "secondary";
    lastSyncAt: string | null;
    lastSyncStatus: "success" | "failed" | "pending" | "never";
    enabled: boolean;
    createdAt: string;
}

export const getReplicationServers = () =>
    request<ReplicationServerEntry[]>("/replication");
export const getReplicationStats = () =>
    request<ReplicationStats>("/replication/stats");

export interface ReplicationStats {
    totalServers: number;
    enabledServers: number;
    connectedServers: number;
    failedServers: number;
    neverSyncedServers: number;
    totalZones: number;
    unresolvedConflicts: number;
    serialMismatches: number;
    zoneMissing: number;
    lastSyncAt: string | null;
}
export const createReplicationServer = (data: Partial<ReplicationServerEntry> & { name: string; host: string }) =>
    request<ReplicationServerEntry>("/replication", {
        method: "POST",
        body: JSON.stringify(data),
    });
export const updateReplicationServer = (id: string, data: Partial<ReplicationServerEntry>) =>
    request<ReplicationServerEntry>(`/replication/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
    });
export const deleteReplicationServer = (id: string) =>
    request<{ message: string }>(`/replication/${id}`, { method: "DELETE" });
export const testReplicationServer = (id: string) =>
    request<{ success: boolean; message: string; serverInfo?: any }>(`/replication/${id}/test`, {
        method: "POST",
    });
export const syncAllReplication = () =>
    request<{ results: any[]; totalZones: number; duration: number }>("/replication/sync", {
        method: "POST",
    });
export const syncZoneReplication = (zoneId: string) =>
    request<{ results: any[]; totalZones: number; duration: number }>(`/replication/sync/${zoneId}`, {
        method: "POST",
    });
export const notifyZoneReplication = (domain: string) =>
    request<{ message: string }>(`/replication/notify/${domain}`, {
        method: "POST",
    });

// ── Replication Conflicts ───────────────────────────────────────
export interface ReplicationConflictEntry {
    id: string;
    serverId: string;
    serverName: string;
    zoneDomain: string;
    masterSerial: string | null;
    slaveSerial: string | null;
    conflictType: "serial_mismatch" | "zone_missing" | "soa_mismatch" | "config_mismatch";
    details: string | null;
    resolved: boolean;
    detectedAt: string;
    resolvedAt: string | null;
}

export const getReplicationConflicts = (resolved?: boolean) =>
    request<ReplicationConflictEntry[]>(`/replication/conflicts${resolved !== undefined ? `?resolved=${resolved}` : ""}`);
export const detectReplicationConflicts = () =>
    request<{ detected: number; conflicts: ReplicationConflictEntry[] }>("/replication/conflicts/detect", {
        method: "POST",
    });
export const resolveReplicationConflict = (id: string) =>
    request<{ message: string }>(`/replication/conflicts/${id}/resolve`, { method: "PUT" });
export const resolveAllReplicationConflicts = () =>
    request<{ message: string }>("/replication/conflicts/resolve-all", { method: "PUT" });

// ── Replication Zone Bindings ───────────────────────────────────
export interface ReplicationZoneBindingEntry {
    id: string;
    serverId: string;
    zoneId: string;
    zoneDomain: string;
    mode: "push" | "pull" | "both";
    enabled: boolean;
    lastSyncAt: string | null;
    createdAt: string;
}

export const getReplicationZoneBindings = (serverId: string) =>
    request<ReplicationZoneBindingEntry[]>(`/replication/${serverId}/bindings`);
export const setReplicationZoneBindings = (serverId: string, bindings: { zoneId: string; mode: "push" | "pull" | "both"; enabled: boolean }[]) =>
    request<{ message: string }>(`/replication/${serverId}/bindings`, {
        method: "PUT",
        body: JSON.stringify({ bindings }),
    });

// ── Health Checks ───────────────────────────────────────────────
export interface HealthCheckEntry {
    id: string;
    serverId: string;
    status: "healthy" | "degraded" | "down";
    latencyMs: number | null;
    details: string;
    checkedAt: string;
}

export const getHealthChecks = (serverId?: string, limit?: number) =>
    request<HealthCheckEntry[]>(`/health-checks${serverId ? `?serverId=${serverId}` : ""}${limit ? `${serverId ? "&" : "?"}limit=${limit}` : ""}`);
export const runHealthChecks = () =>
    request<HealthCheckEntry[]>("/health-checks/run", { method: "POST" });

// ── Notification Channels ────────────────────────────────────────
export interface NotificationChannelEntry {
    id: string;
    name: string;
    type: "email" | "webhook" | "slack";
    config: string;
    enabled: boolean;
    events: string;
    createdAt: string;
}

export const getNotificationChannels = () =>
    request<NotificationChannelEntry[]>("/notification-channels");
export const createNotificationChannel = (data: { name: string; type: "email" | "webhook" | "slack"; config: Record<string, string>; enabled?: boolean; events?: string }) =>
    request<NotificationChannelEntry>("/notification-channels", {
        method: "POST",
        body: JSON.stringify(data),
    });
export const updateNotificationChannel = (id: string, data: Partial<NotificationChannelEntry>) =>
    request<NotificationChannelEntry>(`/notification-channels/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
    });
export const deleteNotificationChannel = (id: string) =>
    request<{ message: string }>(`/notification-channels/${id}`, { method: "DELETE" });

// ── Sync History & Metrics ──────────────────────────────────────
export interface SyncHistoryEntry {
    id: string;
    serverId: string;
    zoneDomain: string;
    action: "push" | "pull" | "notify";
    success: boolean;
    durationMs: number | null;
    details: string;
    createdAt: string;
}

export interface SyncMetrics {
    total: number;
    success: number;
    failed: number;
    avgDurationMs: number;
}

export const getSyncHistory = (serverId?: string, limit?: number) =>
    request<SyncHistoryEntry[]>(`/sync-history${serverId ? `?serverId=${serverId}` : ""}${limit ? `${serverId ? "&" : "?"}limit=${limit}` : ""}`);
export const getSyncMetrics = (serverId?: string) =>
    request<SyncMetrics>(`/sync-metrics${serverId ? `?serverId=${serverId}` : ""}`);

// ── DNSSEC ──────────────────────────────────────────────────────
export interface DnssecKeyEntry {
    id: string;
    zoneId: string;
    keyTag: string;
    keyType: "KSK" | "ZSK";
    algorithm: string;
    keySize: number;
    status: "active" | "published" | "retired" | "revoked";
    filePath: string | null;
    createdAt: string;
    activatedAt: string | null;
    retiredAt: string | null;
}

export interface DnssecStatus {
    signed: boolean;
    keys: DnssecKeyEntry[];
    details: string;
}

export const getDnssecKeys = (zoneId?: string) =>
    request<DnssecKeyEntry[]>(`/dnssec/keys${zoneId ? `?zoneId=${zoneId}` : ""}`);
export const generateDnssecKey = (zoneId: string, keyType: "KSK" | "ZSK", algorithm?: string, keySize?: number) =>
    request<{ success: boolean; message: string; key?: DnssecKeyEntry }>("/dnssec/generate-key", {
        method: "POST",
        body: JSON.stringify({ zoneId, keyType, algorithm, keySize }),
    });
export const signZone = (zoneId: string) =>
    request<{ success: boolean; message: string }>(`/dnssec/sign-zone/${zoneId}`, { method: "POST" });
export const getDnssecStatus = (zoneId: string) =>
    request<DnssecStatus>(`/dnssec/status/${zoneId}`);
export const retireDnssecKey = (keyId: string) =>
    request<{ success: boolean; message: string }>(`/dnssec/retire-key/${keyId}`, { method: "POST" });
export const deleteDnssecKey = (keyId: string) =>
    request<{ success: boolean; message: string }>(`/dnssec/keys/${keyId}`, { method: "DELETE" });

// ── Backups ─────────────────────────────────────────────────────
export interface BackupEntry {
    id: string;
    type: "auto" | "manual" | "snapshot";
    scope: "full" | "zones" | "configs" | "single_zone";
    zoneId: string | null;
    filePath: string;
    sizeBytes: number | null;
    description: string;
    createdAt: string;
}

export const getBackups = (type?: string) =>
    request<BackupEntry[]>(`/backups${type ? `?type=${type}` : ""}`);
export const createBackup = (type: "auto" | "manual" | "snapshot", scope: "full" | "zones" | "configs" | "single_zone", zoneId?: string) =>
    request<BackupEntry>("/backups", {
        method: "POST",
        body: JSON.stringify({ type, scope, zoneId }),
    });
export const restoreBackup = (id: string) =>
    request<{ success: boolean; message: string }>(`/backups/${id}/restore`, { method: "POST" });
export const deleteBackup = (id: string) =>
    request<{ success: boolean; message: string }>(`/backups/${id}`, { method: "DELETE" });
