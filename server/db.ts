import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "..", "data", "bind9admin.db");

// Ensure data directory exists
mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Auto-create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
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

console.log(`[db] SQLite database ready at ${dbPath}`);
