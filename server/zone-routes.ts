import path from "path";
import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";

import { insertDnsRecordSchema, insertZoneSchema } from "@shared/schema";

import { bind9Service } from "./bind9-service";
import { replicationService } from "./replication-service";
import { storage } from "./storage";

type RegisterZoneRoutesOptions = {
  app: Express;
  requireViewer: RequestHandler;
  requireOperator: RequestHandler;
  safeError: (status: number, message: string) => string;
};

function parseServerList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isValidRemoteServer(value: string): boolean {
  const ipv4 = value.match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/);
  if (ipv4) {
    return value.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
  }
  return /^[a-fA-F0-9:]+$/.test(value);
}

function parseReverseZoneFromCidr(cidr: string): string {
  const match = cidr.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!match) {
    throw new Error("Network must be a valid IPv4 CIDR, for example 192.168.1.0/24");
  }

  const octets = match[1].split(".").map((part) => Number(part));
  const prefix = Number(match[2]);
  if (octets.some((part) => part < 0 || part > 255)) {
    throw new Error("Network contains an invalid IPv4 address");
  }
  if (![8, 16, 24].includes(prefix)) {
    throw new Error("Auto-reverse currently supports only /8, /16 and /24 IPv4 networks");
  }

  const octetCount = prefix / 8;
  return octets.slice(0, octetCount).reverse().join(".") + ".in-addr.arpa";
}

const toBindZoneRecords = (
  records: Array<{ name: string; type: string; value: string; ttl: number; priority: number | null }>,
) =>
  records.map((record) => ({
    name: record.name,
    type: record.type,
    value: record.value,
    ttl: record.ttl,
    priority: record.priority || undefined,
  }));

const writeZoneState = async (
  zone: {
    id: string;
    domain: string;
    type: string;
    filePath: string;
    adminEmail: string | null;
    replicationEnabled: boolean | null;
  },
  records: Array<{ name: string; type: string; value: string; ttl: number; priority: number | null }>,
) => {
  if (!zone.filePath) {
    throw new Error(`Zone ${zone.domain} does not have a file path`);
  }
  if (zone.type !== "master") {
    throw new Error(`Zone ${zone.domain} is not a master zone`);
  }

  await bind9Service.assertWritablePath(zone.filePath, `write zone file for ${zone.domain}`);
  const serial =
    new Date().toISOString().slice(0, 10).replace(/-/g, "") +
    String(Math.floor(Math.random() * 99) + 1).padStart(2, "0");

  await bind9Service.writeZoneFile(zone.filePath, zone.domain, toBindZoneRecords(records), serial, {
    adminEmail: zone.adminEmail || undefined,
  });
  await bind9Service.validateZoneFile(zone.domain, zone.filePath);

  if (!/^[a-zA-Z0-9._-]+$/.test(zone.domain)) {
    throw new Error(`Invalid zone domain for rndc reload: ${zone.domain}`);
  }

  await bind9Service.rndc(`reload ${zone.domain}`);

  if (zone.replicationEnabled !== false) {
    try {
      const replicationServers = await storage.getReplicationServers();
      if (replicationServers.some((server) => server.enabled)) {
        await replicationService.notifyZone(zone.domain);
      }
    } catch (replicationError: any) {
      console.error(`[replication] Auto-notify failed for ${zone.domain}: ${replicationError.message}`);
    }
  }

  return serial;
};

const syncZoneDbFromFile = async (zoneId: string, filePath: string, serial: string) => {
  const currentRecords = await storage.getRecords(zoneId);
  for (const currentRecord of currentRecords) {
    await storage.deleteRecord(currentRecord.id);
  }

  const parsedRecords = await bind9Service.readZoneFile(filePath);
  for (const record of parsedRecords) {
    if (record.type === "SOA") continue;
    await storage.createRecord({
      zoneId,
      name: record.name,
      type: record.type as any,
      value: record.value,
      ttl: record.ttl,
      priority: record.priority,
    });
  }

  await storage.updateZone(zoneId, { serial });
};

async function updateReverseRecord(
  action: "create" | "update" | "delete",
  record: { name: string; type: string; value: string; zoneId: string },
  oldRecord?: { name: string; type: string; value: string; zoneId: string },
) {
  try {
    if (!["A", "AAAA"].includes(record.type)) return;

    let reverseIp = "";
    if (record.type === "A") {
      const parts = record.value.split(".");
      if (parts.length === 4) {
        reverseIp = `${parts[3]}.${parts[2]}.${parts[1]}.${parts[0]}.in-addr.arpa`;
      }
    } else if (record.type === "AAAA") {
      return;
    }

    if (!reverseIp) return;

    const zones = await storage.getZones();
    const reverseZones = zones
      .filter((zone) => zone.domain.endsWith(".arpa"))
      .sort((left, right) => right.domain.length - left.domain.length);

    const targetZone = reverseZones.find((zone) => reverseIp.endsWith(zone.domain));
    if (!targetZone) {
      console.log(`[auto-reverse] No matching reverse zone found for ${reverseIp}`);
      return;
    }

    const ptrName = reverseIp.slice(0, reverseIp.length - targetZone.domain.length - 1);
    const sourceZone = zones.find((zone) => zone.id === record.zoneId);

    let fqdn = record.name;
    if (sourceZone) {
      fqdn = record.name === "@" ? sourceZone.domain : `${record.name}.${sourceZone.domain}`;
    }

    const ptrValue = fqdn.endsWith(".") ? fqdn : `${fqdn}.`;

    console.log(`[auto-reverse] ${action.toUpperCase()} PTR ${ptrName} in ${targetZone.domain} -> ${ptrValue}`);

    const existingRecords = await storage.getRecords(targetZone.id);

    if (action === "create") {
      const exists = existingRecords.find(
        (existing) => existing.name === ptrName && existing.value === ptrValue && existing.type === "PTR",
      );
      if (!exists) {
        const nextRecords = [
          ...existingRecords,
          {
            id: "__new__",
            zoneId: targetZone.id,
            name: ptrName,
            type: "PTR",
            value: ptrValue,
            ttl: 3600,
            priority: null,
          },
        ];
        const serial = await writeZoneState(targetZone as any, nextRecords);
        await syncZoneDbFromFile(targetZone.id, targetZone.filePath, serial);
      } else {
        console.log(`[auto-reverse] PTR ${ptrName} -> ${ptrValue} already exists. Skipping.`);
      }
      return;
    }

    if (action === "update") {
      if (oldRecord && oldRecord.value !== record.value) {
        await updateReverseRecord("delete", oldRecord);
        await updateReverseRecord("create", record);
        return;
      }

      if (oldRecord && oldRecord.name !== record.name) {
        const oldFqdn = sourceZone
          ? oldRecord.name === "@"
            ? sourceZone.domain
            : `${oldRecord.name}.${sourceZone.domain}`
          : oldRecord.name;
        const oldPtrValue = oldFqdn.endsWith(".") ? oldFqdn : `${oldFqdn}.`;

        const targetRecord = existingRecords.find(
          (existing) => existing.name === ptrName && existing.type === "PTR" && existing.value === oldPtrValue,
        );
        if (targetRecord) {
          const nextRecords = existingRecords.map((existing) =>
            existing.id === targetRecord.id ? { ...existing, value: ptrValue } : existing,
          );
          const serial = await writeZoneState(targetZone as any, nextRecords);
          await syncZoneDbFromFile(targetZone.id, targetZone.filePath, serial);
        }
      }
      return;
    }

    if (action === "delete") {
      const targetRecord = existingRecords.find(
        (existing) => existing.name === ptrName && existing.type === "PTR" && existing.value === ptrValue,
      );
      if (targetRecord) {
        const nextRecords = existingRecords.filter((existing) => existing.id !== targetRecord.id);
        const serial = await writeZoneState(targetZone as any, nextRecords);
        await syncZoneDbFromFile(targetZone.id, targetZone.filePath, serial);
      }
    }
  } catch (error: any) {
    console.error(`[auto-reverse] Failed: ${error.message}`);
  }
}

export function registerZoneRoutes({
  app,
  requireViewer,
  requireOperator,
  safeError,
}: RegisterZoneRoutesOptions) {
  app.get("/api/zones", requireViewer, async (req: Request, res: Response) => {
    try {
      let allZones = await storage.getZones();
      const user = req.user as any;
      if (user?.role === "viewer" && user?.id) {
        const assignments = await storage.getUserDomains(user.id);
        const allowedIds = new Set(assignments.map((assignment) => assignment.zoneId));
        allZones = allZones.filter((zone) => allowedIds.has(zone.id));
      }

      const enriched = await Promise.all(
        allZones.map(async (zone) => ({
          ...zone,
          records: await storage.getZoneRecordCount(zone.id),
        })),
      );
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/zones/sync", requireOperator, async (_req: Request, res: Response) => {
    try {
      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }

      console.log("[api] Starting manual zone sync");
      const configZones = await bind9Service.syncZonesFromConfig();
      const existingZones = await storage.getZones();
      let synced = 0;
      let skipped = 0;
      let errors = 0;

      for (const configZone of configZones) {
        try {
          if (!["master", "slave", "forward"].includes(configZone.type)) {
            console.log(`[api] Skipping zone ${configZone.domain}: unsupported type '${configZone.type}'`);
            skipped++;
            continue;
          }

          let zoneId = "";
          const found = existingZones.find((zone) => zone.domain === configZone.domain);

          if (found) {
            console.log(`[api] Zone ${configZone.domain} exists, updating details...`);
            zoneId = found.id;
            await storage.updateZone(found.id, { type: configZone.type as any, filePath: configZone.filePath });
          } else {
            const newZone = await storage.createZone({
              domain: configZone.domain,
              type: configZone.type as any,
            });
            zoneId = newZone.id;
            await storage.updateZone(newZone.id, { filePath: configZone.filePath });
          }

          if (configZone.filePath) {
            try {
              const records = await bind9Service.readZoneFile(configZone.filePath);

              if (records.length > 0) {
                const currentRecords = await storage.getRecords(zoneId);
                for (const currentRecord of currentRecords) {
                  await storage.deleteRecord(currentRecord.id);
                }

                let importedCount = 0;
                for (const record of records) {
                  if (record.type === "SOA") continue;
                  try {
                    await storage.createRecord({
                      zoneId,
                      name: record.name,
                      type: record.type as any,
                      value: record.value,
                      ttl: record.ttl,
                      priority: record.priority,
                    });
                    importedCount++;
                  } catch {}
                }
                console.log(`[api] Imported ${importedCount} records for zone ${configZone.domain}`);
              } else {
                console.log(`[api] No records found for zone ${configZone.domain} (or parsing failed)`);
              }
            } catch (recordError: any) {
              console.warn(`[api] Failed to read records for zone ${configZone.domain}: ${recordError.message}`);
            }
          }

          synced++;
        } catch (zoneError: any) {
          console.error(`[api] Failed to sync zone ${configZone.domain}: ${zoneError.message}`);
          errors++;
        }
      }

      await storage.insertLog({
        level: "INFO",
        source: "zones",
        message: `Zone sync: ${synced} imported, ${skipped} skipped, ${errors} failed, ${configZones.length} total found`,
      });

      res.json({
        message: `Synced ${synced} zones, ${skipped} skipped (exist or unsupported), ${errors} failed`,
        total: configZones.length,
        synced,
        skipped,
      });
    } catch (error: any) {
      console.error(`[api] Sync fatal error: ${error.message}`);
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/zones/:id", requireViewer, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });

      const user = req.user as any;
      if (user?.role === "viewer" && user?.id) {
        const accessible = await storage.isZoneAccessibleByUser(id, user.id, user.role);
        if (!accessible) {
          return res.status(403).json({ message: "You do not have access to this zone" });
        }
      }

      const records = await storage.getRecords(zone.id);
      res.json({ ...zone, records });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/zones", requireOperator, async (req: Request, res: Response) => {
    try {
      const data = insertZoneSchema.parse(req.body);
      const { autoReverse, network } = req.body;
      const masterServers = parseServerList(req.body.masterServers);
      const forwarders = parseServerList(req.body.forwarders);

      if (data.type === "slave") {
        if (masterServers.length === 0) {
          return res.status(400).json({ message: "Slave zones require at least one master server" });
        }
        if (masterServers.some((server) => !isValidRemoteServer(server))) {
          return res.status(400).json({ message: "masterServers must contain only IPv4 or IPv6 addresses" });
        }
      }
      if (data.type === "forward") {
        if (forwarders.length === 0) {
          return res.status(400).json({ message: "Forward zones require at least one forwarder" });
        }
        if (forwarders.some((server) => !isValidRemoteServer(server))) {
          return res.status(400).json({ message: "forwarders must contain only IPv4 or IPv6 addresses" });
        }
      }

      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }

      const management = await bind9Service.getManagementSummary();
      if (!management.features.zones) {
        return res.status(409).json({
          message:
            "This server connection cannot manage zones because named.conf.local is not included or not writable",
        });
      }

      const expectedFilePath = await bind9Service.getPreferredZoneFilePath(
        data.domain,
        data.type as "master" | "slave" | "forward",
      );
      if (data.type === "master" && expectedFilePath) {
        await bind9Service.assertWritablePath(expectedFilePath, `create zone file for ${data.domain}`);
        const serial = new Date().toISOString().slice(0, 10).replace(/-/g, "") + "01";
        await bind9Service.writeZoneFile(expectedFilePath, data.domain, [], serial, {
          adminEmail: data.adminEmail || undefined,
        });
        await bind9Service.validateZoneFile(data.domain, expectedFilePath);
      }

      await bind9Service.addZoneToConfig(
        data.domain,
        data.type as "master" | "slave" | "forward",
        expectedFilePath,
        { masterServers, forwarders },
      );

      await storage.insertLog({
        level: "INFO",
        source: "zones",
        message: `Zone ${data.domain} created (type: ${data.type})`,
      });

      let zone = await storage.createZone({
        ...data,
        masterServers: masterServers.join(", "),
        forwarders: forwarders.join(", "),
      });
      if (zone.filePath !== expectedFilePath) {
        zone = await storage.updateZone(zone.id, { filePath: expectedFilePath });
      }

      if (autoReverse && network && zone.type === "master") {
        try {
          const reverseDomain = parseReverseZoneFromCidr(String(network));
          const existingZones = await storage.getZones();
          if (!existingZones.find((existingZone) => existingZone.domain === reverseDomain)) {
            const reverseFilePath = await bind9Service.getPreferredZoneFilePath(reverseDomain, "master", {
              hintBaseName: path.posix.basename(zone.filePath || zone.domain),
            });
            await bind9Service.assertWritablePath(
              reverseFilePath,
              `create reverse zone file for ${reverseDomain}`,
            );
            const reverseSerial = new Date().toISOString().slice(0, 10).replace(/-/g, "") + "01";
            await bind9Service.writeZoneFile(reverseFilePath, reverseDomain, [], reverseSerial, {
              adminEmail: zone.adminEmail || undefined,
            });
            await bind9Service.validateZoneFile(reverseDomain, reverseFilePath);
            await bind9Service.addZoneToConfig(reverseDomain, "master", reverseFilePath);

            let reverseZone = await storage.createZone({
              domain: reverseDomain,
              type: "master",
              adminEmail: zone.adminEmail,
            });
            if (reverseZone.filePath !== reverseFilePath) {
              reverseZone = await storage.updateZone(reverseZone.id, { filePath: reverseFilePath });
            }

            await storage.insertLog({
              level: "INFO",
              source: "zones",
              message: `Auto-created reverse zone ${reverseDomain} for network ${network}`,
            });
          }
        } catch (reverseError: any) {
          await storage.insertLog({
            level: "WARN",
            source: "zones",
            message: `Failed to auto-create reverse zone: ${reverseError.message}`,
          });
        }
      }

      await bind9Service.reload();

      res.status(201).json(zone);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/zones/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });

      const allowed: Record<string, any> = {};
      const {
        domain,
        type,
        status,
        adminEmail,
        filePath,
        replicationEnabled,
        masterServers,
        forwarders,
      } = req.body;
      const allowedZoneTypes = ["master", "slave", "forward"];
      const allowedZoneStatuses = ["active", "disabled", "syncing"];

      if ([domain, type, filePath, masterServers, forwarders].some((value) => value !== undefined)) {
        return res.status(409).json({
          message:
            "Structural zone edits are disabled here. Update BIND9 first, then resync from the server.",
        });
      }

      if (domain !== undefined) {
        if (!/^[a-zA-Z0-9._-]+$/.test(String(domain))) {
          return res.status(400).json({ message: "Invalid domain name" });
        }
        allowed.domain = String(domain);
      }
      if (type !== undefined) {
        if (!allowedZoneTypes.includes(String(type))) {
          return res.status(400).json({
            message: `Invalid zone type. Allowed: ${allowedZoneTypes.join(", ")}`,
          });
        }
        allowed.type = String(type);
      }
      if (status !== undefined) {
        if (!allowedZoneStatuses.includes(String(status))) {
          return res.status(400).json({
            message: `Invalid status. Allowed: ${allowedZoneStatuses.join(", ")}`,
          });
        }
        allowed.status = String(status);
      }
      if (adminEmail !== undefined) allowed.adminEmail = String(adminEmail);
      if (masterServers !== undefined) {
        const parsed = parseServerList(String(masterServers));
        if (parsed.some((server) => !isValidRemoteServer(server))) {
          return res.status(400).json({ message: "masterServers must contain only IPv4 or IPv6 addresses" });
        }
        allowed.masterServers = parsed.join(", ");
      }
      if (forwarders !== undefined) {
        const parsed = parseServerList(String(forwarders));
        if (parsed.some((server) => !isValidRemoteServer(server))) {
          return res.status(400).json({ message: "forwarders must contain only IPv4 or IPv6 addresses" });
        }
        allowed.forwarders = parsed.join(", ");
      }
      if (filePath !== undefined) {
        if (!/^[a-zA-Z0-9.\/_-]+$/.test(String(filePath))) {
          return res.status(400).json({ message: "Invalid file path" });
        }
        allowed.filePath = String(filePath);
      }
      if (replicationEnabled !== undefined) {
        allowed.replicationEnabled = Boolean(replicationEnabled);
      }

      const nextType = String(type ?? zone.type);
      const nextDomain = String(domain ?? zone.domain);
      if (type !== undefined && filePath === undefined) {
        allowed.filePath = bind9Service.getDefaultZoneFilePath(
          nextDomain,
          nextType as "master" | "slave" | "forward",
        );
      }

      const nextMasters = parseServerList(String(allowed.masterServers ?? zone.masterServers ?? ""));
      const nextForwarders = parseServerList(String(allowed.forwarders ?? zone.forwarders ?? ""));
      if (nextType === "slave" && nextMasters.length === 0) {
        return res.status(400).json({ message: "Slave zones require at least one master server" });
      }
      if (nextType === "forward" && nextForwarders.length === 0) {
        return res.status(400).json({ message: "Forward zones require at least one forwarder" });
      }

      const updated = await storage.updateZone(id, allowed);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/zones/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });
      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }

      const management = await bind9Service.getManagementSummary();
      if (!management.features.zones) {
        return res.status(409).json({
          message:
            "This server connection cannot manage zones because named.conf.local is not included or not writable",
        });
      }

      try {
        await bind9Service.removeZoneFromConfig(zone.domain);
        await bind9Service.reload();
      } catch (removeError: any) {
        console.error(`[api] Failed to remove zone from config: ${removeError.message}`);
        return res.status(500).json({
          message: `BIND9 config update failed, zone was not removed from the application database: ${removeError.message}`,
        });
      }

      await storage.deleteZone(id);
      await storage.insertLog({
        level: "WARN",
        source: "zones",
        message: `Zone ${zone.domain} deleted`,
      });

      res.json({ message: "Zone deleted" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/zones/:id/records", requireViewer, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });
      const records = await storage.getRecords(id);
      res.json(records);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/zones/:id/records", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const zone = await storage.getZone(id);
      if (!zone) return res.status(404).json({ message: "Zone not found" });
      if (zone.type !== "master") {
        return res.status(400).json({ message: "Records can only be edited on master zones" });
      }

      const data = insertDnsRecordSchema.parse({ ...req.body, zoneId: id });
      const currentRecords = await storage.getRecords(id);
      const nextRecords = [
        ...currentRecords,
        {
          id: "__new__",
          zoneId: id,
          name: data.name,
          type: data.type,
          value: data.value,
          ttl: data.ttl ?? 3600,
          priority: data.priority ?? null,
        },
      ];

      const serial = await writeZoneState(zone, nextRecords);
      await syncZoneDbFromFile(id, zone.filePath, serial);

      const syncedRecords = await storage.getRecords(id);
      const record = syncedRecords.find(
        (item) =>
          item.name === data.name &&
          item.type === data.type &&
          item.value === data.value &&
          item.ttl === (data.ttl ?? 3600) &&
          (item.priority ?? null) === (data.priority ?? null),
      );
      if (!record) {
        throw new Error(`Record ${data.name} ${data.type} could not be reloaded from BIND9`);
      }

      await storage.insertLog({
        level: "INFO",
        source: "records",
        message: `Record ${record.name} ${record.type} ${record.value} added to ${zone.domain}`,
      });
      await updateReverseRecord("create", record);

      res.status(201).json(record);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/records/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const record = await storage.getRecord(id);
      if (!record) return res.status(404).json({ message: "Record not found" });
      const zone = await storage.getZone(record.zoneId);
      if (!zone) return res.status(404).json({ message: "Zone not found" });
      if (zone.type !== "master") {
        return res.status(400).json({ message: "Records can only be edited on master zones" });
      }

      const allowed: Record<string, any> = {};
      const { name, type, value, ttl, priority } = req.body;
      const allowedDnsTypes = [
        "A",
        "AAAA",
        "CNAME",
        "MX",
        "TXT",
        "NS",
        "PTR",
        "SRV",
        "CAA",
        "SOA",
        "TLSA",
        "DS",
        "DNSKEY",
      ];

      if (name !== undefined) allowed.name = String(name);
      if (type !== undefined) {
        if (!allowedDnsTypes.includes(String(type).toUpperCase())) {
          return res.status(400).json({
            message: `Invalid record type. Allowed: ${allowedDnsTypes.join(", ")}`,
          });
        }
        allowed.type = String(type).toUpperCase();
      }
      if (value !== undefined) allowed.value = String(value);
      if (ttl !== undefined) allowed.ttl = parseInt(ttl, 10) || 3600;
      if (priority !== undefined) allowed.priority = parseInt(priority, 10) || null;

      const proposed = { ...record, ...allowed };
      const currentRecords = await storage.getRecords(record.zoneId);
      const nextRecords = currentRecords.map((existing) =>
        existing.id === record.id ? { ...existing, ...proposed } : existing,
      );

      const serial = await writeZoneState(zone as any, nextRecords);
      await syncZoneDbFromFile(record.zoneId, zone.filePath, serial);

      const syncedRecords = await storage.getRecords(record.zoneId);
      const updated = syncedRecords.find(
        (item) =>
          item.name === proposed.name &&
          item.type === proposed.type &&
          item.value === proposed.value &&
          item.ttl === proposed.ttl &&
          (item.priority ?? null) === (proposed.priority ?? null),
      );
      if (!updated) {
        throw new Error(`Record ${proposed.name} ${proposed.type} could not be reloaded from BIND9`);
      }

      await updateReverseRecord("update", updated, record);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/records/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const record = await storage.getRecord(id);
      if (!record) return res.status(404).json({ message: "Record not found" });
      const zone = await storage.getZone(record.zoneId);
      if (!zone) return res.status(404).json({ message: "Zone not found" });
      if (zone.type !== "master") {
        return res.status(400).json({ message: "Records can only be edited on master zones" });
      }

      const currentRecords = await storage.getRecords(record.zoneId);
      const nextRecords = currentRecords.filter((existing) => existing.id !== id);
      const serial = await writeZoneState(zone, nextRecords);
      await syncZoneDbFromFile(record.zoneId, zone.filePath, serial);

      await updateReverseRecord("delete", record);
      res.json({ message: "Record deleted" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });
}
