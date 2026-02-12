/**
 * BIND9 Integration Service
 * Interacts with a real BIND9 installation via rndc, zone files and system commands.
 * Supports both LOCAL execution and REMOTE execution via SSH.
 * Gracefully degrades if BIND9 is not installed/accessible.
 */
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { sshManager } from "./ssh-manager";

const execAsync = promisify(exec);

// Default paths — used for local mode, overridden by SSH connection config
let BIND9_CONF_DIR = process.env.BIND9_CONF_DIR || "/etc/bind";
let BIND9_ZONE_DIR = process.env.BIND9_ZONE_DIR || "/var/cache/bind";
let RNDC_BIN = process.env.RNDC_BIN || "rndc";
const NAMED_CHECKCONF = process.env.NAMED_CHECKCONF || "named-checkconf";

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

class Bind9Service {
    private available: boolean | null = null;
    private mode: ExecutionMode = "local";

    /** Set execution mode and paths */
    configure(config: {
        mode: ExecutionMode;
        confDir?: string;
        zoneDir?: string;
        rndcBin?: string;
    }) {
        this.mode = config.mode;
        if (config.confDir) BIND9_CONF_DIR = config.confDir;
        if (config.zoneDir) BIND9_ZONE_DIR = config.zoneDir;
        if (config.rndcBin) RNDC_BIN = config.rndcBin;
        // Reset availability cache when config changes
        this.available = null;
        console.log(`[bind9] Mode: ${this.mode}, confDir: ${BIND9_CONF_DIR}, zoneDir: ${BIND9_ZONE_DIR}`);
    }

    /** Get current execution mode */
    getMode(): ExecutionMode {
        return this.mode;
    }

    /** Execute a shell command (locally or via SSH) */
    private async execCommand(command: string): Promise<{ stdout: string; stderr: string }> {
        if (this.mode === "ssh" && sshManager.isConfigured()) {
            const result = await sshManager.exec(command);
            return { stdout: result.stdout, stderr: result.stderr };
        }
        return execAsync(command);
    }

    /** Read a file (locally or via SSH/SFTP) */
    private async readRemoteFile(filePath: string): Promise<string> {
        if (this.mode === "ssh" && sshManager.isConfigured()) {
            return sshManager.readFile(filePath);
        }
        return fs.readFile(filePath, "utf-8");
    }

    /** Write a file (locally or via SSH/SFTP) */
    private async writeRemoteFile(filePath: string, content: string): Promise<void> {
        if (this.mode === "ssh" && sshManager.isConfigured()) {
            return sshManager.writeFile(filePath, content);
        }
        await fs.writeFile(filePath, content, "utf-8");
    }

    /** Check if BIND9/rndc is available */
    async isAvailable(): Promise<boolean> {
        if (this.available !== null) return this.available;
        try {
            await this.execCommand(`${RNDC_BIN} status`);
            this.available = true;
        } catch {
            this.available = false;
        }
        return this.available;
    }

    /** Execute an rndc command */
    async rndc(command: string): Promise<string> {
        try {
            const { stdout, stderr } = await this.execCommand(`${RNDC_BIN} ${command}`);
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
            const version = output.match(/version:\s*(.+)/)?.[1] || "unknown";
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
            throw new Error(`Cannot read zone file ${filePath}: ${error.message}`);
        }
    }

    /** Write records to a zone file */
    async writeZoneFile(
        filePath: string,
        domain: string,
        records: Array<{ name: string; type: string; value: string; ttl: number; priority?: number }>,
        serial?: string
    ): Promise<string> {
        const newSerial = serial || this.generateSerial();
        const content = this.generateZoneFile(domain, records, newSerial);
        await this.writeRemoteFile(filePath, content);
        return newSerial;
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

    /** Write named.conf with backup + validation */
    async writeNamedConf(section: string, content: string): Promise<void> {
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
                await this.execCommand(`${NAMED_CHECKCONF} ${confPath}`);
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

    /** Reload BIND9 configuration */
    async reload(): Promise<string> {
        return this.rndc("reload");
    }

    /** Flush DNS cache */
    async flush(): Promise<string> {
        return this.rndc("flush");
    }

    /** Get system metrics — local uses Node.js os, SSH uses remote commands */
    async getSystemMetrics(): Promise<SystemMetrics> {
        if (this.mode === "ssh" && sshManager.isConfigured()) {
            return this.getRemoteSystemMetrics();
        }
        return this.getLocalSystemMetrics();
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

        const netInterfaces = os.networkInterfaces();
        const interfaces: SystemMetrics["interfaces"] = [];
        for (const [name, addrs] of Object.entries(netInterfaces)) {
            if (!addrs) continue;
            const ipv4 = addrs.find((a) => a.family === "IPv4");
            if (ipv4) {
                interfaces.push({ name, ip: ipv4.address, rx: "N/A", tx: "N/A" });
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
            return {
                cpu: { user: 0, system: 0, total: 0 },
                memory: { used: 0, total: 0, cached: 0 },
                openFiles: 0,
                interfaces: [],
            };
        }
    }

    private formatBytes(bytes: number): string {
        if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
        if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
        if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${bytes} B`;
    }

    /** Get system uptime — local or remote */
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

    /** Get hostname — local or remote */
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

    // ── Private helpers ──────────────────────────────────────────

    private generateSerial(): string {
        const now = new Date();
        const date = now.toISOString().slice(0, 10).replace(/-/g, "");
        return `${date}01`;
    }

    private parseZoneFile(content: string): Array<{ name: string; type: string; value: string; ttl: number; priority?: number }> {
        const records: Array<{ name: string; type: string; value: string; ttl: number; priority?: number }> = [];
        const lines = content.split("\n");

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("$")) continue;

            const match = trimmed.match(/^(\S+)\s+(\d+)?\s*IN\s+(A|AAAA|CNAME|MX|TXT|NS|SOA|PTR|SRV)\s+(.+)$/i);
            if (match) {
                const [, name, ttlStr, type, value] = match;
                let priority: number | undefined;
                let cleanValue = value.trim();

                if (type.toUpperCase() === "MX") {
                    const mxMatch = cleanValue.match(/^(\d+)\s+(.+)/);
                    if (mxMatch) {
                        priority = parseInt(mxMatch[1]);
                        cleanValue = mxMatch[2].trim();
                    }
                }

                records.push({
                    name: name || "@",
                    type: type.toUpperCase(),
                    value: cleanValue,
                    ttl: ttlStr ? parseInt(ttlStr) : 3600,
                    priority,
                });
            }
        }

        return records;
    }

    private generateZoneFile(
        domain: string,
        records: Array<{ name: string; type: string; value: string; ttl: number; priority?: number }>,
        serial: string
    ): string {
        const lines: string[] = [
            `; Zone file for ${domain}`,
            `; Generated by BIND9 Admin Panel`,
            `; Serial: ${serial}`,
            `$TTL 86400`,
            `$ORIGIN ${domain}.`,
            ``,
            `@ IN SOA ns1.${domain}. hostmaster.${domain}. (`,
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
            lines.push(`${record.name}\t${record.ttl}\tIN\t${record.type}\t${priority}${record.value}`);
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
        const match = output.match(/pid:\s*(\d+)/i);
        return match ? parseInt(match[1]) : null;
    }

    private parseThreads(output: string): number {
        const match = output.match(/worker threads:\s*(\d+)/i);
        return match ? parseInt(match[1]) : os.cpus().length;
    }
}

export const bind9Service = new Bind9Service();
