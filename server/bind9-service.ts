// Copyright Â(c) 2025 Stephane ASSOGBA
/**
 * BIND9 Integration Service
 * Interacts with a real BIND9 installation via rndc, zone files and system commands.
 * Supports both LOCAL execution and REMOTE execution via SSH.
 * Gracefully degrades if BIND9 is not installed/accessible.
 */
import { exec } from "child_process";
import { promisify } from "util";
import fsPromises from "fs/promises";
import fs from "fs";
import os from "os";
import path from "path";
import { sshManager } from "./ssh-manager";

const execAsync = promisify(exec);

// Default paths â€” used for local mode, overridden by SSH connection config
let BIND9_CONF_DIR = process.env.BIND9_CONF_DIR || "/etc/bind";
let BIND9_ZONE_DIR = process.env.BIND9_ZONE_DIR || "/var/cache/bind";
let RNDC_BIN = process.env.RNDC_BIN || "rndc";
const NAMED_CHECKCONF = process.env.NAMED_CHECKCONF || "named-checkconf";
const NAMED_CHECKZONE = process.env.NAMED_CHECKZONE || "named-checkzone";

export type ExecutionMode = "local" | "ssh";

export interface Bind9Status {
    running: boolean;
    version: string;
    uptime: string;
    zones: number;
    pid: number | null;
    threads: number;
}

export interface SystemMetrics {
    cpu: { user: number; system: number; total: number };
    memory: { used: number; total: number; cached: number };
    openFiles: number;
    interfaces: Array<{ name: string; ip: string; rx: string; tx: string }>;
}

export interface Bind9ConfigIncludes {
    namedConfLocalIncluded: boolean;
    namedConfAclsIncluded: boolean;
    namedConfKeysIncluded: boolean;
}

export interface Bind9ZoneLayout {
    strategy: "flat" | "split";
    forwardDir: string | null;
    reverseDir: string | null;
}

export interface Bind9ManagementSummary {
    mode: ExecutionMode;
    available: boolean;
    includes: Bind9ConfigIncludes;
    zoneLayout: Bind9ZoneLayout;
    writablePaths: {
        namedConfLocal: boolean;
        namedConfOptions: boolean;
        namedConfAcls: boolean;
        namedConfKeys: boolean;
    };
    rpz: {
        configured: boolean;
        zoneName: string | null;
        filePath: string | null;
        writable: boolean;
    };
    features: {
        zones: boolean;
        acls: boolean;
        keys: boolean;
        rpz: boolean;
    };
}

class Bind9Service {
    private available: boolean | null = null;
    private mode: ExecutionMode = "local";
    private sudoAllowedCommands: Set<string> | null = null;
    private managementSummaryCache: Bind9ManagementSummary | null = null;
    private networkMetricsWarningLogged = false;
    private remoteBinaryPathCache: Map<string, string> = new Map();

    /** Set execution mode and paths */
    configure(config: {
        mode: ExecutionMode;
        confDir?: string;
        zoneDir?: string;
        rndcBin?: string;
    }) {
        this.mode = config.mode;
        if (config.confDir) {
            if (!/^[a-zA-Z0-9.\/_-]+$/.test(config.confDir)) {
                throw new Error("Invalid confDir path: contains disallowed characters");
            }
            BIND9_CONF_DIR = config.confDir;
        }
        if (config.zoneDir) {
            if (!/^[a-zA-Z0-9.\/_-]+$/.test(config.zoneDir)) {
                throw new Error("Invalid zoneDir path: contains disallowed characters");
            }
            BIND9_ZONE_DIR = config.zoneDir;
        }
        if (config.rndcBin) {
            if (!/^[a-zA-Z0-9.\/_-]+$/.test(config.rndcBin)) {
                throw new Error("Invalid rndcBin path: contains disallowed characters");
            }
            RNDC_BIN = config.rndcBin;
        }
        // Reset availability cache when config changes
        this.available = null;
        this.sudoAllowedCommands = null;
        this.managementSummaryCache = null;
        this.remoteBinaryPathCache.clear();
        console.log(`[bind9] Mode: ${this.mode}, confDir: ${BIND9_CONF_DIR}, zoneDir: ${BIND9_ZONE_DIR}`);
    }

    /** Get current execution mode */
    getMode(): ExecutionMode {
        return this.mode;
    }

    getZoneDir(): string {
        return BIND9_ZONE_DIR;
    }

    getDefaultZoneFilePath(domain: string, type: "master" | "slave" | "forward"): string {
        if (type === "forward") return "";
        return path.posix.join(BIND9_ZONE_DIR, `db.${domain}`);
    }

    private quoteShellArg(value: string): string {
        return `'${value.replace(/'/g, `'\\''`)}'`;
    }

    private escapeRegExp(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    private stripBindConfigComments(content: string): string {
        return content
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/.*$/gm, "")
            .replace(/#.*$/gm, "");
    }

    private uniqueEntries(entries: string[]): string[] {
        const seen = new Set<string>();
        const result: string[] = [];
        for (const entry of entries) {
            const normalized = entry.trim().replace(/\s+/g, " ");
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);
            result.push(normalized);
        }
        return result;
    }

    private extractBraceDirectiveBodies(content: string, directive: string): string[] {
        const cleaned = this.stripBindConfigComments(content);
        const escapedDirective = this.escapeRegExp(directive);
        const pattern = new RegExp(`\\b${escapedDirective}\\b\\s*\\{`, "gi");
        const bodies: string[] = [];
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(cleaned)) !== null) {
            let cursor = pattern.lastIndex;
            let depth = 1;
            let body = "";

            while (cursor < cleaned.length && depth > 0) {
                const char = cleaned[cursor++];
                if (char === "{") {
                    depth += 1;
                    body += char;
                    continue;
                }
                if (char === "}") {
                    depth -= 1;
                    if (depth > 0) {
                        body += char;
                    }
                    continue;
                }
                body += char;
            }

            if (depth === 0) {
                bodies.push(body.trim());
            }

            pattern.lastIndex = cursor;
        }

        return bodies;
    }

    private parseDirectiveList(content: string, directive: string): string[] {
        const entries = this.extractBraceDirectiveBodies(content, directive)
            .flatMap((body) => body.split(";"))
            .map((entry) => entry.trim())
            .filter(Boolean);
        return this.uniqueEntries(entries);
    }

    private parseAclDirectiveEntries(content: string, directive: string): string[] {
        const entries = [...this.parseDirectiveList(content, directive)];
        const cleaned = this.stripBindConfigComments(content);
        const escapedDirective = this.escapeRegExp(directive);
        const singleRegex = new RegExp(`\\b${escapedDirective}\\b\\s+([^;{}]+);`, "gi");
        let match: RegExpExecArray | null;

        while ((match = singleRegex.exec(cleaned)) !== null) {
            const value = match[1].trim().replace(/\s+/g, " ");
            if (value) {
                entries.push(value);
            }
        }

        return this.uniqueEntries(entries);
    }

    private parseResponsePolicyZones(content: string): string[] {
        const zoneNames: string[] = [];
        for (const body of this.extractBraceDirectiveBodies(content, "response-policy")) {
            let quotedMatch: RegExpExecArray | null;
            const quotedRegex = /\bzone\b\s+"([^"]+)"/gi;
            while ((quotedMatch = quotedRegex.exec(body)) !== null) {
                zoneNames.push(quotedMatch[1].trim());
            }

            let bareMatch: RegExpExecArray | null;
            const bareRegex = /\bzone\b\s+([A-Za-z0-9._-]+)/gi;
            while ((bareMatch = bareRegex.exec(body)) !== null) {
                zoneNames.push(bareMatch[1].trim());
            }
        }

        return this.uniqueEntries(zoneNames);
    }

    async discoverRpzZones(): Promise<Array<{ zoneName: string; filePath: string }>> {
        let zoneNames: string[] = [];

        try {
            const optionsContent = await this.readNamedConfOptions();
            zoneNames = this.parseResponsePolicyZones(optionsContent);
        } catch {
            zoneNames = [];
        }

        if (zoneNames.length === 0) {
            try {
                const result = await this.execCommand(`${NAMED_CHECKCONF} -p 2>/dev/null`, true);
                zoneNames = this.parseResponsePolicyZones(result.stdout);
            } catch {
                zoneNames = [];
            }
        }

        if (zoneNames.length === 0) {
            return [];
        }

        let configuredZones: Array<{ domain: string; type: string; filePath: string }> = [];
        try {
            configuredZones = await this.syncZonesFromConfig();
        } catch {
            configuredZones = [];
        }

        return zoneNames.map((zoneName) => {
            const zoneConfig = configuredZones.find((zone) => zone.domain === zoneName);
            const configuredPath = zoneConfig?.filePath?.trim();
            const filePath = configuredPath
                ? (configuredPath.startsWith("/") ? configuredPath : path.posix.join(BIND9_ZONE_DIR, configuredPath))
                : path.posix.join(BIND9_ZONE_DIR, `db.${zoneName}`);

            return { zoneName, filePath };
        });
    }

    private async getSudoAllowedCommands(): Promise<Set<string>> {
        if (this.mode !== "ssh" || !sshManager.isConfigured()) {
            return new Set();
        }
        if (this.sudoAllowedCommands) {
            return this.sudoAllowedCommands;
        }

        const allowed = new Set<string>();
        try {
            const result = await sshManager.exec("sudo -n -l 2>/dev/null || true");
            const output = `${result.stdout}\n${result.stderr}`;
            const commandRegex = /\/[A-Za-z0-9._/-]+/g;
            let match: RegExpExecArray | null;
            while ((match = commandRegex.exec(output)) !== null) {
                allowed.add(match[0]);
            }
        } catch {
            // Ignore; lack of sudo listing simply means no privileged file write fallback.
        }

        this.sudoAllowedCommands = allowed;
        return allowed;
    }

    private async getPrivilegedCopyCommand(): Promise<string | null> {
        const allowed = await this.getSudoAllowedCommands();
        const candidates = ["/bin/cp", "/usr/bin/cp"];
        return candidates.find((cmd) => allowed.has(cmd)) || null;
    }

    private async getRemoteBinaryPath(binary: string, candidates: string[]): Promise<string> {
        if (this.mode !== "ssh" || !sshManager.isConfigured()) {
            return binary;
        }

        const cached = this.remoteBinaryPathCache.get(binary);
        if (cached) {
            return cached;
        }

        for (const candidate of candidates) {
            try {
                const result = await sshManager.exec(`[ -x ${this.quoteShellArg(candidate)} ] && printf %s ${this.quoteShellArg(candidate)}`);
                const resolved = result.stdout.trim();
                if (resolved) {
                    this.remoteBinaryPathCache.set(binary, resolved);
                    return resolved;
                }
            } catch {
                // Ignore and try next candidate.
            }
        }

        try {
            const result = await sshManager.exec(`command -v ${binary} 2>/dev/null || true`);
            const resolved = result.stdout.trim();
            if (resolved) {
                this.remoteBinaryPathCache.set(binary, resolved);
                return resolved;
            }
        } catch {
            // Ignore fallback failure.
        }

        return binary;
    }

    private async resolveRemoteCommand(command: string): Promise<string> {
        if (this.mode !== "ssh" || !sshManager.isConfigured()) {
            return command;
        }

        const replacements: Array<[string, string]> = [
            ["named-checkzone", await this.getRemoteBinaryPath("named-checkzone", ["/usr/bin/named-checkzone", "/usr/sbin/named-checkzone"])],
            ["named-checkconf", await this.getRemoteBinaryPath("named-checkconf", ["/usr/bin/named-checkconf", "/usr/sbin/named-checkconf"])],
            ["rndc", await this.getRemoteBinaryPath("rndc", ["/usr/sbin/rndc", "/usr/bin/rndc"])],
            ["named", await this.getRemoteBinaryPath("named", ["/usr/sbin/named", "/usr/bin/named"])],
        ];

        let resolvedCommand = command;
        for (const [binary, resolvedPath] of replacements) {
            const escaped = binary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            resolvedCommand = resolvedCommand.replace(new RegExp(`\\b${escaped}\\b`, "g"), resolvedPath);
        }

        return resolvedCommand;
    }

    async canWritePath(filePath: string): Promise<boolean> {
        if (!filePath) return false;

        if (this.mode === "ssh" && sshManager.isConfigured()) {
            const quoted = this.quoteShellArg(filePath);
            try {
                const result = await sshManager.exec(
                    `TARGET=${quoted}; if [ -e "$TARGET" ]; then [ -w "$TARGET" ] && echo yes || echo no; else PARENT=$(dirname "$TARGET"); [ -w "$PARENT" ] && echo yes || echo no; fi`
                );
                if (result.stdout.trim() === "yes") {
                    return true;
                }
            } catch {
                // Fall back to sudo capability check below.
            }

            return (await this.getPrivilegedCopyCommand()) !== null;
        }

        try {
            await fsPromises.access(filePath, fs.constants.W_OK);
            return true;
        } catch {
            try {
                await fsPromises.access(path.posix.dirname(filePath), fs.constants.W_OK);
                return true;
            } catch {
                return false;
            }
        }
    }

    async assertWritablePath(filePath: string, purpose: string): Promise<void> {
        if (await this.canWritePath(filePath)) {
            return;
        }

        const location = this.mode === "ssh" ? "over SSH" : "locally";
        throw new Error(`Cannot ${purpose}: ${filePath} is not writable ${location}`);
    }

    async getConfigIncludes(): Promise<Bind9ConfigIncludes> {
        try {
            const confPath = path.posix.join(BIND9_CONF_DIR, "named.conf");
            const content = await this.readRemoteFile(confPath);
            return {
                namedConfLocalIncluded: content.includes("named.conf.local"),
                namedConfAclsIncluded: content.includes("named.conf.acls"),
                namedConfKeysIncluded: content.includes("named.conf.keys"),
            };
        } catch {
            return {
                namedConfLocalIncluded: false,
                namedConfAclsIncluded: false,
                namedConfKeysIncluded: false,
            };
        }
    }

    async detectZoneLayout(): Promise<Bind9ZoneLayout> {
        try {
            const zones = await this.syncZonesFromConfig();
            const forwardZone = zones.find((zone) => zone.filePath && !zone.domain.endsWith(".arpa"));
            const reverseZone = zones.find((zone) => zone.filePath && zone.domain.endsWith(".arpa"));
            const forwardDir = forwardZone?.filePath ? path.posix.dirname(forwardZone.filePath) : null;
            const reverseDir = reverseZone?.filePath ? path.posix.dirname(reverseZone.filePath) : null;

            return {
                strategy: forwardDir && reverseDir && forwardDir !== reverseDir ? "split" : "flat",
                forwardDir,
                reverseDir,
            };
        } catch {
            return {
                strategy: "flat",
                forwardDir: null,
                reverseDir: null,
            };
        }
    }

    async getPreferredZoneFilePath(
        domain: string,
        type: "master" | "slave" | "forward",
        options: { hintBaseName?: string } = {}
    ): Promise<string> {
        if (type === "forward") return "";

        const layout = await this.detectZoneLayout();
        const isReverseZone = domain.endsWith(".arpa");
        const fallbackDir = isReverseZone && layout.strategy === "split"
            ? path.posix.join(BIND9_ZONE_DIR, "reverse")
            : !isReverseZone && layout.strategy === "split"
                ? path.posix.join(BIND9_ZONE_DIR, "forward")
                : BIND9_ZONE_DIR;

        const targetDir = isReverseZone
            ? (layout.reverseDir || fallbackDir)
            : (layout.forwardDir || fallbackDir);

        const baseName = options.hintBaseName?.trim() || domain;
        return path.posix.join(targetDir, baseName);
    }

    async getManagementSummary(): Promise<Bind9ManagementSummary> {
        if (this.managementSummaryCache) {
            return this.managementSummaryCache;
        }

        const available = await this.isAvailable();
        if (!available) {
            const summary: Bind9ManagementSummary = {
                mode: this.mode,
                available: false,
                includes: {
                    namedConfLocalIncluded: false,
                    namedConfAclsIncluded: false,
                    namedConfKeysIncluded: false,
                },
                zoneLayout: {
                    strategy: "flat",
                    forwardDir: null,
                    reverseDir: null,
                },
                writablePaths: {
                    namedConfLocal: false,
                    namedConfOptions: false,
                    namedConfAcls: false,
                    namedConfKeys: false,
                },
                rpz: {
                    configured: false,
                    zoneName: null,
                    filePath: null,
                    writable: false,
                },
                features: {
                    zones: false,
                    acls: false,
                    keys: false,
                    rpz: false,
                },
            };
            this.managementSummaryCache = summary;
            return summary;
        }

        const includes = await this.getConfigIncludes();
        const zoneLayout = await this.detectZoneLayout();
        const rpzZones = await this.discoverRpzZones();
        const rpz = rpzZones[0] ?? null;
        const namedConfLocal = path.posix.join(BIND9_CONF_DIR, "named.conf.local");
        const namedConfOptions = path.posix.join(BIND9_CONF_DIR, "named.conf.options");
        const namedConfAcls = path.posix.join(BIND9_CONF_DIR, "named.conf.acls");
        const namedConfKeys = path.posix.join(BIND9_CONF_DIR, "named.conf.keys");
        const writablePaths = {
            namedConfLocal: await this.canWritePath(namedConfLocal),
            namedConfOptions: await this.canWritePath(namedConfOptions),
            namedConfAcls: await this.canWritePath(namedConfAcls),
            namedConfKeys: await this.canWritePath(namedConfKeys),
        };
        const rpzWritable = rpzZones.length > 0
            ? (await Promise.all(rpzZones.map((zone) => this.canWritePath(zone.filePath)))).every(Boolean)
            : writablePaths.namedConfOptions && includes.namedConfLocalIncluded && writablePaths.namedConfLocal;

        const summary: Bind9ManagementSummary = {
            mode: this.mode,
            available,
            includes,
            zoneLayout,
            writablePaths,
            rpz: {
                configured: rpzZones.length > 0,
                zoneName: rpzZones.length > 0 ? rpzZones.map((zone) => zone.zoneName).join(", ") : null,
                filePath: rpz?.filePath || null,
                writable: rpzWritable,
            },
            features: {
                zones: includes.namedConfLocalIncluded && writablePaths.namedConfLocal,
                acls: includes.namedConfAclsIncluded && writablePaths.namedConfAcls,
                keys: includes.namedConfKeysIncluded && writablePaths.namedConfKeys,
                rpz: rpzWritable,
            },
        };

        this.managementSummaryCache = summary;
        return summary;
    }

    /** Execute a shell command (locally or via SSH) */
    private async execCommand(command: string, useSudo = false): Promise<{ stdout: string; stderr: string }> {
        if (this.mode === "ssh" && sshManager.isConfigured()) {
            let resolvedCommand = await this.resolveRemoteCommand(command);
            if (useSudo) resolvedCommand = `sudo -n ${resolvedCommand}`;
            const result = await sshManager.exec(resolvedCommand);
            return { stdout: result.stdout, stderr: result.stderr };
        }
        return execAsync(command);
    }

    /** Execute a command on a specific SSH connection by ID */
    async execOnConnection(connectionId: string, command: string, useSudo = false): Promise<{ stdout: string; stderr: string }> {
        let resolvedCommand = await this.resolveRemoteCommand(command);
        if (useSudo) resolvedCommand = `sudo -n ${resolvedCommand}`;
        const result = await sshManager.execById(connectionId, resolvedCommand);
        return { stdout: result.stdout, stderr: result.stderr };
    }

    /** Read a file on a specific SSH connection by ID */
    async readFileOnConnection(connectionId: string, filePath: string): Promise<string> {
        return sshManager.readFileById(connectionId, filePath);
    }

    /** Read a raw file (locally or via SSH/SFTP) â€” public for replication */
    async readRawFile(filePath: string): Promise<string> {
        return this.readRemoteFile(filePath);
    }

    /** Read a file (locally or via SSH/SFTP) */
    private async readRemoteFile(filePath: string): Promise<string> {
        if (this.mode === "ssh" && sshManager.isConfigured()) {
            return sshManager.readFile(filePath);
        }
        return fsPromises.readFile(filePath, "utf-8");
    }

    /** Write a file (locally or via SSH/SFTP) â€” tries SFTP first, falls back to sudo tee */
    private async writeRemoteFile(filePath: string, content: string): Promise<void> {
        if (this.mode === "ssh" && sshManager.isConfigured()) {
            try {
                await sshManager.writeFile(filePath, content);
            } catch {
                // SFTP failed (likely permission denied) â€” try via sudo tee
                await this.writeRemoteFilePrivileged(filePath, content);
            }
            this.managementSummaryCache = null;
            return;
        }
        await fsPromises.writeFile(filePath, content, "utf-8");
        this.managementSummaryCache = null;
    }

    /** Write a file via sudo (for protected directories like /etc/bind) */
    private async writeRemoteFilePrivileged(filePath: string, content: string): Promise<void> {
        // Write to a temp file via SFTP (which works in user's home), then sudo cp to target
        const tmpFile = `/tmp/bind9admin_${Date.now()}.tmp`;
        const privilegedCopy = await this.getPrivilegedCopyCommand();
        if (!privilegedCopy) {
            throw new Error(`Cannot write ${filePath}: sudo file copy is not permitted for the active SSH user`);
        }
        try {
            await sshManager.writeFile(tmpFile, content);
            // Copy with sudo, preserving permissions of the target if it exists
            await this.execCommand(
                `sudo -n ${privilegedCopy} ${this.quoteShellArg(tmpFile)} ${this.quoteShellArg(filePath)} && rm -f ${this.quoteShellArg(tmpFile)}`,
                false
            );
        } catch (e: any) {
            // Clean up temp file on failure
            try { await this.execCommand(`rm -f ${this.quoteShellArg(tmpFile)}`, false); } catch { }
            throw new Error(`Cannot write ${filePath}: ${e.message}`);
        }
    }

    /** Write a file with non-destructive backup â€” preserves the original as .bak before overwriting */
    private async writeWithBackup(filePath: string, content: string): Promise<void> {
        // Preserve original file as .bak (only if it exists)
        try {
            const existing = await this.readRemoteFile(filePath);
            if (existing) {
                const backupPath = filePath + ".bak";
                await this.writeRemoteFile(backupPath, existing);
            }
        } catch {
            // File doesn't exist yet â€” no backup needed
        }
        await this.writeRemoteFile(filePath, content);
    }

    /** Restore a file from its .bak backup */
    async restoreFromBackup(filePath: string): Promise<boolean> {
        const backupPath = filePath + ".bak";
        try {
            const backup = await this.readRemoteFile(backupPath);
            if (backup) {
                await this.writeRemoteFile(filePath, backup);
                return true;
            }
        } catch {
            // No backup exists
        }
        return false;
    }

    /** Check if BIND9/rndc is available */
    async isAvailable(): Promise<boolean> {
        if (this.available !== null) return this.available;
        try {
            await this.execCommand(`${RNDC_BIN} status`, true);
            this.available = true;
        } catch {
            this.available = false;
        }
        return this.available;
    }

    /** Execute an rndc command â€” input is validated to prevent injection */
    async rndc(command: string): Promise<string> {
        // Only allow safe characters in rndc commands (alphanumeric, dots, dashes, underscores, slashes, spaces)
        // Spaces are allowed for sub-commands like "reload zone.example.com"
        // Shell metacharacters (; | & $ ` ! () <> etc.) are blocked
        if (!/^[a-zA-Z0-9.\/_ -]+$/.test(command)) {
            throw new Error(`Invalid rndc command: contains disallowed characters`);
        }
        try {
            const { stdout, stderr } = await this.execCommand(`${RNDC_BIN} ${command}`, true);
            return stdout || stderr;
        } catch (error: any) {
            throw new Error(`rndc ${command} failed: ${error.message}`);
        }
    }

    /** Get BIND9 daemon status */
    async getStatus(): Promise<Bind9Status> {
        const available = await this.isAvailable();
        if (!available) {
            return {
                running: false,
                version: "N/A (BIND9 not detected)",
                uptime: "0",
                zones: 0,
                pid: null,
                threads: 0,
            };
        }

        try {
            const output = await this.rndc("status");
            const version = output.match(/version:\s*BIND\s+(\d+[^\s]*)/)?.[1] || output.match(/version:\s*(.+)/)?.[1] || "unknown";
            const zonesCount = parseInt(output.match(/number of zones:\s*(\d+)/)?.[1] || "0");
            return {
                running: true,
                version,
                uptime: this.parseUptime(output),
                zones: zonesCount,
                pid: this.parsePid(output),
                threads: this.parseThreads(output),
            };
        } catch {
            return {
                running: false,
                version: "error",
                uptime: "0",
                zones: 0,
                pid: null,
                threads: 0,
            };
        }
    }

    /** Read a zone file and parse into records */
    async readZoneFile(filePath: string): Promise<Array<{ name: string; type: string; value: string; ttl: number; priority?: number }>> {
        try {
            const content = await this.readRemoteFile(filePath);
            return this.parseZoneFile(content);
        } catch (error: any) {
            console.error(`[bind9] Error reading zone file ${filePath}: ${error.message}`);
            // Return empty if file not found or readable, to allow zone sync to proceed
            return [];
        }
    }

    /** Write records to a zone file */
    async writeZoneFile(
        filePath: string,
        domain: string,
        records: Array<{ name: string; type: string; value: string; ttl: number; priority?: number }>,
        serial?: string,
        options: { adminEmail?: string; nameserver?: string } = {}
    ): Promise<string> {
        const newSerial = serial || this.generateSerial();
        const content = this.generateZoneFile(domain, records, newSerial, options);
        await this.writeWithBackup(filePath, content);
        return newSerial;
    }

    async validateZoneFile(domain: string, filePath: string): Promise<void> {
        const safeDomain = this.sanitizeZoneField(domain);
        const safePath = filePath.replace(/["'\n\r]/g, "");
        if (!safePath) {
            throw new Error("Zone file path is required");
        }
        try {
            await this.execCommand(`${NAMED_CHECKZONE} ${safeDomain} ${safePath}`, true);
        } catch (error: any) {
            throw new Error(`Zone validation failed: ${error.message}`);
        }
    }

    /** Read named.conf */
    async readNamedConf(): Promise<string> {
        try {
            const confPath = path.posix.join(BIND9_CONF_DIR, "named.conf");
            return await this.readRemoteFile(confPath);
        } catch (error: any) {
            throw new Error(`Cannot read named.conf: ${error.message}`);
        }
    }

    /** Read named.conf.options */
    async readNamedConfOptions(): Promise<string> {
        try {
            const confPath = path.posix.join(BIND9_CONF_DIR, "named.conf.options");
            return await this.readRemoteFile(confPath);
        } catch (error: any) {
            throw new Error(`Cannot read named.conf.options: ${error.message}`);
        }
    }

    /** Validate a config section name (prevent path traversal) */
    private validateSectionName(section: string): string {
        if (!/^[a-zA-Z0-9_-]+$/.test(section)) {
            throw new Error(`Invalid config section name: ${section}`);
        }
        return section;
    }

    /** Sanitize a BIND9 identifier (acl/key/zone name) to prevent config injection */
    private sanitizeIdentifier(name: string): string {
        // Remove any characters that could break out of quotes or inject directives
        const sanitized = name.replace(/["';{}\n\r]/g, "");
        if (sanitized !== name || !name.length) {
            throw new Error(`Invalid identifier: contains disallowed characters`);
        }
        return name;
    }

    /** Write named.conf with backup + validation */
    async writeNamedConf(section: string, content: string): Promise<void> {
        this.validateSectionName(section);
        const confPath = path.posix.join(BIND9_CONF_DIR, `named.conf.${section}`);
        const backupPath = `${confPath}.bak.${Date.now()}`;

        try {
            // Backup
            let existing = "";
            try { existing = await this.readRemoteFile(confPath); } catch { }
            if (existing) {
                await this.writeRemoteFile(backupPath, existing);
            }
            // Write new
            await this.writeRemoteFile(confPath, content);
            // Validate
            try {
                await this.execCommand(`${NAMED_CHECKCONF} ${confPath}`, true);
            } catch (checkError: any) {
                // Restore backup on validation failure
                if (existing) {
                    await this.writeRemoteFile(confPath, existing);
                }
                throw new Error(`Config validation failed: ${checkError.message}`);
            }
        } catch (error: any) {
            throw new Error(`Cannot write config: ${error.message}`);
        }
    }

    /** Write ACLs to named.conf.acls */
    async writeAclsConf(acls: Array<{ name: string; networks: string }>): Promise<void> {
        let content = "";
        for (const acl of acls) {
            const safeName = this.sanitizeIdentifier(acl.name);
            content += `acl "${safeName}" {\n`;
            // Ensure networks are semi-colon terminated
            const nets = acl.networks.split(/[,\n\s]+/).filter(s => s);
            for (const net of nets) {
                const n = net.endsWith(";") ? net : `${net};`;
                content += `    ${n}\n`;
            }
            content += `};\n\n`;
        }
        const confPath = path.posix.join(BIND9_CONF_DIR, "named.conf.acls");
        await this.writeWithBackup(confPath, content);
    }

    /** Write TSIG Keys to named.conf.keys */
    async writeKeysConf(keys: Array<{ name: string; algorithm: string; secret: string }>): Promise<void> {
        let content = "";
        for (const key of keys) {
            const safeName = this.sanitizeIdentifier(key.name);
            const safeAlgo = this.sanitizeIdentifier(key.algorithm);
            const safeSecret = key.secret.replace(/["';\\]/g, "");
            content += `key "${safeName}" {\n`;
            content += `    algorithm ${safeAlgo};\n`;
            content += `    secret "${safeSecret}";\n`;
            content += `};\n\n`;
        }
        const confPath = path.posix.join(BIND9_CONF_DIR, "named.conf.keys");
        await this.writeWithBackup(confPath, content);
    }

    /** Add a zone to named.conf.local */
    async addZoneToConfig(
        domain: string,
        type: "master" | "slave" | "forward",
        file: string,
        options: { masterServers?: string[]; forwarders?: string[] } = {}
    ): Promise<void> {
        try {
            const ALLOWED_ZONE_TYPES = ["master", "slave", "forward"];
            if (!ALLOWED_ZONE_TYPES.includes(type)) throw new Error(`Invalid zone type: ${type}`);
            const safeDomain = this.sanitizeIdentifier(domain);
            const safeFile = file.replace(/["';\n\r]/g, "");
            const confPath = path.posix.join(BIND9_CONF_DIR, "named.conf.local");
            let content = "";
            try {
                content = await this.readRemoteFile(confPath);
            } catch {
                content = "// Local zone definitions\n";
            }

            // Check if zone already exists to avoid duplicates
            if (content.includes(`zone "${safeDomain}"`)) {
                console.log(`[bind9] Zone ${safeDomain} already in config, skipping add.`);
                return;
            }

            let newBlock = `
zone "${safeDomain}" {
    type ${type};
`;
            if (type === "master") {
                if (!safeFile) throw new Error("Master zones require a zone file path");
                newBlock += `    file "${safeFile}";\n`;
            } else if (type === "slave") {
                const masterServers = (options.masterServers || []).map((server) => server.trim()).filter(Boolean);
                if (masterServers.length === 0) {
                    throw new Error("Slave zones require at least one master server");
                }
                if (safeFile) {
                    newBlock += `    file "${safeFile}";\n`;
                }
                newBlock += `    masters { ${masterServers.join("; ")}; };\n`;
            } else if (type === "forward") {
                const forwarders = (options.forwarders || []).map((server) => server.trim()).filter(Boolean);
                if (forwarders.length === 0) {
                    throw new Error("Forward zones require at least one forwarder");
                }
                newBlock += `    forward only;\n`;
                newBlock += `    forwarders { ${forwarders.join("; ")}; };\n`;
            }
            newBlock += `};\n`;
            await this.writeWithBackup(confPath, content + newBlock);
            console.log(`[bind9] Added zone ${safeDomain} to named.conf.local`);
        } catch (error: any) {
            throw new Error(`Failed to add zone to config: ${error.message}`);
        }
    }

    /** Remove a zone from named.conf.local */
    async removeZoneFromConfig(domain: string): Promise<void> {
        try {
            const safeDomain = this.sanitizeIdentifier(domain);
            const confPath = path.posix.join(BIND9_CONF_DIR, "named.conf.local");
            let content = "";
            try {
                content = await this.readRemoteFile(confPath);
            } catch {
                return; // File doesn't exist, nothing to remove
            }

            // Regex to match the zone block: zone "domain" { ... };
            // We use [\s\S]*? to match across newlines non-greedily until the first closing brace followed by semi-colon
            // This is a basic parser; for complex nested braces it might be fragile but standard BIND format is usually clean.
            const regex = new RegExp(`zone\\s+"${safeDomain}"\\s*{[\\s\\S]*?};\\s*`, "g");

            if (!regex.test(content)) {
                console.log(`[bind9] Zone ${safeDomain} not found in config, skipping remove.`);
                return;
            }

            const newContent = content.replace(regex, "");
            await this.writeWithBackup(confPath, newContent.trim() + "\n");
            console.log(`[bind9] Removed zone ${safeDomain} from named.conf.local`);
        } catch (error: any) {
            throw new Error(`Failed to remove zone from config: ${error.message}`);
        }
    }

    /** Ensure named.conf includes acls and keys configs */
    async ensureConfigIncludes(): Promise<void> {
        try {
            const namedConfPath = path.posix.join(BIND9_CONF_DIR, "named.conf");
            let content = "";
            try {
                content = await this.readRemoteFile(namedConfPath);
            } catch {
                // If named.conf doesn't exist query named.conf.options? No, just return.
                return;
            }

            const aclsInclude = `include "${path.posix.join(BIND9_CONF_DIR, "named.conf.acls")}";`;
            const keysInclude = `include "${path.posix.join(BIND9_CONF_DIR, "named.conf.keys")}";`;

            let modified = false;
            // Check loosely for the filename to avoid duplicate includes if path differs slightly
            if (!content.includes("named.conf.acls")) {
                content += `\n${aclsInclude}\n`;
                modified = true;
            }
            if (!content.includes("named.conf.keys")) {
                content += `\n${keysInclude}\n`;
                modified = true;
            }

            if (modified) {
                await this.writeWithBackup(namedConfPath, content);
                console.log("[bind9] Added missing includes to named.conf");
            }
        } catch (error: any) {
            console.error(`[bind9] Failed to ensure config includes: ${error.message}`);
        }
    }

    /** Reload BIND9 configuration */
    async reload(): Promise<string> {
        return this.rndc("reload");
    }

    /** Flush DNS cache */
    async flush(): Promise<string> {
        return this.rndc("flush");
    }

    /** Get system metrics â€” local uses Node.js os, SSH uses remote commands */
    async getSystemMetrics(): Promise<SystemMetrics> {
        try {
            if (this.mode === "ssh" && sshManager.isConfigured()) {
                return await this.getRemoteSystemMetrics();
            }
            return this.getLocalSystemMetrics();
        } catch (error) {
            console.warn("[bind9] Falling back to empty system metrics:", error);
            return this.getEmptySystemMetrics();
        }
    }

    /** Local system metrics via Node.js os module */
    private getLocalSystemMetrics(): SystemMetrics {
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        let totalUser = 0, totalSys = 0, totalIdle = 0;
        for (const cpu of cpus) {
            totalUser += cpu.times.user;
            totalSys += cpu.times.sys;
            totalIdle += cpu.times.idle;
        }
        const totalCpu = totalUser + totalSys + totalIdle;
        const userPct = totalCpu > 0 ? (totalUser / totalCpu) * 100 : 0;
        const sysPct = totalCpu > 0 ? (totalSys / totalCpu) * 100 : 0;

        const interfaces: SystemMetrics["interfaces"] = [];
        try {
            const netInterfaces = os.networkInterfaces();
            for (const [name, addrs] of Object.entries(netInterfaces)) {
                if (!addrs) continue;
                const ipv4 = addrs.find((a) => a.family === "IPv4");
                if (ipv4) {
                    interfaces.push({ name, ip: ipv4.address, rx: "N/A", tx: "N/A" });
                }
            }
        } catch (error) {
            if (!this.networkMetricsWarningLogged) {
                this.networkMetricsWarningLogged = true;
                const reason = error instanceof Error ? error.message : String(error);
                console.warn(`[bind9] Local network interface metrics unavailable; continuing without interface data (${reason})`);
            }
        }

        return {
            cpu: { user: Math.round(userPct * 10) / 10, system: Math.round(sysPct * 10) / 10, total: Math.round((userPct + sysPct) * 10) / 10 },
            memory: { used: usedMem, total: totalMem, cached: 0 },
            openFiles: 0,
            interfaces,
        };
    }

    /** Remote system metrics via SSH commands */
    private async getRemoteSystemMetrics(): Promise<SystemMetrics> {
        try {
            // CPU usage
            const cpuResult = await this.execCommand("top -bn1 | head -3 | grep '%Cpu' || mpstat 1 1 2>/dev/null | tail -1");
            let cpuUser = 0, cpuSystem = 0;
            const cpuMatch = cpuResult.stdout.match(/(\d+\.\d+)\s*us.*?(\d+\.\d+)\s*sy/);
            if (cpuMatch) {
                cpuUser = parseFloat(cpuMatch[1]);
                cpuSystem = parseFloat(cpuMatch[2]);
            }

            // Memory
            const memResult = await this.execCommand("free -b | grep Mem");
            let totalMem = 0, usedMem = 0, cachedMem = 0;
            const memMatch = memResult.stdout.match(/Mem:\s+(\d+)\s+(\d+)\s+\d+\s+\d+\s+(\d+)/);
            if (memMatch) {
                totalMem = parseInt(memMatch[1]);
                usedMem = parseInt(memMatch[2]);
                cachedMem = parseInt(memMatch[3]);
            }

            // Network interfaces
            const netResult = await this.execCommand("ip -o addr show scope global 2>/dev/null || ifconfig 2>/dev/null | grep 'inet '");
            const interfaces: SystemMetrics["interfaces"] = [];
            const lines = netResult.stdout.trim().split("\n");
            for (const line of lines) {
                // ip -o format: 2: eth0 inet 192.168.1.100/24 ...
                const ipMatch = line.match(/\d+:\s+(\S+)\s+inet\s+([\d.]+)/);
                if (ipMatch) {
                    interfaces.push({ name: ipMatch[1], ip: ipMatch[2], rx: "N/A", tx: "N/A" });
                }
            }

            // Get network stats
            try {
                const statsResult = await this.execCommand("cat /proc/net/dev | tail -n +3");
                for (const iface of interfaces) {
                    const statLine = statsResult.stdout.split("\n").find(l => l.includes(iface.name));
                    if (statLine) {
                        const parts = statLine.trim().split(/\s+/);
                        if (parts.length >= 10) {
                            const rxBytes = parseInt(parts[1]);
                            const txBytes = parseInt(parts[9]);
                            iface.rx = this.formatBytes(rxBytes);
                            iface.tx = this.formatBytes(txBytes);
                        }
                    }
                }
            } catch { }

            // Open files
            let openFiles = 0;
            try {
                const ofResult = await this.execCommand("lsof 2>/dev/null | wc -l || echo 0");
                openFiles = parseInt(ofResult.stdout.trim()) || 0;
            } catch { }

            return {
                cpu: { user: cpuUser, system: cpuSystem, total: cpuUser + cpuSystem },
                memory: { used: usedMem, total: totalMem, cached: cachedMem },
                openFiles,
                interfaces,
            };
        } catch (error: any) {
            console.error("[bind9] Remote metrics failed:", error.message);
            return this.getEmptySystemMetrics();
        }
    }

    private getEmptySystemMetrics(): SystemMetrics {
        return {
            cpu: { user: 0, system: 0, total: 0 },
            memory: { used: 0, total: 0, cached: 0 },
            openFiles: 0,
            interfaces: [],
        };
    }

    private formatBytes(bytes: number): string {
        if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
        if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
        if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${bytes} B`;
    }

    /** Get system uptime â€” local or remote */
    async getUptime(): Promise<string> {
        if (this.mode === "ssh" && sshManager.isConfigured()) {
            try {
                const result = await this.execCommand("uptime -p 2>/dev/null || uptime");
                const output = result.stdout.trim();
                // "up X days, Y hours, Z minutes"
                const match = output.match(/up\s+(.+)/);
                return match ? match[1].trim() : output;
            } catch {
                return "N/A";
            }
        }
        return this.getLocalUptime();
    }

    /** Get hostname â€” local or remote */
    async getHostname(): Promise<string> {
        if (this.mode === "ssh" && sshManager.isConfigured()) {
            try {
                const result = await this.execCommand("hostname");
                return result.stdout.trim();
            } catch {
                return "unknown";
            }
        }
        return os.hostname();
    }

    private getLocalUptime(): string {
        const uptimeSec = os.uptime();
        const days = Math.floor(uptimeSec / 86400);
        const hours = Math.floor((uptimeSec % 86400) / 3600);
        const minutes = Math.floor((uptimeSec % 3600) / 60);
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }

    /**
     * Parse named.conf.local (and included files) to extract zone declarations.
     * Returns array of { domain, type, filePath } found in BIND9 config.
     */
    async syncZonesFromConfig(): Promise<Array<{ domain: string; type: string; filePath: string }>> {
        const zones: Array<{ domain: string; type: string; filePath: string }> = [];
        const visited = new Set<string>();

        const parseFile = async (confPath: string) => {
            if (visited.has(confPath)) return;
            visited.add(confPath);

            let content: string;
            try {
                content = await this.readRemoteFile(confPath);
            } catch (e: any) {
                console.warn(`[bind9] Failed to read config file ${confPath}: ${e.message}`);
                return;
            }

            // Remove comments (both // and /* ... */ and #)
            const cleaned = content
                .replace(/\/\/.*$/gm, "")
                .replace(/#.*$/gm, "")
                .replace(/\/\*[\s\S]*?\*\//g, "");

            // 1. Process 'include' directives
            const includeRegex = /include\s+"([^"]+)"\s*;/gi;
            let includeMatch;
            while ((includeMatch = includeRegex.exec(cleaned)) !== null) {
                const includePath = includeMatch[1];
                // Handle relative paths? BIND usually uses absolute or relative to directory option
                // We'll trust it's either absolute or relative to BIND9_CONF_DIR if not absolute
                let resolvedPath = includePath;
                if (!path.isAbsolute(includePath)) {
                    resolvedPath = path.posix.join(BIND9_CONF_DIR, includePath);
                }
                await parseFile(resolvedPath);
            }

            // 2. Process 'zone' declarations using a brace tokenizer
            let tokens = [];
            let currentToken = "";
            let inQuote = false;

            for (let i = 0; i < cleaned.length; i++) {
                const char = cleaned[i];
                if (char === '"') {
                    inQuote = !inQuote;
                    currentToken += char;
                } else if (inQuote) {
                    currentToken += char;
                } else if (char === '{' || char === '}' || char === ';') {
                    if (currentToken.trim()) tokens.push(currentToken.trim());
                    tokens.push(char);
                    currentToken = "";
                } else if (/\s/.test(char)) {
                    if (currentToken.trim()) {
                        tokens.push(currentToken.trim());
                        currentToken = "";
                    }
                } else {
                    currentToken += char;
                }
            }
            if (currentToken.trim()) tokens.push(currentToken.trim());

            for (let i = 0; i < tokens.length; i++) {
                if (tokens[i] === "zone" && tokens[i + 1]) {
                    // zone "example.com" { ... };
                    let domain = tokens[i + 1].replace(/^"|"$/g, "");
                    if (tokens[i + 2] === "IN") { // zone "example.com" IN { ... };
                        // Skip IN token if present
                        i++;
                    }

                    if (tokens[i + 2] === "{") {
                        let braceCount = 1;
                        let j = i + 3;
                        let zoneBodyTokens = [];

                        while (j < tokens.length && braceCount > 0) {
                            if (tokens[j] === "{") braceCount++;
                            if (tokens[j] === "}") braceCount--;
                            if (braceCount > 0) zoneBodyTokens.push(tokens[j]);
                            j++;
                        }

                        // Parse zone body tokens for type and file
                        let type = "master";
                        let filePath = "";

                        for (let k = 0; k < zoneBodyTokens.length; k++) {
                            if (zoneBodyTokens[k] === "type" && zoneBodyTokens[k + 1]) {
                                type = zoneBodyTokens[k + 1].replace(/;$/, "");
                            }
                            if (zoneBodyTokens[k] === "file" && zoneBodyTokens[k + 1]) {
                                filePath = zoneBodyTokens[k + 1].replace(/^"|"|;$/g, "");
                            }
                        }

                        // Normalize type
                        type = type.toLowerCase();
                        if (type === "primary") type = "master";
                        if (type === "secondary") type = "slave";

                        // Log what we found
                        console.log(`[bind9] Found zone: ${domain} (type: ${type}, file: ${filePath})`);

                        zones.push({ domain, type, filePath });
                    }
                }
            }
        };

        // Start with named.conf.local, then named.conf (and named.conf.default-zones if we want, but usually filtered)
        const localConfPath = path.posix.join(BIND9_CONF_DIR, "named.conf.local");
        const mainConfPath = path.posix.join(BIND9_CONF_DIR, "named.conf");

        console.log(`[bind9] Syncing zones starting from ${localConfPath}`);
        await parseFile(localConfPath);

        // Also check main conf if local was empty or just to be safe, but usually local is included in main
        // If main includes local, we might parse it twice due to duplicate check, which is fine
        await parseFile(mainConfPath);

        // Filter out built-in zones if needed, though the parser doesn't exclude them hardcoded anymore, 
        // we can filter them here:
        const ignoredZones = [".", "localhost", "127.in-addr.arpa", "0.in-addr.arpa", "255.in-addr.arpa", "local"];
        const validZones = zones.filter(z => !ignoredZones.includes(z.domain));

        console.log(`[bind9] Sync complete. Found ${validZones.length} valid zones.`);
        return validZones;
    }

    // â”€â”€ Advanced BIND9 Server Info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /** Get configured forwarders from named-checkconf */
    async getForwarders(): Promise<string[]> {
        try {
            const content = await this.readNamedConfOptions();
            return this.parseDirectiveList(content, "forwarders");
        } catch {
            // Fallback to named-checkconf -p if direct file reads fail.
        }

        try {
            const result = await this.execCommand(`${NAMED_CHECKCONF} -p 2>/dev/null`, true);
            return this.parseDirectiveList(result.stdout, "forwarders");
        } catch {
            return [];
        }
    }

    /** Get allow-recursion and allow-query ACLs from named-checkconf */
    async getAllowRecursionQuery(): Promise<{ allowRecursion: string[]; allowQuery: string[]; allowTransfer: string[] }> {
        try {
            const content = await this.readNamedConfOptions();
            return {
                allowRecursion: this.parseAclDirectiveEntries(content, "allow-recursion"),
                allowQuery: this.parseAclDirectiveEntries(content, "allow-query"),
                allowTransfer: this.parseAclDirectiveEntries(content, "allow-transfer"),
            };
        } catch {
            // Fallback to named-checkconf -p if direct file reads fail.
        }

        try {
            const result = await this.execCommand(`${NAMED_CHECKCONF} -p 2>/dev/null`, true);
            return {
                allowRecursion: this.parseAclDirectiveEntries(result.stdout, "allow-recursion"),
                allowQuery: this.parseAclDirectiveEntries(result.stdout, "allow-query"),
                allowTransfer: this.parseAclDirectiveEntries(result.stdout, "allow-transfer"),
            };
        } catch {
            return { allowRecursion: [], allowQuery: [], allowTransfer: [] };
        }
    }

    /** Get DNSSEC signing status for zones */
    async getDnssecStatus(): Promise<Array<{ zone: string; signed: boolean; keys: Array<{ name: string; algorithm: string; status: string }> }>> {
        try {
            const result = await this.execCommand(`${RNDC_BIN} signing -list 2>/dev/null`, true);
            const zones: Array<{ zone: string; signed: boolean; keys: Array<{ name: string; algorithm: string; status: string }> }> = [];
            const lines = result.stdout.split("\n").filter(l => l.trim());

            let currentZone = "";
            let currentSigned = false;
            let currentKeys: Array<{ name: string; algorithm: string; status: string }> = [];

            for (const line of lines) {
                const trimmed = line.trim();

                // New zone line: "zone example.com:" or just "example.com"
                const zoneMatch = trimmed.match(/^(?:zone\s+)?(\S+):?\s*$/);
                // Signed/unsigned line
                const statusMatch = trimmed.match(/^(signed|unsigned)\s*$/i);
                // Key line: "Signed with key 12345, algorithm RSASHA256 (active)" or "key: Kexample.com.+013+12345"
                const keyMatch = trimmed.match(/(?:Signed with |key:\s*)K?(\S+?)[,\s]+(?:algorithm\s+)?(\S+)?\s*(?:\((\w+)\))?/i);

                if (zoneMatch) {
                    // Save previous zone if any
                    if (currentZone) {
                        zones.push({ zone: currentZone, signed: currentSigned, keys: currentKeys });
                    }
                    currentZone = zoneMatch[1].replace(/:$/, "");
                    currentSigned = false;
                    currentKeys = [];
                } else if (statusMatch) {
                    currentSigned = statusMatch[1].toLowerCase() === "signed";
                } else if (keyMatch) {
                    currentSigned = true;
                    currentKeys.push({
                        name: keyMatch[1],
                        algorithm: keyMatch[2] || "unknown",
                        status: keyMatch[3] || "active",
                    });
                } else if (/key/i.test(trimmed)) {
                    // Fallback: any line mentioning "key" implies signed
                    currentSigned = true;
                    const algMatch = trimmed.match(/algorithm\s+(\S+)/i);
                    currentKeys.push({
                        name: "key",
                        algorithm: algMatch ? algMatch[1] : "unknown",
                        status: "active",
                    });
                }
            }
            // Save last zone
            if (currentZone) {
                zones.push({ zone: currentZone, signed: currentSigned, keys: currentKeys });
            }

            // If no output from signing -list, try checking for .signed files
            if (zones.length === 0) {
                try {
                    const lsResult = await this.execCommand(`ls ${BIND9_ZONE_DIR}/*.signed 2>/dev/null || echo "none"`, true);
                    const signedFiles = lsResult.stdout.trim().split("\n").filter(f => f.endsWith(".signed") && f !== "none");
                    for (const f of signedFiles) {
                        const zoneName = path.basename(f, ".signed");
                        zones.push({ zone: zoneName, signed: true, keys: [] });
                    }
                } catch {}
            }

            return zones;
        } catch {
            return [];
        }
    }

    /** Get zone transfer status from rndc status */
    async getZoneTransfers(): Promise<{ incoming: number; outgoing: number; details: string[] }> {
        try {
            const result = await this.execCommand(`${RNDC_BIN} status 2>/dev/null`, true);
            const details: string[] = [];
            let incoming = 0;
            let outgoing = 0;

            for (const line of result.stdout.split("\n")) {
                const trimmed = line.trim();
                // Parse transfer-related lines from rndc status
                const xferInMatch = trimmed.match(/transfer\(s\) in.*?(\d+)/i);
                if (xferInMatch) incoming = parseInt(xferInMatch[1]);
                const xferOutMatch = trimmed.match(/transfer\(s\) out.*?(\d+)/i);
                if (xferOutMatch) outgoing = parseInt(xferOutMatch[1]);

                // Capture all transfer/xfers related lines (but not generic "xfer" in paths)
                if (/(transfer|xfer|slave)s?\b/i.test(trimmed) && !/\/usr\/sbin/i.test(trimmed) && trimmed) {
                    details.push(trimmed);
                }
            }

            return { incoming, outgoing, details };
        } catch {
            return { incoming: 0, outgoing: 0, details: [] };
        }
    }

    /** Get slave zones synchronization status */
    async getSlaveZonesStatus(): Promise<Array<{ zone: string; file: string; lastModified: string | null; size: number }>> {
        try {
            // Find slave zones from named-checkconf -z
            // Output may span multiple lines, so join and parse the whole output
            const confResult = await this.execCommand(`${NAMED_CHECKCONF} -z 2>/dev/null`, true);
            const slaveZones: Array<{ zone: string; file: string }> = [];

            // Flatten output: remove newlines inside zone blocks
            const flat = confResult.stdout.replace(/\n\s+/g, " ");
            // Match: zone "example.com" IN { type slave; file "db.slave"; ... };
            // or: zone example.com: type slave; file "db.slave"
            const zoneRegex = /zone\s+"?([^"\s;]+)"?\s*(?:IN\s*)?[{:]\s*[^}]*?type\s+slave\s*;\s*file\s+"([^"]+)"\s*;/gi;
            let match;
            while ((match = zoneRegex.exec(flat)) !== null) {
                slaveZones.push({ zone: match[1], file: match[2] });
            }

            // Get file status for each slave zone
            const results: Array<{ zone: string; file: string; lastModified: string | null; size: number }> = [];
            for (const sz of slaveZones) {
                try {
                    // Resolve relative path to zone dir
                    const filePath = sz.file.startsWith("/") ? sz.file : path.posix.join(BIND9_ZONE_DIR, sz.file);
                    const statResult = await this.execCommand(`stat -c "%Y %s" "${filePath}" 2>/dev/null || echo "0 0"`, true);
                    const parts = statResult.stdout.trim().split(" ");
                    const timestamp = parseInt(parts[0]) || 0;
                    const size = parseInt(parts[1]) || 0;
                    results.push({
                        zone: sz.zone,
                        file: sz.file,
                        lastModified: timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null,
                        size,
                    });
                } catch {
                    results.push({ zone: sz.zone, file: sz.file, lastModified: null, size: 0 });
                }
            }

            return results;
        } catch {
            return [];
        }
    }

    /**
     * Parse named.conf.acls to extract existing ACLs.
     * Returns array of { name, networks }
     */
    async syncAclsFromConfig(): Promise<Array<{ name: string; networks: string }>> {
        const acls: Array<{ name: string; networks: string }> = [];
        try {
            const confPath = path.posix.join(BIND9_CONF_DIR, "named.conf.acls");
            let content = "";
            try {
                content = await this.readRemoteFile(confPath);
            } catch {
                console.log("[bind9] named.conf.acls not found, skipping import.");
                return [];
            }

            // Simple regex parser for: acl "name" { 1.2.3.4; ... };
            // Matches: acl "NAME" { CONTENT };
            const aclRegex = /acl\s+"([^"]+)"\s*{([^}]+)};/g;
            let match;

            while ((match = aclRegex.exec(content)) !== null) {
                const name = match[1];
                const cleanContent = match[2]
                    .replace(/\/\/.*$/gm, "") // remove comments
                    .replace(/#.*$/gm, "")    // remove BIND-style comments
                    .replace(/\s+/g, " ")     // normalize whitespace
                    .split(";")               // split by semi-colon
                    .map(s => s.trim())
                    .filter(s => s);          // remove empty strings

                const networks = cleanContent.join("; ");
                if (name && networks) {
                    acls.push({ name, networks: networks + ";" });
                }
            }
            console.log(`[bind9] Found ${acls.length} ACLs in config`);
            return acls;

        } catch (error: any) {
            console.error(`[bind9] Failed to sync ACLs from config: ${error.message}`);
            return [];
        }
    }

    /**
     * Parse named.conf recursively to extract TSIG Keys.
     * Returns array of { name, algorithm, secret }
     */
    async syncKeysFromConfig(): Promise<Array<{ name: string; algorithm: string; secret: string }>> {
        const keys: Array<{ name: string; algorithm: string; secret: string }> = [];
        const visited = new Set<string>();

        const parseFile = async (confPath: string) => {
            if (visited.has(confPath)) return;
            visited.add(confPath);

            let content: string;
            try {
                content = await this.readRemoteFile(confPath);
            } catch { return; }

            // Remove comments
            const cleaned = content
                .replace(/\/\/.*$/gm, "")
                .replace(/#.*$/gm, "")
                .replace(/\/\*[\s\S]*?\*\//g, "");

            // 1. Process 'include' directives
            const includeRegex = /include\s+"([^"]+)"\s*;/gi;
            let includeMatch;
            while ((includeMatch = includeRegex.exec(cleaned)) !== null) {
                const includePath = includeMatch[1];
                let resolvedPath = includePath;
                if (!path.isAbsolute(includePath)) {
                    resolvedPath = path.posix.join(BIND9_CONF_DIR, includePath);
                }
                await parseFile(resolvedPath);
            }

            // 2. Parse keys: key "name" { algorithm ...; secret ...; };
            // Simple regex for standard formatted keys
            const keyRegex = /key\s+"([^"]+)"\s*{([\s\S]*?)};/g;
            let match;
            while ((match = keyRegex.exec(cleaned)) !== null) {
                const name = match[1];
                const body = match[2];

                const algoMatch = body.match(/algorithm\s+([^;]+);/);
                const secretMatch = body.match(/secret\s+"([^"]+)";/);

                if (name && algoMatch && secretMatch) {
                    keys.push({
                        name,
                        algorithm: algoMatch[1].trim(),
                        secret: secretMatch[1].trim()
                    });
                }
            }
        };

        // Start from main named.conf to catch all includes
        const mainConfPath = path.posix.join(BIND9_CONF_DIR, "named.conf");
        console.log(`[bind9] Syncing keys starting from ${mainConfPath}`);
        await parseFile(mainConfPath);

        console.log(`[bind9] Sync complete. Found ${keys.length} keys.`);
        return keys;
    }

    // â”€â”€ BIND9 Log Reading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /**
     * Read real BIND9 log files and return parsed entries.
     * Tries common log paths: /var/log/named/data/, /var/log/named/, /var/log/syslog
     */
    async readBind9Logs(limit: number = 200): Promise<Array<{ timestamp: string; level: string; source: string; message: string }>> {
        const logs: Array<{ timestamp: string; level: string; source: string; message: string }> = [];
        const linesPerSource = Math.max(20, Math.ceil(limit / 5));

        const commandWithOptionalSudo = (command: string) => {
            if (this.mode === "ssh" && sshManager.isConfigured()) {
                return `sudo -n ${command} 2>/dev/null || ${command} 2>/dev/null`;
            }
            return `${command} 2>/dev/null`;
        };

        const appendParsedLogs = (rawOutput: string, source: string) => {
            if (!rawOutput.trim()) return;

            const lines = rawOutput.trim().split("\n");
            for (const line of lines) {
                if (!line.trim()) continue;

                const bindTsMatch = line.match(/^(\d{1,2}-\w+-\d{4}\s+\d{2}:\d{2}:\d{2}\.\d+)\s+(.*)/);
                if (bindTsMatch) {
                    let timestamp: string;
                    try {
                        timestamp = new Date(bindTsMatch[1]).toISOString();
                    } catch {
                        timestamp = new Date().toISOString();
                    }

                    const rest = bindTsMatch[2];
                    let level = "INFO";
                    if (/error|fail/i.test(rest)) level = "ERROR";
                    else if (/warn/i.test(rest)) level = "WARN";
                    else if (/debug/i.test(rest)) level = "DEBUG";

                    logs.push({ timestamp, level, source, message: rest.substring(0, 500) });
                    continue;
                }

                const journalTsMatch = line.match(/^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+\S+\s+(.*)$/);
                if (journalTsMatch) {
                    let timestamp: string;
                    try {
                        timestamp = new Date(`${journalTsMatch[1]} ${new Date().getFullYear()}`).toISOString();
                    } catch {
                        timestamp = new Date().toISOString();
                    }

                    const rest = journalTsMatch[2];
                    let level = "INFO";
                    if (/error|fail/i.test(rest)) level = "ERROR";
                    else if (/warn/i.test(rest)) level = "WARN";
                    else if (/debug/i.test(rest)) level = "DEBUG";

                    logs.push({ timestamp, level, source, message: rest.substring(0, 500) });
                    continue;
                }

                logs.push({
                    timestamp: new Date().toISOString(),
                    level: /error|fail/i.test(line) ? "ERROR" : /warn/i.test(line) ? "WARN" : /debug/i.test(line) ? "DEBUG" : "INFO",
                    source,
                    message: line.substring(0, 500),
                });
            }
        };

        // Log files to check, ordered by priority
        const logFiles = [
            { path: "/var/log/named/data/query.log", source: "query" },
            { path: "/var/log/named/data/error.log", source: "error" },
            { path: "/var/log/named/data/security.log", source: "security" },
            { path: "/var/log/named/data/notification.log", source: "notify" },
            { path: "/var/log/named/data/rate_limiting.log", source: "rate-limit" },
        ];

        for (const logFile of logFiles) {
            try {
                const command = commandWithOptionalSudo(`tail -n ${linesPerSource} ${this.quoteShellArg(logFile.path)}`);
                const { stdout } = await this.execCommand(command);
                appendParsedLogs(stdout, logFile.source);
            } catch {
                // Log file doesn't exist or not readable, skip
            }
        }

        if (logs.length === 0) {
            const fallbackSources = [
                {
                    source: "named.run",
                    command: commandWithOptionalSudo(`tail -n ${limit} ${this.quoteShellArg(path.posix.join(BIND9_ZONE_DIR, "named.run"))}`),
                },
                {
                    source: "bind9-service",
                    command: commandWithOptionalSudo(`journalctl -u bind9 -n ${limit} --no-pager`),
                },
                {
                    source: "named-service",
                    command: commandWithOptionalSudo(`journalctl -u named -n ${limit} --no-pager`),
                },
            ];

            for (const fallbackSource of fallbackSources) {
                try {
                    const { stdout } = await this.execCommand(fallbackSource.command);
                    appendParsedLogs(stdout, fallbackSource.source);
                } catch {
                    // Skip unavailable fallbacks.
                }
            }
        }

        // Sort by timestamp desc and limit
        logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        return logs.slice(0, limit);
    }

    /** Monitor BIND9 log file and trigger callback on new lines */
    monitorLogFile(callback: (line: string) => void): void {
        const logPath = path.posix.join(BIND9_ZONE_DIR, "named.run"); // Default debug log or configured log
        console.log(`[bind9] Monitoring log file: ${logPath}`);

        try {
            if (!fs.existsSync(logPath)) {
                fs.writeFileSync(logPath, ""); // Create if not exists
            }

            let currentSize = fs.statSync(logPath).size;

            fs.watchFile(logPath, { interval: 1000 }, (curr, prev) => {
                if (curr.mtime <= prev.mtime) return;

                const newSize = curr.size;
                if (newSize < currentSize) {
                    currentSize = newSize; // File truncated
                    return;
                }

                const stream = fs.createReadStream(logPath, {
                    start: currentSize,
                    end: newSize,
                    encoding: "utf-8"
                });

                stream.on("data", (chunk) => {
                    const lines = (chunk as string).split("\n").filter(Boolean);
                    lines.forEach(line => callback(line));
                });

                currentSize = newSize;
            });
        } catch (error: any) {
            console.error(`[bind9] Failed to monitor log file: ${error.message}`);
        }
    }



    // â”€â”€ Private helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private generateSerial(): string {
        const now = new Date();
        const date = now.toISOString().slice(0, 10).replace(/-/g, "");
        return `${date}01`;
    }

    private parseZoneFile(content: string): Array<{ name: string; type: string; value: string; ttl: number; priority?: number }> {
        const records: Array<{ name: string; type: string; value: string; ttl: number; priority?: number }> = [];
        const lines = content.split("\n");
        console.log(`[bind9] Parsing ${lines.length} lines`);

        let currentOrigin = "@"; // Default origin
        let currentName = "@";   // Default name for inheritance
        let currentTTL = 3600;   // Default TTL

        for (const line of lines) {
            // retain indentation to detect name inheritance
            const rawLine = line;
            let trimmed = rawLine.trim();

            // Remove comments
            const commentIndex = trimmed.indexOf(";");
            if (commentIndex >= 0) {
                trimmed = trimmed.substring(0, commentIndex).trim();
            }
            if (!trimmed) continue;

            // Handle $ORIGIN and $TTL directives
            if (trimmed.startsWith("$ORIGIN")) {
                const parts = trimmed.split(/\s+/);
                if (parts[1]) currentOrigin = parts[1];
                continue;
            }
            if (trimmed.startsWith("$TTL")) {
                const parts = trimmed.split(/\s+/);
                if (parts[1]) currentTTL = parseInt(parts[1]) || 3600;
                continue;
            }

            // Parse line
            // Cases:
            // 1. NAME [TTL] [CLASS] TYPE DATA...
            // 2.      [TTL] [CLASS] TYPE DATA... (indented, inherits NAME)

            let name = currentName;
            let ttl = currentTTL;
            let type = "";
            let value = "";
            let priority: number | undefined;

            // Split by whitespace
            let tokens = trimmed.split(/\s+/);

            // Detect if line starts with whitespace (inheritance)
            const startsWithWhitespace = /^\s/.test(rawLine);

            if (!startsWithWhitespace) {
                // First token is name
                name = tokens[0];
                tokens = tokens.slice(1);
                currentName = name; // Update current name
            }

            // Now consume optional TTL and Class
            // Peek at first token
            if (tokens.length > 0) {
                // Check for TTL (digits)
                if (/^\d+$/.test(tokens[0])) {
                    ttl = parseInt(tokens[0]);
                    tokens = tokens.slice(1);
                }

                // Check for Class (IN, CH, HS) - we only care about IN but consume it if present
                if (tokens.length > 0 && /^(IN|CH|HS)$/i.test(tokens[0])) {
                    tokens = tokens.slice(1);
                }

                // Next must be Type
                if (tokens.length > 0) {
                    type = tokens[0].toUpperCase();
                    tokens = tokens.slice(1);

                    // The rest is value
                    value = tokens.join(" ");

                    if (["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "PTR", "SRV"].includes(type)) {

                        // Handle MX priority
                        if (type === "MX") {
                            const mxParts = value.trim().split(/\s+/);
                            if (mxParts.length >= 2) {
                                priority = parseInt(mxParts[0]);
                                value = mxParts.slice(1).join(" ");
                            }
                        }

                        // Handle SOA - for now just keep as string, but maybe we want to ignore it or parse it
                        // The loop splits by line, but SOA can be multi-line parentheses. 
                        // Simple parser might fail on multi-line SOA. 
                        // For this basic version, valid single-line records are most important.
                        // If type is SOA, we generally skip importing it as a record in our DB schema usually
                        // checks for SOA and handles it separately or ignores it. 
                        // The user said "nothing at all", suggesting A/CNAME/NS are missing too.

                        // Clean value (remove quotes for TXT if needed, though BIND keeps them usually)
                        if (type === "TXT") {
                            // keep quotes
                        }

                        records.push({
                            name,
                            type,
                            value,
                            ttl,
                            priority
                        });
                    }
                }
            }
        }
        return records;
    }

    /**
     * Discover the RPZ zone name and file path from BIND9 config.
     * Looks for "response-policy" in named-checkconf -p output, then finds
     * the corresponding zone declaration to get the file path.
     * Returns { zoneName, filePath } or null if no RPZ is configured.
     */
    async discoverRpzZone(): Promise<{ zoneName: string; filePath: string } | null> {
        const zones = await this.discoverRpzZones();
        return zones[0] ?? null;
    }

    /** Ensure named.conf.options includes response-policy */
    async ensureRpzConfigured(zoneName: string = "rpz.intra"): Promise<void> {
        try {
            const confPath = path.posix.join(BIND9_CONF_DIR, "named.conf.options");
            let content = "";
            try {
                content = await this.readRemoteFile(confPath);
            } catch {
                console.warn("[bind9] named.conf.options not found, skipping RPZ config.");
                return;
            }

            // Check if response-policy is already defined
            if (!content.includes("response-policy")) {
                const optionsEndIndex = content.lastIndexOf("};");
                if (optionsEndIndex !== -1) {
                    const rpzConfig = `    response-policy { zone "${zoneName}"; };\n`;
                    const newContent = content.slice(0, optionsEndIndex) + rpzConfig + content.slice(optionsEndIndex);
                    // Use writeNamedConf to assume backup/restore safety
                    await this.writeNamedConf("options", newContent);
                    console.log(`[bind9] Added response-policy to named.conf.options`);
                } else {
                    console.warn("[bind9] Could not find options block in named.conf.options to add RPZ.");
                }
            }

            // Ensure the zone is defined in named.conf.local
            // We use a dedicated file for RPZ
            await this.addZoneToConfig(zoneName, "master", path.posix.join(BIND9_ZONE_DIR, `db.${zoneName}`));

        } catch (error: any) {
            console.error(`[bind9] Failed to ensure RPZ config: ${error.message}`);
        }
    }

    /** Sanitize a zone file field to prevent directive injection ($INCLUDE, $ORIGIN, etc.) */
    private sanitizeZoneField(value: string): string {
        // Remove newlines and $-prefixed directives that could inject BIND9 directives
        return value.replace(/[\n\r]/g, "").replace(/\$INCLUDE/gi, "").replace(/\$ORIGIN/gi, "").replace(/\$TTL/gi, "");
    }

    /** Write RPZ zone file */
    async writeRpzZone(zoneName: string, entries: Array<{ name: string; type: string; target?: string }>, filePath?: string): Promise<void> {
        const safeZoneName = this.sanitizeZoneField(zoneName);
        const resolvedPath = filePath || path.posix.join(BIND9_ZONE_DIR, `db.${safeZoneName}`);
        const serial = this.generateSerial();

        const lines: string[] = [
            `; RPZ Firewall Zone: ${safeZoneName}`,
            `; Generated by BIND9 Admin Panel`,
            `$TTL 604800`,
            `@ IN SOA localhost. root.localhost. (`,
            `    ${serial} ; Serial`,
            `    604800     ; Refresh`,
            `    86400      ; Retry`,
            `    2419200    ; Expire`,
            `    604800 )   ; Negative Cache TTL`,
            `;`,
            `@ IN NS localhost.`,
            ``
        ];

        for (const entry of entries) {
            const name = this.sanitizeZoneField(entry.name);

            if (entry.type === "nxdomain") {
                lines.push(`${name}    CNAME   .`);
                if (!name.startsWith("*.")) lines.push(`*.${name}  CNAME   .`);
            } else if (entry.type === "nodata") {
                lines.push(`${name}    CNAME   *.`);
                if (!name.startsWith("*.")) lines.push(`*.${name}  CNAME   *.`);
            } else if (entry.type === "redirect" && entry.target) {
                const safeTarget = this.sanitizeZoneField(entry.target);
                const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(safeTarget);
                if (isIp) {
                    lines.push(`${name}    A   ${safeTarget}`);
                    if (!name.startsWith("*.")) lines.push(`*.${name}  A   ${safeTarget}`);
                } else {
                    const target = safeTarget.endsWith(".") ? safeTarget : `${safeTarget}.`;
                    lines.push(`${name}    CNAME   ${target}`);
                    if (!name.startsWith("*.")) lines.push(`*.${name}  CNAME   ${target}`);
                }
            }
        }

        await this.writeWithBackup(resolvedPath, lines.join("\n") + "\n");
    }


    private generateZoneFile(
        domain: string,
        records: Array<{ name: string; type: string; value: string; ttl: number; priority?: number }>,
        serial: string,
        options: { adminEmail?: string; nameserver?: string } = {}
    ): string {
        const safeDomain = this.sanitizeZoneField(domain);
        const adminEmail = this.sanitizeZoneField((options.adminEmail || `hostmaster.${safeDomain}`).replace(/@/, "."));
        const nameserver = this.sanitizeZoneField(options.nameserver || `ns1.${safeDomain}.`);

        const lines: string[] = [
            `; Zone file for ${safeDomain}`,
            `; Generated by BIND9 Admin Panel`,
            `; Serial: ${serial}`,
            `$TTL 86400`,
            `$ORIGIN ${safeDomain}.`,
            ``,
            `@ IN SOA ${nameserver} ${adminEmail}. (`,
            `    ${serial}  ; Serial`,
            `    3600       ; Refresh`,
            `    900        ; Retry`,
            `    1209600    ; Expire`,
            `    86400      ; Minimum TTL`,
            `)`,
            ``,
        ];

        for (const record of records) {
            if (record.type === "SOA") continue;
            const priority = record.priority !== undefined ? `${record.priority} ` : "";
            // Sanitize fields to prevent $INCLUDE/$ORIGIN directive injection
            const name = this.sanitizeZoneField(record.name);
            const type = this.sanitizeZoneField(record.type);
            const value = this.sanitizeZoneField(record.value);
            lines.push(`${name}\t${record.ttl}\tIN\t${type}\t${priority}${value}`);
        }

        return lines.join("\n") + "\n";
    }

    private parseUptime(output: string): string {
        const match = output.match(/boot time:\s*(.+)/i);
        if (!match) return this.getLocalUptime();
        try {
            const bootTime = new Date(match[1]);
            const now = new Date();
            const diffMs = now.getTime() - bootTime.getTime();
            const days = Math.floor(diffMs / 86400000);
            const hours = Math.floor((diffMs % 86400000) / 3600000);
            return `${days}d ${hours}h`;
        } catch {
            return this.getLocalUptime();
        }
    }

    private parsePid(output: string): number | null {
        const match = output.match(/daemon pid:\s*(\d+)/i) || output.match(/pid:\s*(\d+)/i);
        return match ? parseInt(match[1]) : null;
    }

    private parseThreads(output: string): number {
        const match = output.match(/worker threads:\s*(\d+)/i);
        return match ? parseInt(match[1]) : os.cpus().length;
    }

    /**
     * Get DNSSEC information for a zone
     * Scans BIND9_ZONE_DIR for keys and DS records
     */
    async getDnssecInfo(zoneName: string): Promise<{ enabled: boolean; keys: any[]; ds_record?: string }> {
        try {
            const files = await this.execCommand(`ls -1 ${BIND9_ZONE_DIR}`);
            const fileList = files.stdout.split("\n").map(f => f.trim()).filter(f => f);

            // Find key files: Kexample.com.+013+12345.key
            const keyFiles = fileList.filter(f => f.startsWith(`K${zoneName}.`) && f.endsWith(".key"));

            const keys = [];
            for (const keyFile of keyFiles) {
                try {
                    const content = await this.readRemoteFile(path.posix.join(BIND9_ZONE_DIR, keyFile));
                    // Check for SEP flag (KSK has 257, ZSK has 256)
                    const isKsk = content.includes(" 257 ");
                    // Extract tag from filename: Kdomain.+algo+TAG.key
                    const tagMatch = keyFile.match(/\+(\d+)\.key$/);
                    const tag = tagMatch ? tagMatch[1] : "Unknown";

                    // Extract Algo from filename: Kdomain.+ALGO+tag.key
                    const algoMatch = keyFile.match(/\+0*(\d+)\+\d+\.key$/);
                    const algo = algoMatch ? algoMatch[1] : "Unknown";

                    keys.push({
                        id: tag,
                        type: isKsk ? "KSK" : "ZSK",
                        algorithm: algo,
                        file: keyFile,
                        active: true // Assumption
                    });
                } catch (e) {
                    console.error(`Failed to read key file ${keyFile}:`, e);
                }
            }

            // Find DS record file: dsset-example.com.
            let dsRecord = undefined;
            const dsFile = `dsset-${zoneName}.`;
            if (fileList.includes(dsFile)) {
                try {
                    const content = await this.readRemoteFile(path.posix.join(BIND9_ZONE_DIR, dsFile));
                    // DS record format: example.com. IN DS 12345 13 2 XXXXX...
                    // We only want the data part usually, but let's return the full line for now
                    const lines = content.split("\n").filter(l => l.includes(" IN DS "));
                    if (lines.length > 0) {
                        dsRecord = lines[0].trim();
                    }
                } catch (e) {
                    console.error(`Failed to read DS file ${dsFile}:`, e);
                }
            }

            return {
                enabled: keys.length > 0,
                keys,
                ds_record: dsRecord
            };

        } catch (error: any) {
            console.error(`[bind9] Failed to get DNSSEC info for ${zoneName}: ${error.message}`);
            return { enabled: false, keys: [] };
        }
    }

    /** Read and parse an existing RPZ zone file, returning structured entries */
    async readRpzZoneFile(zoneName: string = "rpz.intra", filePath?: string): Promise<Array<{ name: string; type: string; target: string; comment?: string }>> {
        const safeZoneName = this.sanitizeZoneField(zoneName);
        const resolvedPath = filePath || path.posix.join(BIND9_ZONE_DIR, `db.${safeZoneName}`);
        const content = await this.readRemoteFile(resolvedPath);
        const entries: Array<{ name: string; type: string; target: string; comment?: string }> = [];

        for (const rawLine of content.split("\n")) {
            const line = rawLine.trim();
            // Skip comments, blanks, SOA, NS, $-directives
            if (!line || line.startsWith(";") || line.startsWith("$") || line.startsWith("@")) continue;

            // Parse RPZ entries: <name> [ttl] [class] <type> <value>
            // e.g. "example.org    CNAME   ." or "*.example.org  A  192.168.1.1"
            const parts = line.split(/\s+/);
            if (parts.length < 3) continue;

            // Find the record type position (skip optional TTL and class)
            let typeIdx = 1;
            if (/^\d+$/.test(parts[1])) typeIdx = 2; // skip TTL
            if (parts[typeIdx] === "IN") typeIdx++; // skip class
            if (typeIdx >= parts.length) continue;

            const rrName = parts[0];
            const rrType = parts[typeIdx].toUpperCase();
            const rrValue = parts.slice(typeIdx + 1).join(" ");

            // Skip SOA/NS records
            if (rrType === "SOA" || rrType === "NS") continue;

            // Determine RPZ action from CNAME target
            if (rrType === "CNAME") {
                if (rrValue === "." || rrValue === "root.zone.") {
                    // NXDOMAIN â€” but skip wildcard duplicates
                    if (!rrName.startsWith("*.")) {
                        entries.push({ name: rrName, type: "nxdomain", target: "" });
                    }
                } else if (rrValue === "*." || rrValue === "*.root.zone.") {
                    // NODATA â€” skip wildcard duplicates
                    if (!rrName.startsWith("*.")) {
                        entries.push({ name: rrName, type: "nodata", target: "" });
                    }
                } else if (rrValue.endsWith("rpz-passthru.") || rrValue === "rpz-passthru.") {
                    if (!rrName.startsWith("*.")) {
                        entries.push({ name: rrName, type: "passthru", target: "" });
                    }
                } else if (rrValue.endsWith("rpz-drop.") || rrValue === "rpz-drop.") {
                    if (!rrName.startsWith("*.")) {
                        entries.push({ name: rrName, type: "drop", target: "" });
                    }
                } else if (rrValue.endsWith("rpz-tcp-only.") || rrValue === "rpz-tcp-only.") {
                    if (!rrName.startsWith("*.")) {
                        entries.push({ name: rrName, type: "tcp-only", target: "" });
                    }
                } else {
                    // Redirect to CNAME
                    if (!rrName.startsWith("*.")) {
                        entries.push({ name: rrName, type: "redirect", target: rrValue.replace(/\.$/, "") });
                    }
                }
            } else if (rrType === "A" || rrType === "AAAA") {
                // Redirect to IP
                if (!rrName.startsWith("*.")) {
                    entries.push({ name: rrName, type: "redirect", target: rrValue });
                }
            }
        }

        return entries;
    }

    /** Parse an RPZ blocklist file content (zone format or plain domain list) and return entries */
    async parseRpzBlocklist(content: string, sourceName: string = "import"): Promise<Array<{ name: string; type: string; target: string; comment: string }>> {
        const entries: Array<{ name: string; type: string; target: string; comment: string }> = [];
        const lines = content.split("\n");

        // Detect format: if it contains SOA/NS records, it's a zone file; otherwise plain list
        const isZoneFormat = lines.some(l => /\bSOA\b/i.test(l) || /\bIN\s+NS\b/i.test(l));

        // Yield to event loop every YIELD_INTERVAL lines to avoid blocking
        const YIELD_INTERVAL = 50000;

        if (isZoneFormat) {
            // Parse as RPZ zone file
            for (let i = 0; i < lines.length; i++) {
                if (i > 0 && i % YIELD_INTERVAL === 0) await new Promise(r => setImmediate(r));
                const line = lines[i].trim();
                if (!line || line.startsWith(";") || line.startsWith("$") || line.startsWith("@")) continue;

                const parts = line.split(/\s+/);
                if (parts.length < 3) continue;

                let typeIdx = 1;
                if (/^\d+$/.test(parts[1])) typeIdx = 2;
                if (parts[typeIdx] === "IN") typeIdx++;
                if (typeIdx >= parts.length) continue;

                const rrName = parts[0];
                const rrType = parts[typeIdx].toUpperCase();
                const rrValue = parts.slice(typeIdx + 1).join(" ");

                if (rrType === "SOA" || rrType === "NS") continue;
                if (rrName.startsWith("*.")) continue; // skip wildcards, we auto-generate them

                // Validate domain name
                if (!/^[a-zA-Z0-9.*-]+$/.test(rrName) || rrName.length > 253) continue;

                if (rrType === "CNAME") {
                    if (rrValue === "." || rrValue === "root.zone.") {
                        entries.push({ name: rrName, type: "nxdomain", target: "", comment: `Imported from ${sourceName}` });
                    } else if (rrValue === "*." || rrValue === "*.root.zone.") {
                        entries.push({ name: rrName, type: "nodata", target: "", comment: `Imported from ${sourceName}` });
                    } else if (rrValue.endsWith("rpz-drop.") || rrValue === "rpz-drop.") {
                        entries.push({ name: rrName, type: "nxdomain", target: "", comment: `Imported from ${sourceName} (rpz-drop)` });
                    } else if (rrValue.endsWith("rpz-passthru.") || rrValue === "rpz-passthru.") {
                        continue; // passthru = whitelist, skip
                    } else {
                        entries.push({ name: rrName, type: "redirect", target: rrValue.replace(/\.$/, ""), comment: `Imported from ${sourceName}` });
                    }
                } else if (rrType === "A" || rrType === "AAAA") {
                    if (/^[\d.a-fA-F:]+$/.test(rrValue)) {
                        entries.push({ name: rrName, type: "redirect", target: rrValue, comment: `Imported from ${sourceName}` });
                    }
                }
            }
        } else {
            // Parse as plain domain list (one domain per line)
            for (let i = 0; i < lines.length; i++) {
                if (i > 0 && i % YIELD_INTERVAL === 0) await new Promise(r => setImmediate(r));
                let line = lines[i].trim();
                if (!line || line.startsWith("#") || line.startsWith("//") || line.startsWith(";")) continue;

                // Remove inline comments
                const commentIdx = line.indexOf("#");
                if (commentIdx > 0) line = line.slice(0, commentIdx).trim();

                // Handle "0.0.0.0 domain.com" or "127.0.0.1 domain.com" hosts-file format
                const parts = line.split(/\s+/);
                let domain = parts[parts.length - 1];
                if (parts.length === 2 && /^0\.0\.0\.0$|^127\.0\.0\.1$|^::1$/.test(parts[0])) {
                    domain = parts[1];
                }

                // Validate domain
                domain = domain.toLowerCase().replace(/\.$/, ""); // remove trailing dot
                if (!/^[a-z0-9][a-z0-9.*-]*$/.test(domain) || domain.length > 253) continue;

                entries.push({ name: domain, type: "nxdomain", target: "", comment: `Imported from ${sourceName}` });
            }
        }

        return entries;
    }

}

export const bind9Service = new Bind9Service();

