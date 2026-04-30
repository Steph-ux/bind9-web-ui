import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";

import { insertRpzEntrySchema } from "@shared/schema";

import { bind9Service } from "./bind9-service";
import { storage } from "./storage";

type RegisterRpzRoutesOptions = {
  app: Express;
  requireAdmin: RequestHandler;
  requireOperator: RequestHandler;
  safeError: (status: number, message: string) => string;
};

let rpzSyncLock = Promise.resolve();
const DEFAULT_RPZ_ZONE = "rpz.intra";
const SUPPORTED_RPZ_TYPES = new Set(["nxdomain", "nodata", "redirect"]);

type RpzSnapshotEntry = {
  name: string;
  type: string;
  target: string | null;
  comment: string | null;
  sourceZone: string | null;
};

type RpzHydrationResult = {
  imported: number;
  skipped: number;
  zones: string[];
};

async function getConfiguredRpzZones(): Promise<Array<{ zoneName: string; filePath: string }>> {
  return bind9Service.discoverRpzZones();
}

async function getDefaultRpzZoneName(): Promise<string> {
  const zones = await getConfiguredRpzZones();
  return zones[0]?.zoneName || DEFAULT_RPZ_ZONE;
}

async function hydrateRpzSnapshotFromBind(options: { force?: boolean } = {}): Promise<RpzHydrationResult> {
  if (!(await bind9Service.isAvailable())) {
    return { imported: 0, skipped: 0, zones: [] };
  }

  if (!options.force) {
    const currentStats = await storage.getRpzStats();
    if (currentStats.total > 0) {
      return { imported: 0, skipped: 0, zones: currentStats.sourceZones };
    }
  }

  const configuredZones = await getConfiguredRpzZones();
  if (configuredZones.length === 0) {
    return { imported: 0, skipped: 0, zones: [] };
  }

  const mergedEntries = new Map<string, z.infer<typeof insertRpzEntrySchema>>();
  let skipped = 0;

  for (const zone of configuredZones) {
    const zoneEntries = await bind9Service.readRpzZoneFile(zone.zoneName, zone.filePath);
    for (const entry of zoneEntries) {
      if (!SUPPORTED_RPZ_TYPES.has(entry.type)) {
        skipped += 1;
        continue;
      }

      const normalizedName = String(entry.name).trim().toLowerCase();
      if (!normalizedName || mergedEntries.has(normalizedName)) {
        skipped += 1;
        continue;
      }

      mergedEntries.set(normalizedName, {
        name: normalizedName,
        type: entry.type as "nxdomain" | "nodata" | "redirect",
        target: entry.target || "",
        comment: entry.comment || `Synced from BIND9 zone ${zone.zoneName}`,
        sourceZone: zone.zoneName,
      });
    }
  }

  await storage.clearRpzEntries();
  const entriesToInsert = Array.from(mergedEntries.values());
  const imported = entriesToInsert.length > 0 ? await storage.createRpzEntriesBatch(entriesToInsert) : 0;
  return { imported, skipped, zones: configuredZones.map((zone) => zone.zoneName) };
}

async function syncRpzZone(): Promise<void> {
  const previous = rpzSyncLock;
  let release: () => void;
  rpzSyncLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;

  try {
    const summary = await bind9Service.getManagementSummary();
    if (!summary.available) {
      throw new Error("BIND9 is not available");
    }

    const zoneData = await storage.getRpzZoneData();
    let discoveredZones = await getConfiguredRpzZones();
    const defaultZoneName = discoveredZones[0]?.zoneName || DEFAULT_RPZ_ZONE;

    if (discoveredZones.length === 0) {
      if (!summary.writablePaths.namedConfOptions || !summary.includes.namedConfLocalIncluded || !summary.writablePaths.namedConfLocal) {
        throw new Error("RPZ is not configured and the active server connection cannot update named.conf.options and named.conf.local");
      }
      await bind9Service.ensureRpzConfigured(defaultZoneName);
      discoveredZones = await getConfiguredRpzZones();
    }

    if (discoveredZones.length === 0) {
      throw new Error("Unable to resolve RPZ zone definitions after configuration");
    }

    const knownZones = new Set(discoveredZones.map((zone) => zone.zoneName));
    const groupedEntries = new Map<string, Array<{ name: string; type: string; target?: string }>>();
    for (const zone of discoveredZones) {
      groupedEntries.set(zone.zoneName, []);
    }

    for (const entry of zoneData) {
      const sourceZone = entry.sourceZone && knownZones.has(entry.sourceZone) ? entry.sourceZone : defaultZoneName;
      const zoneEntries = groupedEntries.get(sourceZone) || [];
      zoneEntries.push({ name: entry.name, type: entry.type, target: entry.target });
      groupedEntries.set(sourceZone, zoneEntries);
    }

    for (const zone of discoveredZones) {
      await bind9Service.assertWritablePath(zone.filePath, `write the RPZ zone file for ${zone.zoneName}`);
      await bind9Service.writeRpzZone(zone.zoneName, groupedEntries.get(zone.zoneName) || [], zone.filePath);
    }

    await bind9Service.reload();
  } finally {
    release!();
  }
}

async function restoreRpzSnapshot(snapshot: RpzSnapshotEntry[]): Promise<void> {
  await storage.clearRpzEntries();
  if (snapshot.length === 0) {
    return;
  }

  await storage.createRpzEntriesBatch(
    snapshot.map((entry) => ({
      name: entry.name,
      type: entry.type as any,
      target: entry.target || "",
      comment: entry.comment || "",
      sourceZone: entry.sourceZone || "",
    })),
  );
}

export function registerRpzRoutes({
  app,
  requireAdmin,
  requireOperator,
  safeError,
}: RegisterRpzRoutesOptions) {
  app.get("/api/rpz", requireOperator, async (req: Request, res: Response) => {
    try {
      await hydrateRpzSnapshotFromBind();
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const search = String(req.query.search || "").trim();
      const type = String(req.query.type || "").trim();
      const result = await storage.getRpzEntriesPaged({ page, limit, search, type });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/rpz/stats", requireOperator, async (_req: Request, res: Response) => {
    try {
      await hydrateRpzSnapshotFromBind();
      const stats = await storage.getRpzStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/rpz", requireOperator, async (req: Request, res: Response) => {
    try {
      const data = insertRpzEntrySchema.parse(req.body);
      const normalizedName = String(data.name).trim().toLowerCase();
      if (!/^[a-z0-9*.][a-z0-9.*-]*$/.test(normalizedName) || normalizedName.length > 253) {
        return res.status(400).json({ message: "Invalid domain name format" });
      }

      data.name = normalizedName;

      if (data.type === "redirect") {
        if (!data.target || !String(data.target).trim()) {
          return res.status(400).json({ message: "Redirect type requires a target IP or domain" });
        }
        const target = String(data.target).trim();
        const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(target);
        const isDomain = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(target);
        if (!isIp && !isDomain) {
          return res.status(400).json({ message: "Invalid redirect target: must be IP or domain" });
        }
      }

      if (data.comment && /[\n\r$]/.test(String(data.comment))) {
        return res.status(400).json({ message: "Comment contains invalid characters" });
      }

      await hydrateRpzSnapshotFromBind();
      data.sourceZone = data.sourceZone || await getDefaultRpzZoneName();
      const snapshot = await storage.getRpzEntries();
      const entry = await storage.createRpzEntry(data);

      try {
        await syncRpzZone();
      } catch (syncError: any) {
        await restoreRpzSnapshot(snapshot);
        return res.status(500).json({ message: `RPZ update failed, the application state was restored: ${syncError.message}` });
      }

      res.json(entry);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/rpz/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      await hydrateRpzSnapshotFromBind();
      const snapshot = await storage.getRpzEntries();
      const deleted = await storage.deleteRpzEntry(id);
      if (!deleted) {
        return res.status(404).json({ message: "Entry not found" });
      }

      try {
        await syncRpzZone();
      } catch (syncError: any) {
        await restoreRpzSnapshot(snapshot);
        return res.status(500).json({ message: `RPZ update failed, the application state was restored: ${syncError.message}` });
      }

      res.json({ message: "Entry deleted" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/rpz/zone-file", requireOperator, async (_req: Request, res: Response) => {
    try {
      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }
      const discoveredZones = await getConfiguredRpzZones();
      const mergedEntries: Array<{ name: string; type: string; target: string; comment?: string; sourceZone?: string }> = [];
      for (const zone of discoveredZones) {
        const entries = await bind9Service.readRpzZoneFile(zone.zoneName, zone.filePath);
        mergedEntries.push(...entries.map((entry) => ({ ...entry, sourceZone: zone.zoneName })));
      }
      const entries = mergedEntries.sort((left, right) => left.name.localeCompare(right.name));
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/rpz/sync", requireAdmin, async (_req: Request, res: Response) => {
    try {
      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }
      const snapshot = await storage.getRpzEntries();
      try {
        const { imported, skipped, zones } = await hydrateRpzSnapshotFromBind({ force: true });
        res.json({
          message: `Synced ${imported} entries from ${zones.length} RPZ zone(s), ${skipped} skipped`,
          imported,
          skipped,
          zones,
        });

        await storage.insertLog({
          level: "INFO",
          source: "rpz",
          message: `RPZ sync: ${imported} imported, ${skipped} skipped from ${zones.length} zone(s)`,
        });
      } catch (syncError: any) {
        await restoreRpzSnapshot(snapshot);
        return res.status(500).json({ message: `RPZ sync failed, the application state was restored: ${syncError.message}` });
      }
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/rpz/import", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { content, sourceName } = req.body;
      if (!content || typeof content !== "string") {
        return res.status(400).json({ message: "content is required and must be a string" });
      }
      if (content.length > 200 * 1024 * 1024) {
        return res.status(400).json({ message: "File too large (max 200MB)" });
      }

      const safeSource = String(sourceName || "import").replace(/[\n\r$]/g, "").slice(0, 100);
      const parsed = await bind9Service.parseRpzBlocklist(content, safeSource);
      if (parsed.length === 0) {
        return res.status(400).json({ message: "No valid RPZ entries found in the provided content" });
      }
      if (parsed.length > 1000000) {
        return res.status(400).json({ message: `Too many entries (${parsed.length}), maximum 1000000 per import` });
      }

      await hydrateRpzSnapshotFromBind();
      const snapshot = await storage.getRpzEntries();
      const dbNames = await storage.getRpzExistingNames(parsed.map((entry) => entry.name));
      const newEntries = parsed.filter((entry) => !dbNames.has(entry.name));
      const duplicates = parsed.length - newEntries.length;
      const defaultZoneName = await getDefaultRpzZoneName();
      const entriesToInsert = newEntries.map((entry) => ({
        name: entry.name,
        type: entry.type as any,
        target: entry.target || "",
        comment: entry.comment || `Imported from ${safeSource}`,
        sourceZone: defaultZoneName,
      }));
      const imported = entriesToInsert.length > 0 ? await storage.createRpzEntriesBatch(entriesToInsert) : 0;

      try {
        await syncRpzZone();
      } catch (syncError: any) {
        await restoreRpzSnapshot(snapshot);
        return res.status(500).json({ message: `RPZ import failed, the application state was restored: ${syncError.message}` });
      }

      res.json({
        message: `Imported ${imported} entries, ${duplicates} duplicates skipped`,
        total: parsed.length,
        imported,
        duplicates,
      });

      await storage.insertLog({
        level: "INFO",
        source: "rpz",
        message: `RPZ import from '${safeSource}': ${imported} added, ${duplicates} duplicates skipped, ${parsed.length} total parsed`,
      });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/rpz/import-url", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { url, sourceName } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ message: "url is required" });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ message: "Invalid URL format" });
      }
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return res.status(400).json({ message: "Only http/https URLs are allowed" });
      }

      const hostname = parsedUrl.hostname;
      if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|localhost|::1|fe80::|fd[0-9a-f]{2}:|fc[0-9a-f]{2}:|169\.254\.|100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.)/i.test(hostname)) {
        return res.status(400).json({ message: "Private/internal URLs are not allowed" });
      }

      const safeSource = String(sourceName || parsedUrl.hostname).replace(/[\n\r$]/g, "").slice(0, 100);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(120000),
        headers: { "User-Agent": "BIND9-Admin-Panel/RPZ-Import" },
      });
      if (!response.ok) {
        return res.status(400).json({ message: `Failed to fetch URL: HTTP ${response.status}` });
      }

      const content = await response.text();
      if (content.length > 200 * 1024 * 1024) {
        return res.status(400).json({ message: "File too large (max 200MB)" });
      }

      const parsed = await bind9Service.parseRpzBlocklist(content, safeSource);
      if (parsed.length === 0) {
        return res.status(400).json({ message: "No valid RPZ entries found in the fetched content" });
      }
      if (parsed.length > 1000000) {
        return res.status(400).json({ message: `Too many entries (${parsed.length}), maximum 1000000 per import` });
      }

      await hydrateRpzSnapshotFromBind();
      const snapshot = await storage.getRpzEntries();
      const dbNames = await storage.getRpzExistingNames(parsed.map((entry) => entry.name));
      const newEntries = parsed.filter((entry) => !dbNames.has(entry.name));
      const duplicates = parsed.length - newEntries.length;
      const defaultZoneName = await getDefaultRpzZoneName();
      const entriesToInsert = newEntries.map((entry) => ({
        name: entry.name,
        type: entry.type as any,
        target: entry.target || "",
        comment: entry.comment || `Imported from ${safeSource}`,
        sourceZone: defaultZoneName,
      }));
      const imported = entriesToInsert.length > 0 ? await storage.createRpzEntriesBatch(entriesToInsert) : 0;

      try {
        await syncRpzZone();
      } catch (syncError: any) {
        await restoreRpzSnapshot(snapshot);
        return res.status(500).json({ message: `RPZ import failed, the application state was restored: ${syncError.message}` });
      }

      res.json({
        message: `Imported ${imported} entries, ${duplicates} duplicates skipped`,
        total: parsed.length,
        imported,
        duplicates,
      });

      await storage.insertLog({
        level: "INFO",
        source: "rpz",
        message: `RPZ import from URL '${safeSource}': ${imported} added, ${duplicates} duplicates skipped, ${parsed.length} total parsed`,
      });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/rpz", requireAdmin, async (_req: Request, res: Response) => {
    try {
      await hydrateRpzSnapshotFromBind();
      const snapshot = await storage.getRpzEntries();
      const stats = await storage.getRpzStats();
      const count = stats.total;
      await storage.clearRpzEntries();

      try {
        await syncRpzZone();
      } catch (syncError: any) {
        await restoreRpzSnapshot(snapshot);
        return res.status(500).json({ message: `RPZ clear failed, the application state was restored: ${syncError.message}` });
      }

      await storage.insertLog({
        level: "WARN",
        source: "rpz",
        message: `All RPZ entries cleared (${count} removed)`,
      });

      res.json({ message: `All ${count} RPZ entries cleared` });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });
}
