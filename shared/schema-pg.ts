// Copyright © 2025 Stephane ASSOGBA
// PostgreSQL schema for BIND9 Web UI — mirror of schema.ts using pgTable
import { pgTable, text, integer, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Users ────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role", { enum: ["admin", "operator", "viewer"] }).notNull().default("viewer"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
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
export const zones = pgTable("zones", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  domain: text("domain").notNull().unique(),
  type: text("type", { enum: ["master", "slave", "forward"] }).notNull().default("master"),
  status: text("status", { enum: ["active", "disabled", "syncing"] }).notNull().default("active"),
  serial: text("serial").notNull().default(""),
  filePath: text("file_path").notNull().default(""),
  adminEmail: text("admin_email").default(""),
  replicationEnabled: boolean("replication_enabled").notNull().default(true),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertZoneSchema = createInsertSchema(zones).pick({
  domain: true,
  type: true,
  adminEmail: true,
});
export type InsertZone = z.infer<typeof insertZoneSchema>;
export type Zone = typeof zones.$inferSelect;

// ── DNS Records ──────────────────────────────────────────────────
export const dnsRecords = pgTable("dns_records", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  zoneId: text("zone_id").notNull().references(() => zones.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", { enum: ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "PTR", "SRV"] }).notNull(),
  value: text("value").notNull(),
  ttl: integer("ttl").notNull().default(3600),
  priority: integer("priority"),
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
export const acls = pgTable("acls", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  networks: text("networks").notNull(),
  comment: text("comment").default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertAclSchema = createInsertSchema(acls).pick({
  name: true,
  networks: true,
  comment: true,
});
export type InsertAcl = z.infer<typeof insertAclSchema>;
export type Acl = typeof acls.$inferSelect;

// ── TSIG Keys ────────────────────────────────────────────────────
export const tsigKeys = pgTable("tsig_keys", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  algorithm: text("algorithm", { enum: ["hmac-sha256", "hmac-sha512", "hmac-md5"] }).notNull().default("hmac-sha256"),
  secret: text("secret").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertTsigKeySchema = createInsertSchema(tsigKeys).pick({
  name: true,
  algorithm: true,
  secret: true,
});
export type InsertTsigKey = z.infer<typeof insertTsigKeySchema>;
export type TsigKey = typeof tsigKeys.$inferSelect;

// ── Config Snapshots ─────────────────────────────────────────────
export const configSnapshots = pgTable("config_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  section: text("section").notNull(),
  content: text("content").notNull(),
  appliedAt: text("applied_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type ConfigSnapshot = typeof configSnapshots.$inferSelect;

// ── SSH Connections ──────────────────────────────────────────────
export const connections = pgTable("connections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(22),
  username: text("username").notNull().default("root"),
  authType: text("auth_type", { enum: ["password", "key"] }).notNull().default("password"),
  password: text("password").default(""),
  privateKey: text("private_key").default(""),
  bind9ConfDir: text("bind9_conf_dir").default(""),
  bind9ZoneDir: text("bind9_zone_dir").default(""),
  rndcBin: text("rndc_bin").default("rndc"),
  isActive: boolean("is_active").notNull().default(false),
  lastStatus: text("last_status", { enum: ["connected", "failed", "unknown"] }).default("unknown"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
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
export const logEntries = pgTable("log_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  timestamp: text("timestamp").notNull().$defaultFn(() => new Date().toISOString()),
  level: text("level", { enum: ["INFO", "WARN", "ERROR", "DEBUG"] }).notNull().default("INFO"),
  source: text("source").notNull().default("general"),
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
export const rpzEntries = pgTable("rpz_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  type: text("type", { enum: ["nxdomain", "nodata", "redirect"] }).notNull().default("nxdomain"),
  target: text("target").default(""),
  comment: text("comment").default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
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
export const ipBlacklist = pgTable("ip_blacklist", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ip: text("ip").notNull().unique(),
  attemptCount: integer("attempt_count").notNull().default(1),
  reason: text("reason", { enum: ["login_failed", "api_abuse", "brute_force", "manual"] }).notNull().default("login_failed"),
  bannedAt: text("banned_at").notNull().$defaultFn(() => new Date().toISOString()),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type IpBlacklist = typeof ipBlacklist.$inferSelect;

// ── API Tokens ──────────────────────────────────────────────────
export const apiTokens = pgTable("api_tokens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  tokenPrefix: text("token_prefix").notNull(),
  permissions: text("permissions").notNull().default("*"),
  createdBy: text("created_by").notNull(),
  lastUsedAt: text("last_used_at"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type ApiToken = typeof apiTokens.$inferSelect;

// ── User-Domain assignments (Domain Jailing) ────────────────────
export const userDomains = pgTable("user_domains", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  zoneId: text("zone_id").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type UserDomain = typeof userDomains.$inferSelect;

// ── Replication Servers ─────────────────────────────────────────
export const replicationServers = pgTable("replication_servers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(22),
  username: text("username").notNull().default("root"),
  authType: text("auth_type", { enum: ["password", "key"] }).notNull().default("password"),
  password: text("password").default(""),
  privateKey: text("private_key").default(""),
  bind9ConfDir: text("bind9_conf_dir").default("/etc/bind"),
  bind9ZoneDir: text("bind9_zone_dir").default("/var/lib/bind"),
  role: text("role", { enum: ["slave", "secondary"] }).notNull().default("slave"),
  lastSyncAt: text("last_sync_at"),
  lastSyncStatus: text("last_sync_status", { enum: ["success", "failed", "pending", "never"] }).notNull().default("never"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type ReplicationServer = typeof replicationServers.$inferSelect;

// ── Replication Conflicts ───────────────────────────────────────
export const replicationConflicts = pgTable("replication_conflicts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serverId: text("server_id").notNull(),
  zoneDomain: text("zone_domain").notNull(),
  masterSerial: text("master_serial"),
  slaveSerial: text("slave_serial"),
  conflictType: text("conflict_type", { enum: ["serial_mismatch", "zone_missing", "soa_mismatch", "config_mismatch"] }).notNull(),
  details: text("details").default(""),
  resolved: boolean("resolved").notNull().default(false),
  detectedAt: text("detected_at").notNull().$defaultFn(() => new Date().toISOString()),
  resolvedAt: text("resolved_at"),
});

export type ReplicationConflict = typeof replicationConflicts.$inferSelect;

// ── Replication Zone Bindings (per-zone replication control) ────
export const replicationZoneBindings = pgTable("replication_zone_bindings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serverId: text("server_id").notNull(),
  zoneId: text("zone_id").notNull(),
  mode: text("mode", { enum: ["push", "pull", "both"] }).notNull().default("push"),
  enabled: boolean("enabled").notNull().default(true),
  lastSyncAt: text("last_sync_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type ReplicationZoneBinding = typeof replicationZoneBindings.$inferSelect;

// ── Health Checks ──────────────────────────────────────────────
export const healthChecks = pgTable("health_checks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serverId: text("server_id").notNull(),
  status: text("status", { enum: ["healthy", "degraded", "down"] }).notNull(),
  latencyMs: integer("latency_ms"),
  details: text("details").default(""),
  checkedAt: text("checked_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type HealthCheck = typeof healthChecks.$inferSelect;

// ── Notification Channels ──────────────────────────────────────
export const notificationChannels = pgTable("notification_channels", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  type: text("type", { enum: ["email", "webhook", "slack"] }).notNull(),
  config: text("config").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  events: text("events").notNull().default("server_down,conflict_detected,health_degraded"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type NotificationChannel = typeof notificationChannels.$inferSelect;

// ── Sync History ──────────────────────────────────────────────
export const syncHistory = pgTable("sync_history", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serverId: text("server_id").notNull(),
  zoneDomain: text("zone_domain").notNull(),
  action: text("action", { enum: ["push", "pull", "notify"] }).notNull(),
  success: boolean("success").notNull(),
  durationMs: integer("duration_ms"),
  details: text("details").default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type SyncHistoryEntry = typeof syncHistory.$inferSelect;

// ── DNSSEC Keys ───────────────────────────────────────────────
export const dnssecKeys = pgTable("dnssec_keys", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  zoneId: text("zone_id").notNull(),
  keyTag: text("key_tag").notNull(),
  keyType: text("key_type", { enum: ["KSK", "ZSK"] }).notNull(),
  algorithm: text("algorithm").notNull().default("ECDSAP256SHA256"),
  keySize: integer("key_size").notNull().default(256),
  status: text("status", { enum: ["active", "published", "retired", "revoked"] }).notNull().default("active"),
  filePath: text("file_path"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  activatedAt: text("activated_at"),
  retiredAt: text("retired_at"),
});

export type DnssecKey = typeof dnssecKeys.$inferSelect;

// ── Backups ───────────────────────────────────────────────────
export const backups = pgTable("backups", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text("type", { enum: ["auto", "manual", "snapshot"] }).notNull(),
  scope: text("scope", { enum: ["full", "zones", "configs", "single_zone"] }).notNull(),
  zoneId: text("zone_id"),
  filePath: text("file_path").notNull(),
  sizeBytes: integer("size_bytes"),
  description: text("description").default(""),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type Backup = typeof backups.$inferSelect;
