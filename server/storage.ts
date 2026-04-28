// Copyright Â(c) 2025 Stephane ASSOGBA
import { eq, desc, like, and, sql, inArray } from "drizzle-orm";
import { db, dbReady } from "./db";
import {
  users, zones, dnsRecords, acls, tsigKeys, configSnapshots, logEntries, connections,
  type User, type InsertUser,
  type Zone, type InsertZone,
  type DnsRecord, type InsertDnsRecord,
  type Acl, type InsertAcl,
  type TsigKey, type InsertTsigKey,
  type LogEntry, type InsertLogEntry,
  type ConfigSnapshot,
  type Connection, type InsertConnection,
  rpzEntries, type RpzEntry, type InsertRpzEntry,
  ipBlacklist, type IpBlacklist,
  apiTokens, type ApiToken,
  userDomains, type UserDomain,
  replicationServers, type ReplicationServer,
  replicationConflicts, type ReplicationConflict,
  replicationZoneBindings, type ReplicationZoneBinding,
  healthChecks, type HealthCheck,
  notificationChannels, type NotificationChannel,
  syncHistory, type SyncHistoryEntry,
  dnssecKeys, type DnssecKey,
  backups, type Backup,
} from "@shared/schema";

export interface LogFilter {
  level?: string;
  source?: string;
  search?: string;
  limit?: number;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  // Zones
  getZones(): Promise<Zone[]>;
  getZone(id: string): Promise<Zone | undefined>;
  createZone(zone: InsertZone): Promise<Zone>;
  updateZone(id: string, data: Partial<Zone>): Promise<Zone>;
  deleteZone(id: string): Promise<void>;
  getZoneRecordCount(zoneId: string): Promise<number>;
  // Records
  getRecords(zoneId: string): Promise<DnsRecord[]>;
  getRecord(id: string): Promise<DnsRecord | undefined>;
  createRecord(record: InsertDnsRecord): Promise<DnsRecord>;
  updateRecord(id: string, data: Partial<DnsRecord>): Promise<DnsRecord>;
  deleteRecord(id: string): Promise<void>;
  // ACLs
  getAcls(): Promise<Acl[]>;
  getAcl(id: string): Promise<Acl | undefined>;
  createAcl(acl: InsertAcl): Promise<Acl>;
  updateAcl(id: string, data: Partial<Acl>): Promise<Acl>;
  deleteAcl(id: string): Promise<void>;
  // TSIG Keys
  getKeys(): Promise<TsigKey[]>;
  getKey(id: string): Promise<TsigKey | undefined>;
  createKey(key: InsertTsigKey): Promise<TsigKey>;
  updateKey(id: string, data: Partial<TsigKey>): Promise<TsigKey>;
  deleteKey(id: string): Promise<void>;
  // RPZ
  // IP Blacklist
  getIpBlacklist(): Promise<IpBlacklist[]>;
  isIpBanned(ip: string): Promise<boolean>;
  recordFailedAttempt(ip: string, reason: "login_failed" | "api_abuse" | "brute_force" | "manual"): Promise<void>;
  unbanIp(ip: string): Promise<void>;
  banIp(ip: string, reason: "login_failed" | "api_abuse" | "brute_force" | "manual", durationMs?: number): Promise<void>;
  cleanupExpiredBans(): Promise<void>;

  // API Tokens
  getApiTokens(): Promise<ApiToken[]>;
  getApiTokenByHash(tokenHash: string): Promise<ApiToken | undefined>;
  createApiToken(data: { name: string; tokenHash: string; tokenPrefix: string; permissions: string; createdBy: string; expiresAt?: string }): Promise<ApiToken>;
  deleteApiToken(id: string): Promise<boolean>;
  updateTokenLastUsed(tokenHash: string): Promise<void>;

  // Domain Jailing
  getUserDomains(userId: string): Promise<UserDomain[]>;
  setUserDomains(userId: string, zoneIds: string[]): Promise<void>;
  isZoneAccessibleByUser(zoneId: string, userId: string, userRole: string): Promise<boolean>;

  // Replication Servers
  getReplicationServers(): Promise<ReplicationServer[]>;
  getReplicationServer(id: string): Promise<ReplicationServer | undefined>;
  createReplicationServer(data: Omit<ReplicationServer, "id" | "createdAt" | "lastSyncAt" | "lastSyncStatus">): Promise<ReplicationServer>;
  updateReplicationServer(id: string, data: Partial<ReplicationServer>): Promise<ReplicationServer>;
  deleteReplicationServer(id: string): Promise<boolean>;
  updateReplicationSyncStatus(id: string, status: ReplicationServer["lastSyncStatus"]): Promise<void>;
  // Replication Conflicts
  getReplicationConflicts(resolved?: boolean): Promise<ReplicationConflict[]>;
  createReplicationConflict(data: Omit<ReplicationConflict, "id" | "detectedAt" | "resolvedAt">): Promise<ReplicationConflict>;
  resolveReplicationConflict(id: string): Promise<void>;
  resolveAllReplicationConflicts(): Promise<void>;
  // Replication Zone Bindings
  getReplicationZoneBindings(serverId?: string, zoneId?: string): Promise<ReplicationZoneBinding[]>;
  setReplicationZoneBindings(serverId: string, bindings: { zoneId: string; mode: "push" | "pull" | "both"; enabled: boolean }[]): Promise<void>;
  getReplicationZoneBinding(serverId: string, zoneId: string): Promise<ReplicationZoneBinding | undefined>;
  // Health Checks
  getHealthChecks(serverId?: string, limit?: number): Promise<HealthCheck[]>;
  getLatestHealthCheck(serverId: string): Promise<HealthCheck | undefined>;
  createHealthCheck(data: Omit<HealthCheck, "id" | "checkedAt">): Promise<HealthCheck>;
  // Notification Channels
  getNotificationChannels(): Promise<NotificationChannel[]>;
  getNotificationChannel(id: string): Promise<NotificationChannel | undefined>;
  createNotificationChannel(data: Omit<NotificationChannel, "id" | "createdAt">): Promise<NotificationChannel>;
  updateNotificationChannel(id: string, data: Partial<NotificationChannel>): Promise<NotificationChannel>;
  deleteNotificationChannel(id: string): Promise<boolean>;
  // Sync History
  getSyncHistory(serverId?: string, limit?: number): Promise<SyncHistoryEntry[]>;
  createSyncHistoryEntry(data: Omit<SyncHistoryEntry, "id" | "createdAt">): Promise<SyncHistoryEntry>;
  getSyncMetrics(serverId?: string): Promise<{ total: number; success: number; failed: number; avgDurationMs: number }>;
  // DNSSEC Keys
  getDnssecKeys(zoneId?: string): Promise<DnssecKey[]>;
  getDnssecKey(id: string): Promise<DnssecKey | undefined>;
  createDnssecKey(data: Omit<DnssecKey, "id" | "createdAt">): Promise<DnssecKey>;
  updateDnssecKey(id: string, data: Partial<DnssecKey>): Promise<DnssecKey>;
  deleteDnssecKey(id: string): Promise<boolean>;
  // Backups
  getBackups(type?: string): Promise<Backup[]>;
  getBackup(id: string): Promise<Backup | undefined>;
  createBackup(data: Omit<Backup, "id" | "createdAt">): Promise<Backup>;
  deleteBackup(id: string): Promise<boolean>;

  getRpzZoneData(): Promise<Array<{ name: string; type: string; target?: string }>>;
  createRpzEntry(entry: InsertRpzEntry): Promise<RpzEntry>;
  deleteRpzEntry(id: string): Promise<boolean>;
  getRpzExistingNames(names: string[]): Promise<Set<string>>;
  createRpzEntriesBatch(entries: InsertRpzEntry[]): Promise<number>;
  clearRpzEntries(): Promise<void>;
  getRpzEntriesPaged(opts: { page: number; limit: number; search: string; type: string }): Promise<{
    entries: RpzEntry[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  getRpzStats(): Promise<{ total: number; nxdomain: number; nodata: number; redirect: number }>;
  // Logs
  getLogs(filter?: LogFilter): Promise<LogEntry[]>;
  insertLog(entry: InsertLogEntry): Promise<LogEntry>;
  clearLogs(): Promise<void>;
  // Config
  getConfig(section: string): Promise<ConfigSnapshot | undefined>;
  saveConfig(section: string, content: string): Promise<ConfigSnapshot>;
  // Connections
  getConnections(): Promise<Connection[]>;
  getConnection(id: string): Promise<Connection | undefined>;
  getActiveConnection(): Promise<Connection | undefined>;
  createConnection(conn: InsertConnection): Promise<Connection>;
  updateConnection(id: string, data: Partial<Connection>): Promise<Connection>;
  deleteConnection(id: string): Promise<void>;
  activateConnection(id: string): Promise<Connection>;
  deactivateAllConnections(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private dbInitialized = false;

  /** Ensure DB is initialized before any operation */
  private async ensureDb(): Promise<void> {
    if (!this.dbInitialized) {
      await dbReady;
      this.dbInitialized = true;
    }
  }

  // â”€â”€ Users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getUser(id: string): Promise<User | undefined> {
    await this.ensureDb();
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.ensureDb();
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    await this.ensureDb();
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUsers(): Promise<User[]> {
    await this.ensureDb();
    return db.select().from(users);
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    await this.ensureDb();
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    if (!user) throw new Error("User not found");
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await this.ensureDb();
    await db.delete(users).where(eq(users.id, id));
  }

  // â”€â”€ Zones â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getZones(): Promise<Zone[]> {
    await this.ensureDb();
    return db.select().from(zones).orderBy(zones.domain);
  }

  async getZone(id: string): Promise<Zone | undefined> {
    await this.ensureDb();
    const [zone] = await db.select().from(zones).where(eq(zones.id, id)).limit(1);
    return zone;
  }

  async createZone(insertZone: InsertZone): Promise<Zone> {
    await this.ensureDb();
    const now = new Date().toISOString();
    const serial = now.slice(0, 10).replace(/-/g, "") + "01";
    const zoneDir = process.env.BIND9_ZONE_DIR || "/var/cache/bind";
    const defaultFilePath = insertZone.type === "forward" ? "" : `${zoneDir}/db.${insertZone.domain}`;
    const [zone] = await db.insert(zones).values({
      ...insertZone,
      serial,
      status: "active",
      filePath: defaultFilePath,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return zone;
  }

  async updateZone(id: string, data: Partial<Zone>): Promise<Zone> {
    await this.ensureDb();
    const [zone] = await db.update(zones)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(zones.id, id))
      .returning();
    return zone;
  }

  async deleteZone(id: string): Promise<void> {
    await this.ensureDb();
    await db.delete(zones).where(eq(zones.id, id));
  }

  async getZoneRecordCount(zoneId: string): Promise<number> {
    await this.ensureDb();
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(dnsRecords)
      .where(eq(dnsRecords.zoneId, zoneId));
    return result[0]?.count || 0;
  }

  // â”€â”€ DNS Records â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getRecords(zoneId: string): Promise<DnsRecord[]> {
    await this.ensureDb();
    return db.select().from(dnsRecords).where(eq(dnsRecords.zoneId, zoneId)).orderBy(dnsRecords.name);
  }

  async getRecord(id: string): Promise<DnsRecord | undefined> {
    await this.ensureDb();
    const [record] = await db.select().from(dnsRecords).where(eq(dnsRecords.id, id)).limit(1);
    return record;
  }

  async createRecord(record: InsertDnsRecord): Promise<DnsRecord> {
    await this.ensureDb();
    const [created] = await db.insert(dnsRecords).values(record).returning();
    return created;
  }

  async updateRecord(id: string, data: Partial<DnsRecord>): Promise<DnsRecord> {
    await this.ensureDb();
    const [record] = await db.update(dnsRecords)
      .set(data)
      .where(eq(dnsRecords.id, id))
      .returning();
    return record;
  }

  async deleteRecord(id: string): Promise<void> {
    await this.ensureDb();
    await db.delete(dnsRecords).where(eq(dnsRecords.id, id));
  }

  // â”€â”€ ACLs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getAcls(): Promise<Acl[]> {
    await this.ensureDb();
    return db.select().from(acls).orderBy(acls.name);
  }

  async getAcl(id: string): Promise<Acl | undefined> {
    await this.ensureDb();
    const [acl] = await db.select().from(acls).where(eq(acls.id, id)).limit(1);
    return acl;
  }

  async createAcl(insertAcl: InsertAcl): Promise<Acl> {
    await this.ensureDb();
    const [acl] = await db.insert(acls).values({
      ...insertAcl,
      createdAt: new Date().toISOString(),
    }).returning();
    return acl;
  }

  async updateAcl(id: string, data: Partial<Acl>): Promise<Acl> {
    await this.ensureDb();
    const [acl] = await db.update(acls)
      .set(data)
      .where(eq(acls.id, id))
      .returning();
    return acl;
  }

  async deleteAcl(id: string): Promise<void> {
    await this.ensureDb();
    await db.delete(acls).where(eq(acls.id, id));
  }

  // â”€â”€ TSIG Keys â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getKeys(): Promise<TsigKey[]> {
    await this.ensureDb();
    return db.select().from(tsigKeys).orderBy(tsigKeys.name);
  }

  async getKey(id: string): Promise<TsigKey | undefined> {
    await this.ensureDb();
    const [key] = await db.select().from(tsigKeys).where(eq(tsigKeys.id, id)).limit(1);
    return key;
  }

  async createKey(insertKey: InsertTsigKey): Promise<TsigKey> {
    await this.ensureDb();
    const [key] = await db.insert(tsigKeys).values({
      ...insertKey,
      createdAt: new Date().toISOString(),
    }).returning();
    return key;
  }

  async updateKey(id: string, data: Partial<TsigKey>): Promise<TsigKey> {
    await this.ensureDb();
    const [key] = await db.update(tsigKeys)
      .set(data)
      .where(eq(tsigKeys.id, id))
      .returning();
    return key;
  }

  async deleteKey(id: string): Promise<void> {
    await this.ensureDb();
    await db.delete(tsigKeys).where(eq(tsigKeys.id, id));
  }

  // â”€â”€ Log Entries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getLogs(filter?: LogFilter): Promise<LogEntry[]> {
    await this.ensureDb();
    let query = db.select().from(logEntries);
    const conditions = [];

    if (filter?.level) {
      conditions.push(eq(logEntries.level, filter.level as any));
    }
    if (filter?.source) {
      conditions.push(eq(logEntries.source, filter.source));
    }
    if (filter?.search) {
      // Escape LIKE special characters to prevent injection
      const escaped = filter.search.replace(/[%_\\]/g, "\\$&");
      conditions.push(like(logEntries.message, `%${escaped}%`));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return (query as any).orderBy(desc(logEntries.timestamp)).limit(filter?.limit || 200);
  }

  async insertLog(entry: InsertLogEntry): Promise<LogEntry> {
    await this.ensureDb();
    const [log] = await db.insert(logEntries).values({
      ...entry,
      timestamp: new Date().toISOString(),
    }).returning();
    return log;
  }

  async clearLogs(): Promise<void> {
    await this.ensureDb();
    await db.delete(logEntries);
  }

  // â”€â”€ Config Snapshots â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getConfig(section: string): Promise<ConfigSnapshot | undefined> {
    await this.ensureDb();
    const [config] = await db.select().from(configSnapshots)
      .where(eq(configSnapshots.section, section))
      .orderBy(desc(configSnapshots.appliedAt))
      .limit(1);
    return config;
  }

  async saveConfig(section: string, content: string): Promise<ConfigSnapshot> {
    await this.ensureDb();
    const [config] = await db.insert(configSnapshots).values({
      section,
      content,
      appliedAt: new Date().toISOString(),
    }).returning();
    return config;
  }

  // â”€â”€ Connections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getConnections(): Promise<Connection[]> {
    await this.ensureDb();
    return db.select().from(connections).orderBy(connections.name);
  }

  async getConnection(id: string): Promise<Connection | undefined> {
    await this.ensureDb();
    const [conn] = await db.select().from(connections).where(eq(connections.id, id)).limit(1);
    return conn;
  }

  async getActiveConnection(): Promise<Connection | undefined> {
    await this.ensureDb();
    const [conn] = await db.select().from(connections)
      .where(eq(connections.isActive, true))
      .limit(1);
    return conn;
  }

  async createConnection(insertConn: InsertConnection): Promise<Connection> {
    await this.ensureDb();
    const [conn] = await db.insert(connections).values({
      ...insertConn,
      createdAt: new Date().toISOString(),
    }).returning();
    return conn;
  }

  async updateConnection(id: string, data: Partial<Connection>): Promise<Connection> {
    await this.ensureDb();
    const [conn] = await db.update(connections)
      .set(data)
      .where(eq(connections.id, id))
      .returning();
    return conn;
  }

  async deleteConnection(id: string): Promise<void> {
    await this.ensureDb();
    await db.delete(connections).where(eq(connections.id, id));
  }

  async activateConnection(id: string): Promise<Connection> {
    await this.ensureDb();
    await this.deactivateAllConnections();
    const [conn] = await db.update(connections)
      .set({ isActive: true })
      .where(eq(connections.id, id))
      .returning();
    return conn;
  }

  async deactivateAllConnections(): Promise<void> {
    await this.ensureDb();
    await db.update(connections).set({ isActive: false });
  }

  // â”€â”€ RPZ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  /** @deprecated Use getRpzZoneData() for BIND9 sync or getRpzEntriesPaged() for UI */
  async getRpzEntries(): Promise<RpzEntry[]> {
    await this.ensureDb();
    return db.select().from(rpzEntries).orderBy(rpzEntries.name);
  }

  /** Fetch only name/type/target for BIND9 zone file writing (avoids loading full rows) */
  async getRpzZoneData(): Promise<Array<{ name: string; type: string; target?: string }>> {
    await this.ensureDb();
    const rows = await db.select({ name: rpzEntries.name, type: rpzEntries.type, target: rpzEntries.target }).from(rpzEntries);
    return rows.map((r: { name: string; type: string; target: string | null }) => ({ name: r.name, type: r.type, target: r.target || undefined }));
  }

  async createRpzEntry(insertEntry: InsertRpzEntry): Promise<RpzEntry> {
    await this.ensureDb();
    const [entry] = await db.insert(rpzEntries).values({
      ...insertEntry,
      createdAt: new Date().toISOString(),
    }).returning();
    return entry;
  }

  async deleteRpzEntry(id: string): Promise<boolean> {
    await this.ensureDb();
    const result = await db.delete(rpzEntries).where(eq(rpzEntries.id, id)).returning();
    return result.length > 0;
  }

  async getRpzExistingNames(names: string[]): Promise<Set<string>> {
    await this.ensureDb();
    if (names.length === 0) return new Set();
    // Query in batches to avoid SQL param limit (SQLite max 999 default, but better-sqlite3 handles more)
    const BATCH = 5000;
    const existing = new Set<string>();
    for (let i = 0; i < names.length; i += BATCH) {
      const batch = names.slice(i, i + BATCH);
      const rows = await db.select({ name: rpzEntries.name })
        .from(rpzEntries)
        .where(inArray(rpzEntries.name, batch));
      for (const row of rows) existing.add(row.name);
    }
    return existing;
  }

  async createRpzEntriesBatch(entries: InsertRpzEntry[]): Promise<number> {
    await this.ensureDb();
    const BATCH_SIZE = 500;
    let inserted = 0;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE).map(e => ({
        ...e,
        createdAt: new Date().toISOString(),
      }));
      try {
        const result = await db.insert(rpzEntries).values(batch).onConflictDoNothing().returning();
        inserted += result.length;
      } catch (batchErr) {
        // Fallback: try one by one for this batch
        console.warn(`[rpz] Batch insert failed, falling back to one-by-one: ${batchErr instanceof Error ? batchErr.message : String(batchErr)}`);
        for (const entry of batch) {
          try {
            const [row] = await db.insert(rpzEntries).values(entry).onConflictDoNothing().returning();
            if (row) inserted++;
          } catch {
            // Skip individual duplicates/errors silently
          }
        }
      }
    }
    return inserted;
  }

  async clearRpzEntries(): Promise<void> {
    await this.ensureDb();
    await db.delete(rpzEntries);
  }

  async getRpzEntriesPaged(opts: { page: number; limit: number; search: string; type: string }): Promise<{
    entries: RpzEntry[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    await this.ensureDb();
    const conditions = [];
    if (opts.search) {
      // Escape SQL LIKE special characters to prevent injection
      const escaped = opts.search.replace(/[%_\\]/g, "\\$&");
      conditions.push(like(rpzEntries.name, `%${escaped}%`));
    }
    if (opts.type && ["nxdomain", "nodata", "redirect"].includes(opts.type)) {
      conditions.push(eq(rpzEntries.type, opts.type as "nxdomain" | "nodata" | "redirect"));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(rpzEntries).where(where);
    const total = Number(countResult[0]?.count || 0);
    const totalPages = Math.ceil(total / opts.limit);

    // Fetch page
    const offset = (opts.page - 1) * opts.limit;
    const entries = await db.select().from(rpzEntries)
      .where(where)
      .orderBy(rpzEntries.name)
      .limit(opts.limit)
      .offset(offset);

    return { entries, total, page: opts.page, limit: opts.limit, totalPages };
  }

  async getRpzStats(): Promise<{ total: number; nxdomain: number; nodata: number; redirect: number }> {
    await this.ensureDb();
    const result = await db.select({
      type: rpzEntries.type,
      count: sql<number>`count(*)`,
    }).from(rpzEntries).groupBy(rpzEntries.type);

    const stats = { total: 0, nxdomain: 0, nodata: 0, redirect: 0 };
    for (const row of result) {
      stats.total += Number(row.count);
      if (row.type === "nxdomain") stats.nxdomain = Number(row.count);
      if (row.type === "nodata") stats.nodata = Number(row.count);
      if (row.type === "redirect") stats.redirect = Number(row.count);
    }
    return stats;
  }

  // â”€â”€ IP Blacklist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private static readonly BAN_THRESHOLD = 10;      // attempts before auto-ban
  private static readonly BAN_DURATION_MS = 24 * 60 * 60 * 1000; // 24h default ban

  async getIpBlacklist(): Promise<IpBlacklist[]> {
    await this.ensureDb();
    return db.select().from(ipBlacklist).orderBy(desc(ipBlacklist.bannedAt));
  }

  async isIpBanned(ip: string): Promise<boolean> {
    await this.ensureDb();
    const row = await db.select().from(ipBlacklist).where(eq(ipBlacklist.ip, ip)).limit(1);
    if (row.length === 0) return false;
    const entry = row[0];
    // If expiresAt is set and has passed, the ban is expired
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
      await db.delete(ipBlacklist).where(eq(ipBlacklist.ip, ip));
      return false;
    }
    return true;
  }

  async recordFailedAttempt(ip: string, reason: "login_failed" | "api_abuse" | "brute_force" | "manual"): Promise<void> {
    await this.ensureDb();
    const existing = await db.select().from(ipBlacklist).where(eq(ipBlacklist.ip, ip)).limit(1);

    if (existing.length > 0) {
      const entry = existing[0];
      const newCount = entry.attemptCount + 1;
      // If threshold reached and not already banned, auto-ban
      if (newCount >= DatabaseStorage.BAN_THRESHOLD && !entry.expiresAt && entry.reason !== "manual") {
        const expiresAt = new Date(Date.now() + DatabaseStorage.BAN_DURATION_MS).toISOString();
        await db.update(ipBlacklist).set({
          attemptCount: newCount,
          reason: "brute_force",
          bannedAt: new Date().toISOString(),
          expiresAt,
        }).where(eq(ipBlacklist.ip, ip));
      } else {
        await db.update(ipBlacklist).set({
          attemptCount: newCount,
        }).where(eq(ipBlacklist.ip, ip));
      }
    } else {
      // First offense â€” just record it, don't ban yet
      await db.insert(ipBlacklist).values({
        ip,
        attemptCount: 1,
        reason,
        bannedAt: new Date().toISOString(),
        expiresAt: null,
      });
    }
  }

  async unbanIp(ip: string): Promise<void> {
    await this.ensureDb();
    await db.delete(ipBlacklist).where(eq(ipBlacklist.ip, ip));
  }

  async banIp(ip: string, reason: "login_failed" | "api_abuse" | "brute_force" | "manual", durationMs?: number): Promise<void> {
    await this.ensureDb();
    const expiresAt = durationMs ? new Date(Date.now() + durationMs).toISOString() : null;
    // Upsert: if IP already tracked, update; otherwise insert
    const existing = await db.select().from(ipBlacklist).where(eq(ipBlacklist.ip, ip)).limit(1);
    if (existing.length > 0) {
      await db.update(ipBlacklist).set({
        reason,
        bannedAt: new Date().toISOString(),
        expiresAt,
      }).where(eq(ipBlacklist.ip, ip));
    } else {
      await db.insert(ipBlacklist).values({
        ip,
        attemptCount: 0,
        reason,
        bannedAt: new Date().toISOString(),
        expiresAt,
      });
    }
  }

  async cleanupExpiredBans(): Promise<void> {
    await this.ensureDb();
    const now = new Date().toISOString();
    await db.delete(ipBlacklist).where(
      and(
        sql`${ipBlacklist.expiresAt} IS NOT NULL`,
        sql`${ipBlacklist.expiresAt} < ${now}`
      )
    );
  }

  // â”€â”€ API Tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getApiTokens(): Promise<ApiToken[]> {
    await this.ensureDb();
    return db.select({
      id: apiTokens.id,
      name: apiTokens.name,
      tokenHash: apiTokens.tokenHash,
      tokenPrefix: apiTokens.tokenPrefix,
      permissions: apiTokens.permissions,
      createdBy: apiTokens.createdBy,
      lastUsedAt: apiTokens.lastUsedAt,
      expiresAt: apiTokens.expiresAt,
      createdAt: apiTokens.createdAt,
    }).from(apiTokens).orderBy(desc(apiTokens.createdAt));
  }

  async getApiTokenByHash(tokenHash: string): Promise<ApiToken | undefined> {
    await this.ensureDb();
    const rows = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, tokenHash)).limit(1);
    if (rows.length === 0) return undefined;
    const token = rows[0];
    // Check expiry
    if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
      await db.delete(apiTokens).where(eq(apiTokens.id, token.id));
      return undefined;
    }
    return token;
  }

  async createApiToken(data: { name: string; tokenHash: string; tokenPrefix: string; permissions: string; createdBy: string; expiresAt?: string }): Promise<ApiToken> {
    await this.ensureDb();
    const [token] = await db.insert(apiTokens).values({
      name: data.name,
      tokenHash: data.tokenHash,
      tokenPrefix: data.tokenPrefix,
      permissions: data.permissions,
      createdBy: data.createdBy,
      expiresAt: data.expiresAt || null,
    }).returning();
    return token;
  }

  async deleteApiToken(id: string): Promise<boolean> {
    await this.ensureDb();
    const result = await db.delete(apiTokens).where(eq(apiTokens.id, id)).returning();
    return result.length > 0;
  }

  async updateTokenLastUsed(tokenHash: string): Promise<void> {
    await this.ensureDb();
    await db.update(apiTokens).set({
      lastUsedAt: new Date().toISOString(),
    }).where(eq(apiTokens.tokenHash, tokenHash));
  }

  // â”€â”€ Domain Jailing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getUserDomains(userId: string): Promise<UserDomain[]> {
    await this.ensureDb();
    return db.select().from(userDomains).where(eq(userDomains.userId, userId));
  }

  async setUserDomains(userId: string, zoneIds: string[]): Promise<void> {
    await this.ensureDb();
    // Delete existing assignments
    await db.delete(userDomains).where(eq(userDomains.userId, userId));
    // Insert new assignments
    if (zoneIds.length > 0) {
      await db.insert(userDomains).values(
        zoneIds.map(zoneId => ({
          userId,
          zoneId,
        }))
      );
    }
  }

  async isZoneAccessibleByUser(zoneId: string, userId: string, userRole: string): Promise<boolean> {
    // Admins and operators can access all zones
    if (userRole === "admin" || userRole === "operator") return true;
    // Viewers are restricted to their assigned domains
    await this.ensureDb();
    const assignments = await db.select().from(userDomains)
      .where(and(eq(userDomains.userId, userId), eq(userDomains.zoneId, zoneId)))
      .limit(1);
    return assignments.length > 0;
  }

  // â”€â”€ Replication Servers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getReplicationServers(): Promise<ReplicationServer[]> {
    await this.ensureDb();
    return db.select().from(replicationServers).orderBy(replicationServers.name);
  }

  async getReplicationServer(id: string): Promise<ReplicationServer | undefined> {
    await this.ensureDb();
    const [server] = await db.select().from(replicationServers).where(eq(replicationServers.id, id)).limit(1);
    return server;
  }

  async createReplicationServer(data: Omit<ReplicationServer, "id" | "createdAt" | "lastSyncAt" | "lastSyncStatus">): Promise<ReplicationServer> {
    await this.ensureDb();
    const [server] = await db.insert(replicationServers).values({
      ...data,
      createdAt: new Date().toISOString(),
    }).returning();
    return server;
  }

  async updateReplicationServer(id: string, data: Partial<ReplicationServer>): Promise<ReplicationServer> {
    await this.ensureDb();
    const [server] = await db.update(replicationServers).set(data).where(eq(replicationServers.id, id)).returning();
    if (!server) throw new Error("Replication server not found");
    return server;
  }

  async deleteReplicationServer(id: string): Promise<boolean> {
    await this.ensureDb();
    const result = await db.delete(replicationServers).where(eq(replicationServers.id, id)).returning();
    return result.length > 0;
  }

  async updateReplicationSyncStatus(id: string, status: ReplicationServer["lastSyncStatus"]): Promise<void> {
    await this.ensureDb();
    await db.update(replicationServers).set({
      lastSyncStatus: status,
      lastSyncAt: status === "success" || status === "failed" ? new Date().toISOString() : undefined,
    }).where(eq(replicationServers.id, id));
  }

  // â”€â”€ Replication Conflicts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getReplicationConflicts(resolved?: boolean): Promise<ReplicationConflict[]> {
    await this.ensureDb();
    if (resolved !== undefined) {
      return db.select().from(replicationConflicts)
        .where(eq(replicationConflicts.resolved, resolved))
        .orderBy(desc(replicationConflicts.detectedAt));
    }
    return db.select().from(replicationConflicts).orderBy(desc(replicationConflicts.detectedAt));
  }

  async createReplicationConflict(data: Omit<ReplicationConflict, "id" | "detectedAt" | "resolvedAt">): Promise<ReplicationConflict> {
    await this.ensureDb();
    const [conflict] = await db.insert(replicationConflicts).values({
      ...data,
      detectedAt: new Date().toISOString(),
    }).returning();
    return conflict;
  }

  async resolveReplicationConflict(id: string): Promise<void> {
    await this.ensureDb();
    await db.update(replicationConflicts).set({
      resolved: true,
      resolvedAt: new Date().toISOString(),
    }).where(eq(replicationConflicts.id, id));
  }

  async resolveAllReplicationConflicts(): Promise<void> {
    await this.ensureDb();
    await db.update(replicationConflicts).set({
      resolved: true,
      resolvedAt: new Date().toISOString(),
    }).where(eq(replicationConflicts.resolved, false));
  }

  // â”€â”€ Replication Zone Bindings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getReplicationZoneBindings(serverId?: string, zoneId?: string): Promise<ReplicationZoneBinding[]> {
    await this.ensureDb();
    const conditions = [];
    if (serverId) conditions.push(eq(replicationZoneBindings.serverId, serverId));
    if (zoneId) conditions.push(eq(replicationZoneBindings.zoneId, zoneId));
    if (conditions.length > 0) {
      return db.select().from(replicationZoneBindings).where(and(...conditions));
    }
    return db.select().from(replicationZoneBindings);
  }

  async setReplicationZoneBindings(serverId: string, bindings: { zoneId: string; mode: "push" | "pull" | "both"; enabled: boolean }[]): Promise<void> {
    await this.ensureDb();
    // Delete existing bindings for this server
    await db.delete(replicationZoneBindings).where(eq(replicationZoneBindings.serverId, serverId));
    // Insert new bindings
    if (bindings.length > 0) {
      await db.insert(replicationZoneBindings).values(
        bindings.map(b => ({
          serverId,
          zoneId: b.zoneId,
          mode: b.mode,
          enabled: b.enabled,
          createdAt: new Date().toISOString(),
        }))
      );
    }
  }

  async getReplicationZoneBinding(serverId: string, zoneId: string): Promise<ReplicationZoneBinding | undefined> {
    await this.ensureDb();
    const [binding] = await db.select().from(replicationZoneBindings)
      .where(and(eq(replicationZoneBindings.serverId, serverId), eq(replicationZoneBindings.zoneId, zoneId)))
      .limit(1);
    return binding;
  }

  // â”€â”€ Health Checks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getHealthChecks(serverId?: string, limit = 100): Promise<HealthCheck[]> {
    await this.ensureDb();
    if (serverId) {
      return db.select().from(healthChecks)
        .where(eq(healthChecks.serverId, serverId))
        .orderBy(desc(healthChecks.checkedAt))
        .limit(limit);
    }
    return db.select().from(healthChecks)
      .orderBy(desc(healthChecks.checkedAt))
      .limit(limit);
  }

  async getLatestHealthCheck(serverId: string): Promise<HealthCheck | undefined> {
    await this.ensureDb();
    const [check] = await db.select().from(healthChecks)
      .where(eq(healthChecks.serverId, serverId))
      .orderBy(desc(healthChecks.checkedAt))
      .limit(1);
    return check;
  }

  async createHealthCheck(data: Omit<HealthCheck, "id" | "checkedAt">): Promise<HealthCheck> {
    await this.ensureDb();
    const [check] = await db.insert(healthChecks).values({
      ...data,
      checkedAt: new Date().toISOString(),
    }).returning();
    return check;
  }

  // â”€â”€ Notification Channels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getNotificationChannels(): Promise<NotificationChannel[]> {
    await this.ensureDb();
    return db.select().from(notificationChannels);
  }

  async getNotificationChannel(id: string): Promise<NotificationChannel | undefined> {
    await this.ensureDb();
    const [channel] = await db.select().from(notificationChannels)
      .where(eq(notificationChannels.id, id))
      .limit(1);
    return channel;
  }

  async createNotificationChannel(data: Omit<NotificationChannel, "id" | "createdAt">): Promise<NotificationChannel> {
    await this.ensureDb();
    const [channel] = await db.insert(notificationChannels).values({
      ...data,
      createdAt: new Date().toISOString(),
    }).returning();
    return channel;
  }

  async updateNotificationChannel(id: string, data: Partial<NotificationChannel>): Promise<NotificationChannel> {
    await this.ensureDb();
    const [channel] = await db.update(notificationChannels).set(data)
      .where(eq(notificationChannels.id, id))
      .returning();
    return channel;
  }

  async deleteNotificationChannel(id: string): Promise<boolean> {
    await this.ensureDb();
    const result = await db.delete(notificationChannels).where(eq(notificationChannels.id, id));
    return (result as any).changes > 0;
  }

  // â”€â”€ Sync History â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getSyncHistory(serverId?: string, limit = 100): Promise<SyncHistoryEntry[]> {
    await this.ensureDb();
    if (serverId) {
      return db.select().from(syncHistory)
        .where(eq(syncHistory.serverId, serverId))
        .orderBy(desc(syncHistory.createdAt))
        .limit(limit);
    }
    return db.select().from(syncHistory)
      .orderBy(desc(syncHistory.createdAt))
      .limit(limit);
  }

  async createSyncHistoryEntry(data: Omit<SyncHistoryEntry, "id" | "createdAt">): Promise<SyncHistoryEntry> {
    await this.ensureDb();
    const [entry] = await db.insert(syncHistory).values({
      ...data,
      createdAt: new Date().toISOString(),
    }).returning();
    return entry;
  }

  async getSyncMetrics(serverId?: string): Promise<{ total: number; success: number; failed: number; avgDurationMs: number }> {
    await this.ensureDb();
    const entries = serverId
      ? await db.select().from(syncHistory).where(eq(syncHistory.serverId, serverId))
      : await db.select().from(syncHistory);
    const total = entries.length;
    const success = entries.filter((e: SyncHistoryEntry) => e.success).length;
    const failed = total - success;
    const withDuration = entries.filter((e: SyncHistoryEntry) => e.durationMs != null);
    const avgDurationMs = withDuration.length > 0
      ? Math.round(withDuration.reduce((sum: number, e: SyncHistoryEntry) => sum + (e.durationMs || 0), 0) / withDuration.length)
      : 0;
    return { total, success, failed, avgDurationMs };
  }

  // â”€â”€ DNSSEC Keys â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getDnssecKeys(zoneId?: string): Promise<DnssecKey[]> {
    await this.ensureDb();
    if (zoneId) {
      return db.select().from(dnssecKeys)
        .where(eq(dnssecKeys.zoneId, zoneId))
        .orderBy(desc(dnssecKeys.createdAt));
    }
    return db.select().from(dnssecKeys)
      .orderBy(desc(dnssecKeys.createdAt));
  }

  async getDnssecKey(id: string): Promise<DnssecKey | undefined> {
    await this.ensureDb();
    const [key] = await db.select().from(dnssecKeys)
      .where(eq(dnssecKeys.id, id))
      .limit(1);
    return key;
  }

  async createDnssecKey(data: Omit<DnssecKey, "id" | "createdAt">): Promise<DnssecKey> {
    await this.ensureDb();
    const [key] = await db.insert(dnssecKeys).values({
      ...data,
      createdAt: new Date().toISOString(),
    }).returning();
    return key;
  }

  async updateDnssecKey(id: string, data: Partial<DnssecKey>): Promise<DnssecKey> {
    await this.ensureDb();
    const [key] = await db.update(dnssecKeys).set(data)
      .where(eq(dnssecKeys.id, id))
      .returning();
    return key;
  }

  async deleteDnssecKey(id: string): Promise<boolean> {
    await this.ensureDb();
    const result = await db.delete(dnssecKeys).where(eq(dnssecKeys.id, id));
    return (result as any).changes > 0;
  }

  // â”€â”€ Backups â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getBackups(type?: string): Promise<Backup[]> {
    await this.ensureDb();
    if (type) {
      return db.select().from(backups)
        .where(eq(backups.type, type as "auto" | "manual" | "snapshot"))
        .orderBy(desc(backups.createdAt));
    }
    return db.select().from(backups)
      .orderBy(desc(backups.createdAt));
  }

  async getBackup(id: string): Promise<Backup | undefined> {
    await this.ensureDb();
    const [b] = await db.select().from(backups)
      .where(eq(backups.id, id))
      .limit(1);
    return b;
  }

  async createBackup(data: Omit<Backup, "id" | "createdAt">): Promise<Backup> {
    await this.ensureDb();
    const [b] = await db.insert(backups).values({
      ...data,
      createdAt: new Date().toISOString(),
    }).returning();
    return b;
  }

  async deleteBackup(id: string): Promise<boolean> {
    await this.ensureDb();
    const result = await db.delete(backups).where(eq(backups.id, id));
    return (result as any).changes > 0;
  }
}

export const storage = new DatabaseStorage();

