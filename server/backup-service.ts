import fs from "fs/promises";
import path from "path";
import { storage } from "./storage";
import { bind9Service } from "./bind9-service";
import type { Backup } from "@shared/schema";

const BACKUP_DIR = path.join(process.cwd(), "backups");

class BackupService {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /** Ensure backup directory exists */
  private async ensureDir(): Promise<void> {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  }

  /** Start periodic auto-backup (default: every 6 hours) */
  start(intervalMs = 6 * 60 * 60 * 1000): void {
    if (this.intervalId) return;
    console.log(`[backup] Starting auto-backup every ${intervalMs / 1000 / 60} minutes`);
    // Run one immediately
    this.runAutoBackup().catch(err => console.error("[backup] Initial auto-backup failed:", err.message));
    this.intervalId = setInterval(() => {
      this.runAutoBackup().catch(err => console.error("[backup] Auto-backup failed:", err.message));
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Run automatic full backup */
  async runAutoBackup(): Promise<Backup> {
    return this.createBackup("auto", "full");
  }

  /** Create a backup of specified scope */
  async createBackup(type: "auto" | "manual" | "snapshot", scope: "full" | "zones" | "configs" | "single_zone", zoneId?: string): Promise<Backup> {
    await this.ensureDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-${scope}-${timestamp}.tar.gz`;
    const filePath = path.join(BACKUP_DIR, filename);

    const zones = await storage.getZones();
    let description = "";

    if (scope === "full" || scope === "configs") {
      // Backup BIND9 config files
      try {
        const configContent = await this.readBind9Configs();
        const configPath = path.join(BACKUP_DIR, `configs-${timestamp}.json`);
        await fs.writeFile(configPath, JSON.stringify(configContent, null, 2));
      } catch (err: any) {
        console.error(`[backup] Failed to backup configs: ${err.message}`);
      }
      description = scope === "full" ? "Full backup (configs + zones)" : "Config files backup";
    }

    if (scope === "full" || scope === "zones" || scope === "single_zone") {
      // Backup zone data from database
      const zonesToBackup = scope === "single_zone" && zoneId
        ? zones.filter(z => z.id === zoneId)
        : zones;

      const zoneData = [];
      for (const zone of zonesToBackup) {
        try {
          const records = await storage.getRecords(zone.id);
          zoneData.push({ zone, records });
        } catch (err: any) {
          console.error(`[backup] Failed to backup zone ${zone.domain}: ${err.message}`);
        }
      }

      const zoneDataPath = path.join(BACKUP_DIR, `zones-${timestamp}.json`);
      await fs.writeFile(zoneDataPath, JSON.stringify(zoneData, null, 2));

      if (scope === "single_zone") {
        description = `Snapshot of zone ${zonesToBackup[0]?.domain || zoneId}`;
      } else {
        description = description || `${zonesToBackup.length} zones backed up`;
      }
    }

    // Create a metadata file
    const metadata = {
      type,
      scope,
      zoneId: zoneId || null,
      timestamp,
      version: 1,
    };
    await fs.writeFile(path.join(BACKUP_DIR, `meta-${timestamp}.json`), JSON.stringify(metadata, null, 2));

    // Calculate total size of backup files
    let sizeBytes = 0;
    try {
      const files = await fs.readdir(BACKUP_DIR);
      for (const f of files) {
        if (f.includes(timestamp)) {
          const stat = await fs.stat(path.join(BACKUP_DIR, f));
          sizeBytes += stat.size;
        }
      }
    } catch {}

    const backup = await storage.createBackup({
      type,
      scope,
      zoneId: zoneId || null,
      filePath,
      sizeBytes,
      description,
    });

    await storage.insertLog({
      level: "INFO",
      source: "backup",
      message: `${type} backup created: ${scope} (${sizeBytes} bytes)`,
    });

    return backup;
  }

  /** Read BIND9 configuration files for backup */
  private async readBind9Configs(): Promise<Record<string, string>> {
    const configs: Record<string, string> = {};
    const confFiles = [
      { name: "named.conf.options", path: "/etc/bind/named.conf.options" },
      { name: "named.conf.local", path: "/etc/bind/named.conf.local" },
      { name: "named.conf.acls", path: "/etc/bind/named.conf.acls" },
      { name: "named.conf", path: "/etc/bind/named.conf" },
    ];

    for (const file of confFiles) {
      try {
        if (await bind9Service.isAvailable()) {
          const content = await bind9Service.readRawFile(file.path);
          if (content) configs[file.name] = content;
        }
      } catch {}
    }

    return configs;
  }

  /** Restore from a backup */
  async restore(backupId: string): Promise<{ success: boolean; message: string }> {
    try {
      const backup = await storage.getBackup(backupId);
      if (!backup) return { success: false, message: "Backup not found" };

      const timestamp = backup.filePath.split("-").slice(-1)?.[0]?.replace(".tar.gz", "") || "";
      const metaPath = path.join(BACKUP_DIR, `meta-${timestamp}.json`);

      let meta: any = {};
      try {
        meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
      } catch {}

      // Restore zones
      if (meta.scope === "full" || meta.scope === "zones" || meta.scope === "single_zone") {
        const zoneDataPath = path.join(BACKUP_DIR, `zones-${timestamp}.json`);
        try {
          const zoneData = JSON.parse(await fs.readFile(zoneDataPath, "utf-8"));
          for (const { zone, records } of zoneData) {
            try {
              // Check if zone exists
              const existing = await storage.getZone(zone.id);
              if (existing) {
                // Update zone
                await storage.updateZone(zone.id, zone);
              } else {
                // Create zone
                await storage.createZone(zone);
              }
              // Restore records
              for (const record of records) {
                try {
                  const existingRec = await storage.getRecord(record.id);
                  if (!existingRec) {
                    await storage.createRecord(record);
                  }
                } catch {}
              }
            } catch (err: any) {
              console.error(`[backup] Failed to restore zone ${zone.domain}: ${err.message}`);
            }
          }
        } catch (err: any) {
          return { success: false, message: `Failed to read zone data: ${err.message}` };
        }
      }

      await storage.insertLog({
        level: "INFO",
        source: "backup",
        message: `Backup ${backupId} restored (${backup.scope})`,
      });

      return { success: true, message: `Backup restored successfully` };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /** Delete a backup and its files */
  async deleteBackup(backupId: string): Promise<{ success: boolean; message: string }> {
    try {
      const backup = await storage.getBackup(backupId);
      if (!backup) return { success: false, message: "Backup not found" };

      // Try to delete backup files
      const timestamp = backup.filePath.split("-").slice(-1)?.[0]?.replace(".tar.gz", "") || "";
      try {
        const files = await fs.readdir(BACKUP_DIR);
        for (const f of files) {
          if (f.includes(timestamp)) {
            await fs.unlink(path.join(BACKUP_DIR, f));
          }
        }
      } catch {}

      await storage.deleteBackup(backupId);
      return { success: true, message: "Backup deleted" };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}

export const backupService = new BackupService();
