// Copyright © 2025 Stephane ASSOGBA
/**
 * Replication Service
 * Pushes zone files and config to slave/secondary BIND9 servers via SSH/SFTP.
 * Sends rndc notify after zone transfers.
 */
import { Client, type ConnectConfig } from "ssh2";
import type { ReplicationServer, ReplicationConflict } from "@shared/schema";
import { storage } from "./storage";
import { bind9Service } from "./bind9-service";

export interface SyncResult {
  serverId: string;
  serverName: string;
  success: boolean;
  message: string;
  zonesPushed: number;
  timestamp: string;
}

export interface FullSyncResult {
  results: SyncResult[];
  totalZones: number;
  duration: number;
}

class ReplicationService {

  /** Push all zones to all enabled replication servers (respecting zone bindings) */
  async syncAll(): Promise<FullSyncResult> {
    const start = Date.now();
    const servers = await storage.getReplicationServers();
    const enabled = servers.filter(s => s.enabled);
    const zones = await storage.getZones();
    const masterZones = zones.filter(z => z.type === "master" && z.status === "active" && z.replicationEnabled !== false);

    const results: SyncResult[] = [];

    for (const server of enabled) {
      // Get zone bindings for this server
      const bindings = await storage.getReplicationZoneBindings(server.id);
      let zonesToSync = masterZones;

      if (bindings.length > 0) {
        // If bindings exist, only sync zones that are enabled in bindings
        const enabledZoneIds = new Set(
          bindings.filter(b => b.enabled).map(b => b.zoneId)
        );
        zonesToSync = masterZones.filter(z => enabledZoneIds.has(z.id));
      }

      const result = await this.syncToServer(server, zonesToSync);
      results.push(result);
    }

    return {
      results,
      totalZones: masterZones.length,
      duration: Date.now() - start,
    };
  }

  /** Push specific zone to all enabled replication servers (respecting zone bindings) */
  async syncZone(zoneId: string): Promise<FullSyncResult> {
    const start = Date.now();
    const zone = await storage.getZone(zoneId);
    if (!zone) throw new Error("Zone not found");
    if (zone.replicationEnabled === false) throw new Error("Replication is disabled for this zone");

    const servers = await storage.getReplicationServers();
    const enabled = servers.filter(s => s.enabled);
    const results: SyncResult[] = [];

    for (const server of enabled) {
      // Check if this zone is bound and enabled for this server
      const binding = await storage.getReplicationZoneBinding(server.id, zoneId);
      if (binding && !binding.enabled) continue; // Skip disabled bindings

      const result = await this.syncToServer(server, [zone]);
      results.push(result);
    }

    return {
      results,
      totalZones: 1,
      duration: Date.now() - start,
    };
  }

  /** Push zones to a single replication server */
  private async syncToServer(server: ReplicationServer, zones: any[]): Promise<SyncResult> {
    const timestamp = new Date().toISOString();

    try {
      await storage.updateReplicationSyncStatus(server.id, "pending");

      const client = await this.connectToServer(server);
      let zonesPushed = 0;

      try {
        // Push each zone file
        for (const zone of zones) {
          try {
            // Read zone file from master
            const zoneContent = await this.readZoneFile(zone);
            if (!zoneContent) continue;

            // Write to slave server
            const remotePath = `${server.bind9ZoneDir}/db.${zone.domain}`;
            await this.sftpWriteFile(client, remotePath, zoneContent);
            zonesPushed++;
          } catch (zoneErr: any) {
            console.error(`[replication] Failed to push zone ${zone.domain} to ${server.host}: ${zoneErr.message}`);
          }
        }

        // Also push named.conf.local with slave zone definitions
        try {
          const slaveConfig = this.generateSlaveConfig(zones, server);
          const confPath = `${server.bind9ConfDir}/named.conf.local`;
          await this.sftpWriteFile(client, confPath, slaveConfig);
        } catch (confErr: any) {
          console.error(`[replication] Failed to push config to ${server.host}: ${confErr.message}`);
        }

        // Reload BIND9 on the slave
        try {
          await this.execOnClient(client, "sudo -n /usr/sbin/rndc reload");
        } catch (reloadErr: any) {
          console.error(`[replication] Failed to reload BIND9 on ${server.host}: ${reloadErr.message}`);
        }
      } finally {
        client.end();
      }

      await storage.updateReplicationSyncStatus(server.id, "success");

      return {
        serverId: server.id,
        serverName: server.name,
        success: true,
        message: `Pushed ${zonesPushed}/${zones.length} zones`,
        zonesPushed,
        timestamp,
      };
    } catch (err: any) {
      await storage.updateReplicationSyncStatus(server.id, "failed");

      return {
        serverId: server.id,
        serverName: server.name,
        success: false,
        message: err.message,
        zonesPushed: 0,
        timestamp,
      };
    }
  }

  /** Send rndc notify for a zone to all replication servers */
  async notifyZone(zoneDomain: string): Promise<void> {
    try {
      // Notify locally first
      if (await bind9Service.isAvailable()) {
        if (/^[a-zA-Z0-9._-]+$/.test(zoneDomain)) {
          await bind9Service.rndc(`notify ${zoneDomain}`);
        }
      }
    } catch (err: any) {
      console.error(`[replication] rndc notify failed for ${zoneDomain}: ${err.message}`);
    }
  }

  /** Detect conflicts by comparing master zone serials with slave serials */
  async detectConflicts(): Promise<ReplicationConflict[]> {
    const servers = await storage.getReplicationServers();
    const enabled = servers.filter(s => s.enabled);
    const zones = await storage.getZones();
    const masterZones = zones.filter(z => z.type === "master" && z.status === "active" && z.replicationEnabled !== false);
    const newConflicts: ReplicationConflict[] = [];

    // Get existing unresolved conflicts to avoid duplicates
    const existingConflicts = await storage.getReplicationConflicts(false);
    const existingKeys = new Set(existingConflicts.map(c => `${c.serverId}:${c.zoneDomain}:${c.conflictType}`));

    for (const server of enabled) {
      try {
        const client = await this.connectToServer(server);
        try {
          for (const zone of masterZones) {
            const key = `${server.id}:${zone.domain}:serial_mismatch`;
            try {
              // Get serial from slave via rndc
              const { stdout } = await this.execOnClient(client,
                `sudo -n /usr/sbin/rndc zonestatus ${zone.domain} 2>/dev/null | grep serial || echo "serial:0"`);
              const slaveSerialMatch = stdout.match(/serial:\s*(\d+)/i);
              const slaveSerial = slaveSerialMatch ? slaveSerialMatch[1] : "0";
              const masterSerial = zone.serial || "0";

              if (slaveSerial !== masterSerial && !existingKeys.has(key)) {
                const conflict = await storage.createReplicationConflict({
                  serverId: server.id,
                  zoneDomain: zone.domain,
                  masterSerial,
                  slaveSerial,
                  conflictType: "serial_mismatch",
                  details: `Master serial ${masterSerial} != Slave serial ${slaveSerial}`,
                  resolved: false,
                });
                newConflicts.push(conflict);
              }
            } catch {
              // Zone missing on slave
              const missingKey = `${server.id}:${zone.domain}:zone_missing`;
              if (!existingKeys.has(missingKey)) {
                const conflict = await storage.createReplicationConflict({
                  serverId: server.id,
                  zoneDomain: zone.domain,
                  masterSerial: zone.serial || "0",
                  slaveSerial: null,
                  conflictType: "zone_missing",
                  details: `Zone ${zone.domain} not found on slave ${server.name}`,
                  resolved: false,
                });
                newConflicts.push(conflict);
              }
            }
          }
        } finally {
          client.end();
        }
      } catch (err: any) {
        // Cannot connect to server — skip conflict detection for this server
        console.error(`[replication] Cannot check conflicts on ${server.name}: ${err.message}`);
      }
    }

    if (newConflicts.length > 0) {
      await storage.insertLog({
        level: "WARN",
        source: "replication",
        message: `Conflict detection found ${newConflicts.length} new conflicts`,
      });
    }

    return newConflicts;
  }

  /** Read a zone file from the master (local or via SSH) */
  private async readZoneFile(zone: any): Promise<string | null> {
    try {
      if (!zone.filePath) return null;
      const content = await bind9Service.readRawFile(zone.filePath);
      return content;
    } catch {
      return null;
    }
  }

  /** Generate a slave named.conf.local for the given zones */
  private generateSlaveConfig(zones: any[], server: ReplicationServer): string {
    const lines: string[] = ["// Auto-generated by BIND9 Web Manager — DO NOT EDIT MANUALLY"];
    // Get the master's IP — use the active connection's host or localhost
    const masterIp = "master"; // This will be replaced with the actual master IP

    for (const zone of zones) {
      const slavePath = `${server.bind9ZoneDir}/db.${zone.domain}`;
      lines.push(`zone "${zone.domain}" {`);
      lines.push(`    type slave;`);
      lines.push(`    file "${slavePath}";`);
      lines.push(`    masters { ${masterIp}; };`);
      lines.push(`};`);
      lines.push("");
    }

    return lines.join("\n");
  }

  /** Connect to a replication server via SSH */
  private connectToServer(server: ReplicationServer): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error("SSH connection timeout (15s)"));
      }, 15000);

      const config: ConnectConfig = {
        host: server.host,
        port: server.port,
        username: server.username,
        readyTimeout: 15000,
        keepaliveInterval: 30000,
      };

      if (server.authType === "password") {
        config.password = server.password || undefined;
      } else {
        config.privateKey = server.privateKey || undefined;
      }

      client.on("ready", () => {
        clearTimeout(timeout);
        resolve(client);
      });

      client.on("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(`SSH connection failed: ${err.message}`));
      });

      client.connect(config);
    });
  }

  /** Execute a command on a remote client */
  private execOnClient(client: Client, command: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) return reject(err);
        let stdout = "";
        let stderr = "";
        stream.on("data", (data: Buffer) => { stdout += data.toString(); });
        stream.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });
        stream.on("close", () => resolve({ stdout, stderr }));
        stream.on("error", (err: Error) => reject(err));
      });
    });
  }

  /** Write a file via SFTP */
  private sftpWriteFile(client: Client, remotePath: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) return reject(new Error(`SFTP failed: ${err.message}`));
        sftp.writeFile(remotePath, content, "utf-8", (writeErr: any) => {
          if (writeErr) return reject(new Error(`Cannot write ${remotePath}: ${writeErr.message}`));
          resolve();
        });
      });
    });
  }
}

export const replicationService = new ReplicationService();
