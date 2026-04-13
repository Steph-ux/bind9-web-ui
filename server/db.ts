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
      type TEXT NOT NULL DEFAULT 'nxdomain',
      target TEXT DEFAULT '',
      comment TEXT DEFAULT '',
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
    CREATE TABLE IF NOT EXISTS ip_blacklist (
      id TEXT PRIMARY KEY,
      ip TEXT NOT NULL UNIQUE,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      reason TEXT NOT NULL DEFAULT 'login_failed',
      banned_at TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      token_prefix TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '*',
      created_by TEXT NOT NULL,
      last_used_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_domains (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      zone_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS replication_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 22,
      username TEXT NOT NULL DEFAULT 'root',
      auth_type TEXT NOT NULL DEFAULT 'password',
      password TEXT DEFAULT '',
      private_key TEXT DEFAULT '',
      bind9_conf_dir TEXT DEFAULT '/etc/bind',
      bind9_zone_dir TEXT DEFAULT '/var/lib/bind',
      role TEXT NOT NULL DEFAULT 'slave',
      last_sync_at TEXT,
      last_sync_status TEXT NOT NULL DEFAULT 'never',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS replication_conflicts (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      zone_domain TEXT NOT NULL,
      master_serial TEXT,
      slave_serial TEXT,
      conflict_type TEXT NOT NULL,
      details TEXT DEFAULT '',
      resolved INTEGER NOT NULL DEFAULT 0,
      detected_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS replication_zone_bindings (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      zone_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'push',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_sync_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS health_checks (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      status TEXT NOT NULL,
      latency_ms INTEGER,
      details TEXT DEFAULT '',
      checked_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notification_channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      events TEXT NOT NULL DEFAULT 'server_down,conflict_detected,health_degraded',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_history (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      zone_domain TEXT NOT NULL,
      action TEXT NOT NULL,
      success INTEGER NOT NULL,
      duration_ms INTEGER,
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dnssec_keys (
      id TEXT PRIMARY KEY,
      zone_id TEXT NOT NULL,
      key_tag TEXT NOT NULL,
      key_type TEXT NOT NULL,
      algorithm TEXT NOT NULL DEFAULT 'ECDSAP256SHA256',
      key_size INTEGER NOT NULL DEFAULT 256,
      status TEXT NOT NULL DEFAULT 'active',
      file_path TEXT,
      created_at TEXT NOT NULL,
      activated_at TEXT,
      retired_at TEXT
    );
    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      scope TEXT NOT NULL,
      zone_id TEXT,
      file_path TEXT NOT NULL,
      size_bytes INTEGER,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);

  // Migrate: add columns that may be missing on existing databases
  try { sqlite.exec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { sqlite.exec(`ALTER TABLE connections ADD COLUMN name TEXT NOT NULL DEFAULT 'default'`); } catch {}
  // Migrate: rpz_entries may be missing comment column on existing DBs
  try { sqlite.exec(`ALTER TABLE rpz_entries ADD COLUMN comment TEXT DEFAULT ''`); } catch {}
  // Migrate: fix rpz_entries type default from old 'CNAME' to 'nxdomain'
  try { sqlite.exec(`UPDATE rpz_entries SET type = 'nxdomain' WHERE type = 'CNAME'`); } catch {}
  // Migrate: add replication_enabled column to zones
  try { sqlite.exec(`ALTER TABLE zones ADD COLUMN replication_enabled INTEGER NOT NULL DEFAULT 1`); } catch {}
  // Index on type for faster filtering
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_rpz_entries_type ON rpz_entries(type)`); } catch {}
  // Index on name for LIKE prefix search and dedup checks
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_rpz_entries_name ON rpz_entries(name)`); } catch {};
  // Index on server_id for sync history queries
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_sync_history_server ON sync_history(server_id)`); } catch {};
  // Index on zone_id for DNSSEC key lookups
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_dnssec_keys_zone ON dnssec_keys(zone_id)`); } catch {};
  // Index on type for backup filtering
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_backups_type ON backups(type)`); } catch {};
  // Index on server_id for health check queries
  try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_health_checks_server ON health_checks(server_id)`); } catch {};

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

  // Migrate: rpz_entries may be missing comment column on existing DBs
  try { await pool.query(`ALTER TABLE rpz_entries ADD COLUMN IF NOT EXISTS comment TEXT DEFAULT ''`); } catch {}
  // Migrate: fix rpz_entries type default from old 'CNAME' to 'nxdomain'
  try { await pool.query(`UPDATE rpz_entries SET type = 'nxdomain' WHERE type = 'CNAME'`); } catch {}
  // Migrate: add replication_enabled column to zones
  try { await pool.query(`ALTER TABLE zones ADD COLUMN IF NOT EXISTS replication_enabled BOOLEAN NOT NULL DEFAULT true`); } catch {}
  // Index on type for faster filtering
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_rpz_entries_type ON rpz_entries(type)`); } catch {}
  // Index on name for LIKE prefix search and dedup checks
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_rpz_entries_name ON rpz_entries(name)`); } catch {}

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

  // Migrate: rpz_entries may be missing comment column on existing DBs
  try { await pool.query(`ALTER TABLE rpz_entries ADD COLUMN IF NOT EXISTS comment TEXT DEFAULT ''`); } catch {}
  // Migrate: fix rpz_entries type default from old 'CNAME' to 'nxdomain'
  try { await pool.query(`UPDATE rpz_entries SET type = 'nxdomain' WHERE type = 'CNAME'`); } catch {}
  // Migrate: add replication_enabled column to zones
  try { await pool.query(`ALTER TABLE zones ADD COLUMN IF NOT EXISTS replication_enabled BOOLEAN NOT NULL DEFAULT 1`); } catch {}
  // Index on type for faster filtering
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_rpz_entries_type ON rpz_entries(type)`); } catch {}
  // Index on name for LIKE prefix search and dedup checks
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_rpz_entries_name ON rpz_entries(name)`); } catch {}

  console.log(`[db] MySQL database ready (${DATABASE_URL.replace(/:[^:@]+@/, ":****@")})`);

} else {
  throw new Error(`[db] Unsupported DB_TYPE: "${DB_TYPE}". Use: sqlite, postgresql, mysql`);
}
})();

// Export the ready promise so callers can await initialization if needed
export { dbReady };
export default db;
