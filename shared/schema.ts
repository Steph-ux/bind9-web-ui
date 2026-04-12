// Copyright © 2025 Stephane ASSOGBA
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Users ────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role", { enum: ["admin", "operator", "viewer"] }).notNull().default("viewer"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ── DNS Zones ────────────────────────────────────────────────────
export const zones = sqliteTable("zones", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  domain: text("domain").notNull().unique(),
  type: text("type", { enum: ["master", "slave", "forward"] }).notNull().default("master"),
  status: text("status", { enum: ["active", "disabled", "syncing"] }).notNull().default("active"),
  serial: text("serial").notNull().default(""),
  filePath: text("file_path").notNull().default(""),
  adminEmail: text("admin_email").default(""),
  replicationEnabled: integer("replication_enabled", { mode: "boolean" }).notNull().default(true),
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
export const dnsRecords = sqliteTable("dns_records", {
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
export const acls = sqliteTable("acls", {
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
export const tsigKeys = sqliteTable("tsig_keys", {
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
export const configSnapshots = sqliteTable("config_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  section: text("section").notNull(),
  content: text("content").notNull(),
  appliedAt: text("applied_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type ConfigSnapshot = typeof configSnapshots.$inferSelect;

// ── SSH Connections ──────────────────────────────────────────────
export const connections = sqliteTable("connections", {
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
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
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
export const logEntries = sqliteTable("log_entries", {
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
export const rpzEntries = sqliteTable("rpz_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(), // The domain to block, e.g. "badconfig.com"
  type: text("type", { enum: ["nxdomain", "nodata", "redirect"] }).notNull().default("nxdomain"),
  target: text("target").default(""), // IP or CNAME if redirect
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
export const ipBlacklist = sqliteTable("ip_blacklist", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ip: text("ip").notNull().unique(),
  attemptCount: integer("attempt_count").notNull().default(1),
  reason: text("reason", { enum: ["login_failed", "api_abuse", "brute_force", "manual"] }).notNull().default("login_failed"),
  bannedAt: text("banned_at").notNull().$defaultFn(() => new Date().toISOString()),
  expiresAt: text("expires_at"), // null = permanent ban
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type IpBlacklist = typeof ipBlacklist.$inferSelect;

// ── API Tokens ──────────────────────────────────────────────────
export const apiTokens = sqliteTable("api_tokens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),                          // Human-readable label
  tokenHash: text("token_hash").notNull().unique(),      // SHA-256 of the raw token
  tokenPrefix: text("token_prefix").notNull(),           // First 8 chars for identification (e.g. "bwm_a1b2")
  permissions: text("permissions").notNull().default("*"), // Comma-separated scopes: "*" | "zones:read,records:read" etc.
  createdBy: text("created_by").notNull(),               // User ID who created the token
  lastUsedAt: text("last_used_at"),
  expiresAt: text("expires_at"),                         // null = never expires
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type ApiToken = typeof apiTokens.$inferSelect;

// ── User-Domain assignments (Domain Jailing) ────────────────────
export const userDomains = sqliteTable("user_domains", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  zoneId: text("zone_id").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type UserDomain = typeof userDomains.$inferSelect;

// ── Replication Servers ─────────────────────────────────────────
export const replicationServers = sqliteTable("replication_servers", {
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
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type ReplicationServer = typeof replicationServers.$inferSelect;

// ── Replication Conflicts ───────────────────────────────────────
export const replicationConflicts = sqliteTable("replication_conflicts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serverId: text("server_id").notNull(),
  zoneDomain: text("zone_domain").notNull(),
  masterSerial: text("master_serial"),
  slaveSerial: text("slave_serial"),
  conflictType: text("conflict_type", { enum: ["serial_mismatch", "zone_missing", "soa_mismatch", "config_mismatch"] }).notNull(),
  details: text("details").default(""),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  detectedAt: text("detected_at").notNull().$defaultFn(() => new Date().toISOString()),
  resolvedAt: text("resolved_at"),
});

export type ReplicationConflict = typeof replicationConflicts.$inferSelect;

// ── Replication Zone Bindings (per-zone replication control) ────
export const replicationZoneBindings = sqliteTable("replication_zone_bindings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serverId: text("server_id").notNull(),
  zoneId: text("zone_id").notNull(),
  mode: text("mode", { enum: ["push", "pull", "both"] }).notNull().default("push"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastSyncAt: text("last_sync_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type ReplicationZoneBinding = typeof replicationZoneBindings.$inferSelect;

// ── Health Checks ──────────────────────────────────────────────
export const healthChecks = sqliteTable("health_checks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  serverId: text("server_id").notNull(),
  status: text("status", { enum: ["healthy", "degraded", "down"] }).notNull(),
  latencyMs: integer("latency_ms"),
  details: text("details").default(""),
  checkedAt: text("checked_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type HealthCheck = typeof healthChecks.$inferSelect;

// ── Notification Channels ──────────────────────────────────────
export const notificationChannels = sqliteTable("notification_channels", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  type: text("type", { enum: ["email", "webhook", "slack"] }).notNull(),
  config: text("config").notNull(), // JSON string: {email, webhookUrl, etc.}
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  events: text("events").notNull().default("server_down,conflict_detected,health_degraded"), // comma-separated
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type NotificationChannel = typeof notificationChannels.$inferSelect;
