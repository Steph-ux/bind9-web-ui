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
