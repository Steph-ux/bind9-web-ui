// Copyright 2025 Stephane ASSOGBA
// Multi-database factory — supports SQLite (default), PostgreSQL, MySQL
// Set DB_TYPE=postgresql or DB_TYPE=mysql + DATABASE_URL to switch
import path from "path";
import { mkdirSync } from "fs";

const DB_TYPE = (process.env.DB_TYPE || "sqlite").toLowerCase();

export let db: any;
export let schema: any;

// Initialize DB — this promise is awaited by storage.ts on first use
const dbReady = (async () => {
if (DB_TYPE === "sqlite") {
  // ── SQLite (default) ──────────────────────────────────────────
  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const sqliteSchema = await import("@shared/schema");

  const dbPath = path.resolve(process.cwd(), "data", "bind9admin.db");
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  db = drizzle(sqlite, { schema: sqliteSchema });
  schema = sqliteSchema;

  // Auto-create tables (SQLite only — PG/MySQL use drizzle-kit push)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS zones (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'master',
      status TEXT NOT NULL DEFAULT 'active',
      serial TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL DEFAULT '',
      admin_email TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dns_records (
      id TEXT PRIMARY KEY,
      zone_id TEXT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      ttl INTEGER NOT NULL DEFAULT 3600,
      priority INTEGER
    );
    CREATE TABLE IF NOT EXISTS acls (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      networks TEXT NOT NULL,
      comment TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tsig_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      algorithm TEXT NOT NULL DEFAULT 'hmac-sha256',
      secret TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS config_snapshots (
      id TEXT PRIMARY KEY,
      section TEXT NOT NULL,
      content TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS log_entries (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'INFO',
      source TEXT NOT NULL DEFAULT 'general',
      message TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rpz_entries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'CNAME',
      target TEXT DEFAULT '.',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 22,
      username TEXT NOT NULL DEFAULT 'root',
      auth_type TEXT NOT NULL DEFAULT 'password',
      password TEXT DEFAULT '',
      private_key TEXT DEFAULT '',
      bind9_conf_dir TEXT DEFAULT '',
      bind9_zone_dir TEXT DEFAULT '',
      rndc_bin TEXT DEFAULT 'rndc',
      is_active INTEGER NOT NULL DEFAULT 0,
      last_status TEXT DEFAULT 'unknown',
      created_at TEXT NOT NULL
    );
  `);

  // Migrate: add columns that may be missing on existing databases
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { sqlite.exec(`ALTER TABLE connections ADD COLUMN name TEXT NOT NULL DEFAULT 'default'`); } catch {}

  console.log(`[db] SQLite database ready at ${dbPath}`);

} else if (DB_TYPE === "postgresql" || DB_TYPE === "postgres") {
  // ── PostgreSQL ────────────────────────────────────────────────
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = (await import("pg")).default;
  const pgSchema = await import("@shared/schema-pg");

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("[db] DATABASE_URL is required when DB_TYPE=postgresql");

  const pool = new Pool({ connectionString: DATABASE_URL });
  db = drizzle(pool, { schema: pgSchema });
  schema = pgSchema;

  console.log(`[db] PostgreSQL database ready (${DATABASE_URL.replace(/:[^:@]+@/, ":****@")})`);

} else if (DB_TYPE === "mysql") {
  // ── MySQL ─────────────────────────────────────────────────────
  const { drizzle } = await import("drizzle-orm/mysql2");
  const mysql = (await import("mysql2/promise")).default;
  const mysqlSchema = await import("@shared/schema-mysql");

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("[db] DATABASE_URL is required when DB_TYPE=mysql");

  const pool = mysql.createPool(DATABASE_URL);
  db = drizzle(pool, { schema: mysqlSchema, mode: "default" });
  schema = mysqlSchema;

  console.log(`[db] MySQL database ready (${DATABASE_URL.replace(/:[^:@]+@/, ":****@")})`);

} else {
  throw new Error(`[db] Unsupported DB_TYPE: "${DB_TYPE}". Use: sqlite, postgresql, mysql`);
}
})();

// Export the ready promise so callers can await initialization if needed
export { dbReady };
export default db;
