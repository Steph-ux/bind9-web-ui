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
