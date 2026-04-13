// Copyright © 2025 Stephane ASSOGBA
// MySQL schema for BIND9 Web UI — mirror of schema.ts using mysqlTable
import { mysqlTable, text, int, boolean, mysqlEnum, varchar } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Users ────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: varchar("username", { length: 255 }).notNull().unique(),
  password: text("password").notNull(),
  role: mysqlEnum("role", ["admin", "operator", "viewer"]).notNull().default("viewer"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: varchar("created_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
}).extend({
  password: z.string().min(8, "Password must be at least 8 characters"),
  username: z.string().min(2, "Username must be at least 2 characters").regex(/^[a-zA-Z0-9._-]+$/, "Username contains invalid characters"),
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ── DNS Zones ────────────────────────────────────────────────────
export const zones = mysqlTable("zones", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  domain: varchar("domain", { length: 255 }).notNull().unique(),
  type: mysqlEnum("type", ["master", "slave", "forward"]).notNull().default("master"),
  status: mysqlEnum("status", ["active", "disabled", "syncing"]).notNull().default("active"),
  serial: varchar("serial", { length: 64 }).notNull().default(""),
  filePath: varchar("file_path", { length: 512 }).notNull().default(""),
  adminEmail: varchar("admin_email", { length: 255 }).default(""),
  createdAt: varchar("created_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: varchar("updated_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertZoneSchema = createInsertSchema(zones).pick({
  domain: true,
  type: true,
  adminEmail: true,
});
export type InsertZone = z.infer<typeof insertZoneSchema>;
export type Zone = typeof zones.$inferSelect;

// ── DNS Records ──────────────────────────────────────────────────
export const dnsRecords = mysqlTable("dns_records", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  zoneId: varchar("zone_id", { length: 36 }).notNull().references(() => zones.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "PTR", "SRV"]).notNull(),
  value: text("value").notNull(),
  ttl: int("ttl").notNull().default(3600),
  priority: int("priority"),
});

export const insertDnsRecordSchema = createInsertSchema(dnsRecords).pick({
  zoneId: true,
  name: true,
  type: true,
  value: true,
  ttl: true,
  priority: true,
});
export type InsertDnsRecord = z.infer<typeof insertDnsRecordSchema>;
export type DnsRecord = typeof dnsRecords.$inferSelect;

// ── ACLs ─────────────────────────────────────────────────────────
export const acls = mysqlTable("acls", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull().unique(),
  networks: text("networks").notNull(),
  comment: text("comment").default(""),
  createdAt: varchar("created_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertAclSchema = createInsertSchema(acls).pick({
  name: true,
  networks: true,
  comment: true,
});
export type InsertAcl = z.infer<typeof insertAclSchema>;
export type Acl = typeof acls.$inferSelect;

// ── TSIG Keys ────────────────────────────────────────────────────
export const tsigKeys = mysqlTable("tsig_keys", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull().unique(),
  algorithm: mysqlEnum("algorithm", ["hmac-sha256", "hmac-sha512", "hmac-md5"]).notNull().default("hmac-sha256"),
  secret: text("secret").notNull(),
  createdAt: varchar("created_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertTsigKeySchema = createInsertSchema(tsigKeys).pick({
  name: true,
  algorithm: true,
  secret: true,
});
export type InsertTsigKey = z.infer<typeof insertTsigKeySchema>;
export type TsigKey = typeof tsigKeys.$inferSelect;

// ── Config Snapshots ─────────────────────────────────────────────
export const configSnapshots = mysqlTable("config_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  section: varchar("section", { length: 64 }).notNull(),
  content: text("content").notNull(),
  appliedAt: varchar("applied_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export type ConfigSnapshot = typeof configSnapshots.$inferSelect;

// ── SSH Connections ──────────────────────────────────────────────
export const connections = mysqlTable("connections", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  host: varchar("host", { length: 255 }).notNull(),
  port: int("port").notNull().default(22),
  username: varchar("username", { length: 255 }).notNull().default("root"),
  authType: mysqlEnum("auth_type", ["password", "key"]).notNull().default("password"),
  password: text("password").default(""),
  privateKey: text("private_key").default(""),
  bind9ConfDir: varchar("bind9_conf_dir", { length: 512 }).default(""),
  bind9ZoneDir: varchar("bind9_zone_dir", { length: 512 }).default(""),
  rndcBin: varchar("rndc_bin", { length: 255 }).default("rndc"),
  isActive: boolean("is_active").notNull().default(false),
  lastStatus: mysqlEnum("last_status", ["connected", "failed", "unknown"]).default("unknown"),
  createdAt: varchar("created_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertConnectionSchema = createInsertSchema(connections).pick({
  name: true,
  host: true,
  port: true,
  username: true,
  authType: true,
  password: true,
  privateKey: true,
  bind9ConfDir: true,
  bind9ZoneDir: true,
  rndcBin: true,
});
export type InsertConnection = z.infer<typeof insertConnectionSchema>;
export type Connection = typeof connections.$inferSelect;

// ── Log Entries ──────────────────────────────────────────────────
export const logEntries = mysqlTable("log_entries", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  timestamp: varchar("timestamp", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
  level: mysqlEnum("level", ["INFO", "WARN", "ERROR", "DEBUG"]).notNull().default("INFO"),
  source: varchar("source", { length: 64 }).notNull().default("general"),
  message: text("message").notNull(),
});

export const insertLogEntrySchema = createInsertSchema(logEntries).pick({
  level: true,
  source: true,
  message: true,
});
export type InsertLogEntry = z.infer<typeof insertLogEntrySchema>;
export type LogEntry = typeof logEntries.$inferSelect;

// ── RPZ Entries (DNS Firewall) ───────────────────────────────────
export const rpzEntries = mysqlTable("rpz_entries", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull().unique(),
  type: mysqlEnum("type", ["nxdomain", "nodata", "redirect"]).notNull().default("nxdomain"),
  target: varchar("target", { length: 255 }).default(""),
  comment: text("comment").default(""),
  createdAt: varchar("created_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertRpzEntrySchema = createInsertSchema(rpzEntries).pick({
  name: true,
  type: true,
  target: true,
  comment: true,
});
export type InsertRpzEntry = z.infer<typeof insertRpzEntrySchema>;
export type RpzEntry = typeof rpzEntries.$inferSelect;

// ── IP Blacklist ─────────────────────────────────────────────────
export const ipBlacklist = mysqlTable("ip_blacklist", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  ip: varchar("ip", { length: 45 }).notNull().unique(),
  attemptCount: int("attempt_count").notNull().default(1),
  reason: mysqlEnum("reason", ["login_failed", "api_abuse", "brute_force", "manual"]).notNull().default("login_failed"),
  bannedAt: varchar("banned_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
  expiresAt: varchar("expires_at", { length: 64 }),
  createdAt: varchar("created_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export type IpBlacklist = typeof ipBlacklist.$inferSelect;

// ── API Tokens ──────────────────────────────────────────────────
export const apiTokens = mysqlTable("api_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  tokenPrefix: varchar("token_prefix", { length: 16 }).notNull(),
  permissions: text("permissions").notNull().default("*"),
  createdBy: varchar("created_by", { length: 36 }).notNull(),
  lastUsedAt: varchar("last_used_at", { length: 64 }),
  expiresAt: varchar("expires_at", { length: 64 }),
  createdAt: varchar("created_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export type ApiToken = typeof apiTokens.$inferSelect;

// ── User-Domain assignments (Domain Jailing) ────────────────────
export const userDomains = mysqlTable("user_domains", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).notNull(),
  zoneId: varchar("zone_id", { length: 36 }).notNull(),
  createdAt: varchar("created_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export type UserDomain = typeof userDomains.$inferSelect;

// ── Replication Servers ─────────────────────────────────────────
export const replicationServers = mysqlTable("replication_servers", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  host: varchar("host", { length: 255 }).notNull(),
  port: int("port").notNull().default(22),
  username: varchar("username", { length: 255 }).notNull().default("root"),
  authType: mysqlEnum("auth_type", ["password", "key"]).notNull().default("password"),
  password: text("password").default(""),
  privateKey: text("private_key").default(""),
  bind9ConfDir: varchar("bind9_conf_dir", { length: 512 }).default("/etc/bind"),
  bind9ZoneDir: varchar("bind9_zone_dir", { length: 512 }).default("/var/lib/bind"),
  role: mysqlEnum("role", ["slave", "secondary"]).notNull().default("slave"),
  lastSyncAt: varchar("last_sync_at", { length: 64 }),
  lastSyncStatus: mysqlEnum("last_sync_status", ["success", "failed", "pending", "never"]).notNull().default("never"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: varchar("created_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export type ReplicationServer = typeof replicationServers.$inferSelect;

// ── Replication Conflicts ───────────────────────────────────────
export const replicationConflicts = mysqlTable("replication_conflicts", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  serverId: varchar("server_id", { length: 36 }).notNull(),
  zoneDomain: varchar("zone_domain", { length: 255 }).notNull(),
  masterSerial: varchar("master_serial", { length: 64 }),
  slaveSerial: varchar("slave_serial", { length: 64 }),
  conflictType: mysqlEnum("conflict_type", ["serial_mismatch", "zone_missing", "soa_mismatch", "config_mismatch"]).notNull(),
  details: text("details").default(""),
  resolved: boolean("resolved").notNull().default(false),
  detectedAt: varchar("detected_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
  resolvedAt: varchar("resolved_at", { length: 64 }),
});

export type ReplicationConflict = typeof replicationConflicts.$inferSelect;

// ── Replication Zone Bindings (per-zone replication control) ────
export const replicationZoneBindings = mysqlTable("replication_zone_bindings", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  serverId: varchar("server_id", { length: 36 }).notNull(),
  zoneId: varchar("zone_id", { length: 36 }).notNull(),
  mode: mysqlEnum("mode", ["push", "pull", "both"]).notNull().default("push"),
  enabled: boolean("enabled").notNull().default(true),
  lastSyncAt: varchar("last_sync_at", { length: 64 }),
  createdAt: varchar("created_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export type ReplicationZoneBinding = typeof replicationZoneBindings.$inferSelect;

// ── Health Checks ──────────────────────────────────────────────
export const healthChecks = mysqlTable("health_checks", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  serverId: varchar("server_id", { length: 36 }).notNull(),
  status: mysqlEnum("status", ["healthy", "degraded", "down"]).notNull(),
  latencyMs: int("latency_ms"),
  details: text("details").default(""),
  checkedAt: varchar("checked_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export type HealthCheck = typeof healthChecks.$inferSelect;

// ── Notification Channels ──────────────────────────────────────
export const notificationChannels = mysqlTable("notification_channels", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["email", "webhook", "slack"]).notNull(),
  config: text("config").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  events: text("events").notNull().default("server_down,conflict_detected,health_degraded"),
  createdAt: varchar("created_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export type NotificationChannel = typeof notificationChannels.$inferSelect;

// ── Sync History ──────────────────────────────────────────────
export const syncHistory = mysqlTable("sync_history", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  serverId: varchar("server_id", { length: 36 }).notNull(),
  zoneDomain: varchar("zone_domain", { length: 255 }).notNull(),
  action: mysqlEnum("action", ["push", "pull", "notify"]).notNull(),
  success: boolean("success").notNull(),
  durationMs: int("duration_ms"),
  details: text("details").default(""),
  createdAt: varchar("created_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export type SyncHistoryEntry = typeof syncHistory.$inferSelect;

// ── DNSSEC Keys ───────────────────────────────────────────────
export const dnssecKeys = mysqlTable("dnssec_keys", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  zoneId: varchar("zone_id", { length: 36 }).notNull(),
  keyTag: varchar("key_tag", { length: 64 }).notNull(),
  keyType: mysqlEnum("key_type", ["KSK", "ZSK"]).notNull(),
  algorithm: varchar("algorithm", { length: 64 }).notNull().default("ECDSAP256SHA256"),
  keySize: int("key_size").notNull().default(256),
  status: mysqlEnum("status", ["active", "published", "retired", "revoked"]).notNull().default("active"),
  filePath: varchar("file_path", { length: 512 }),
  createdAt: varchar("created_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
  activatedAt: varchar("activated_at", { length: 64 }),
  retiredAt: varchar("retired_at", { length: 64 }),
});

export type DnssecKey = typeof dnssecKeys.$inferSelect;

// ── Backups ───────────────────────────────────────────────────
export const backups = mysqlTable("backups", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: mysqlEnum("type", ["auto", "manual", "snapshot"]).notNull(),
  scope: mysqlEnum("scope", ["full", "zones", "configs", "single_zone"]).notNull(),
  zoneId: varchar("zone_id", { length: 36 }),
  filePath: varchar("file_path", { length: 512 }).notNull(),
  sizeBytes: int("size_bytes"),
  description: text("description").default(""),
  createdAt: varchar("created_at", { length: 64 }).notNull().$defaultFn(() => new Date().toISOString()),
});

export type Backup = typeof backups.$inferSelect;
