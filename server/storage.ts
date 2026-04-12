// Copyright © 2025 Stephane ASSOGBA
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
  deleteKey(id: string): Promise<void>;
  // RPZ
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

  // ── Users ────────────────────────────────────────────
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

  // ── Zones ────────────────────────────────────────────
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
    const [zone] = await db.insert(zones).values({
      ...insertZone,
      serial,
      status: "active",
      filePath: `/var/cache/bind/db.${insertZone.domain}`,
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

  // ── DNS Records ──────────────────────────────────────
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

  // ── ACLs ─────────────────────────────────────────────
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

  // ── TSIG Keys ────────────────────────────────────────
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

  async deleteKey(id: string): Promise<void> {
    await this.ensureDb();
    await db.delete(tsigKeys).where(eq(tsigKeys.id, id));
  }

  // ── Log Entries ──────────────────────────────────────
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

  // ── Config Snapshots ─────────────────────────────────
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

  // ── Connections ──────────────────────────────────────
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

  // ── RPZ ──────────────────────────────────────────────
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
}

export const storage = new DatabaseStorage();
