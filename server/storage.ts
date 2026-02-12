import { eq, desc, like, and, sql } from "drizzle-orm";
import { db } from "./db";
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
  // ── Users ────────────────────────────────────────────
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    if (!user) throw new Error("User not found");
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // ── Zones ────────────────────────────────────────────
  async getZones(): Promise<Zone[]> {
    return db.select().from(zones).orderBy(zones.domain);
  }

  async getZone(id: string): Promise<Zone | undefined> {
    const [zone] = await db.select().from(zones).where(eq(zones.id, id)).limit(1);
    return zone;
  }

  async createZone(insertZone: InsertZone): Promise<Zone> {
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
    const [zone] = await db.update(zones)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(zones.id, id))
      .returning();
    return zone;
  }

  async deleteZone(id: string): Promise<void> {
    await db.delete(zones).where(eq(zones.id, id));
  }

  async getZoneRecordCount(zoneId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(dnsRecords)
      .where(eq(dnsRecords.zoneId, zoneId));
    return result[0]?.count || 0;
  }

  // ── DNS Records ──────────────────────────────────────
  async getRecords(zoneId: string): Promise<DnsRecord[]> {
    return db.select().from(dnsRecords).where(eq(dnsRecords.zoneId, zoneId)).orderBy(dnsRecords.name);
  }

  async getRecord(id: string): Promise<DnsRecord | undefined> {
    const [record] = await db.select().from(dnsRecords).where(eq(dnsRecords.id, id)).limit(1);
    return record;
  }

  async createRecord(record: InsertDnsRecord): Promise<DnsRecord> {
    const [created] = await db.insert(dnsRecords).values(record).returning();
    return created;
  }

  async updateRecord(id: string, data: Partial<DnsRecord>): Promise<DnsRecord> {
    const [record] = await db.update(dnsRecords)
      .set(data)
      .where(eq(dnsRecords.id, id))
      .returning();
    return record;
  }

  async deleteRecord(id: string): Promise<void> {
    await db.delete(dnsRecords).where(eq(dnsRecords.id, id));
  }

  // ── ACLs ─────────────────────────────────────────────
  async getAcls(): Promise<Acl[]> {
    return db.select().from(acls).orderBy(acls.name);
  }

  async getAcl(id: string): Promise<Acl | undefined> {
    const [acl] = await db.select().from(acls).where(eq(acls.id, id)).limit(1);
    return acl;
  }

  async createAcl(insertAcl: InsertAcl): Promise<Acl> {
    const [acl] = await db.insert(acls).values({
      ...insertAcl,
      createdAt: new Date().toISOString(),
    }).returning();
    return acl;
  }

  async updateAcl(id: string, data: Partial<Acl>): Promise<Acl> {
    const [acl] = await db.update(acls)
      .set(data)
      .where(eq(acls.id, id))
      .returning();
    return acl;
  }

  async deleteAcl(id: string): Promise<void> {
    await db.delete(acls).where(eq(acls.id, id));
  }

  // ── TSIG Keys ────────────────────────────────────────
  async getKeys(): Promise<TsigKey[]> {
    return db.select().from(tsigKeys).orderBy(tsigKeys.name);
  }

  async getKey(id: string): Promise<TsigKey | undefined> {
    const [key] = await db.select().from(tsigKeys).where(eq(tsigKeys.id, id)).limit(1);
    return key;
  }

  async createKey(insertKey: InsertTsigKey): Promise<TsigKey> {
    const [key] = await db.insert(tsigKeys).values({
      ...insertKey,
      createdAt: new Date().toISOString(),
    }).returning();
    return key;
  }

  async deleteKey(id: string): Promise<void> {
    await db.delete(tsigKeys).where(eq(tsigKeys.id, id));
  }

  // ── Log Entries ──────────────────────────────────────
  async getLogs(filter?: LogFilter): Promise<LogEntry[]> {
    let query = db.select().from(logEntries);
    const conditions = [];

    if (filter?.level) {
      conditions.push(eq(logEntries.level, filter.level as any));
    }
    if (filter?.source) {
      conditions.push(eq(logEntries.source, filter.source));
    }
    if (filter?.search) {
      conditions.push(like(logEntries.message, `%${filter.search}%`));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return (query as any).orderBy(desc(logEntries.timestamp)).limit(filter?.limit || 200);
  }

  async insertLog(entry: InsertLogEntry): Promise<LogEntry> {
    const [log] = await db.insert(logEntries).values({
      ...entry,
      timestamp: new Date().toISOString(),
    }).returning();
    return log;
  }

  async clearLogs(): Promise<void> {
    await db.delete(logEntries);
  }

  // ── Config Snapshots ─────────────────────────────────
  async getConfig(section: string): Promise<ConfigSnapshot | undefined> {
    const [config] = await db.select().from(configSnapshots)
      .where(eq(configSnapshots.section, section))
      .orderBy(desc(configSnapshots.appliedAt))
      .limit(1);
    return config;
  }

  async saveConfig(section: string, content: string): Promise<ConfigSnapshot> {
    const [config] = await db.insert(configSnapshots).values({
      section,
      content,
      appliedAt: new Date().toISOString(),
    }).returning();
    return config;
  }

  // ── Connections ──────────────────────────────────────
  async getConnections(): Promise<Connection[]> {
    return db.select().from(connections).orderBy(connections.name);
  }

  async getConnection(id: string): Promise<Connection | undefined> {
    const [conn] = await db.select().from(connections).where(eq(connections.id, id)).limit(1);
    return conn;
  }

  async getActiveConnection(): Promise<Connection | undefined> {
    const [conn] = await db.select().from(connections)
      .where(eq(connections.isActive, true))
      .limit(1);
    return conn;
  }

  async createConnection(insertConn: InsertConnection): Promise<Connection> {
    const [conn] = await db.insert(connections).values({
      ...insertConn,
      createdAt: new Date().toISOString(),
    }).returning();
    return conn;
  }

  async updateConnection(id: string, data: Partial<Connection>): Promise<Connection> {
    const [conn] = await db.update(connections)
      .set(data)
      .where(eq(connections.id, id))
      .returning();
    return conn;
  }

  async deleteConnection(id: string): Promise<void> {
    await db.delete(connections).where(eq(connections.id, id));
  }

  async activateConnection(id: string): Promise<Connection> {
    await this.deactivateAllConnections();
    const [conn] = await db.update(connections)
      .set({ isActive: true })
      .where(eq(connections.id, id))
      .returning();
    return conn;
  }

  async deactivateAllConnections(): Promise<void> {
    await db.update(connections).set({ isActive: false });
  }
}

export const storage = new DatabaseStorage();
