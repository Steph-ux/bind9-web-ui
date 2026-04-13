// Copyright © 2025 Stephane ASSOGBA
/**
 * SSH Connection Manager
 * Manages multiple simultaneous SSH connections to remote BIND9 servers.
 * Supports command execution and SFTP file operations over SSH.
 * One connection is designated as "active" for bind9-service operations.
 */
import { Client, type ConnectConfig, type SFTPWrapper } from "ssh2";
import type { Connection } from "@shared/schema";

export interface SSHConnectionConfig {
    host: string;
    port: number;
    username: string;
    authType: "password" | "key";
    password?: string;
    privateKey?: string;
}

export interface RemoteExecResult {
    stdout: string;
    stderr: string;
    code: number;
}

interface SSHPoolEntry {
    client: Client;
    config: SSHConnectionConfig;
    connected: boolean;
}

class SSHManager {
    /** Pool of SSH connections keyed by connection ID */
    private pool: Map<string, SSHPoolEntry> = new Map();

    /** The currently active connection ID (used by bind9-service) */
    private activeId: string | null = null;

    // ── Pool Management ────────────────────────────────────────────

    /** Register a connection config in the pool (does NOT connect yet) */
    register(connectionId: string, config: SSHConnectionConfig) {
        // If already in pool and connected, keep it
        const existing = this.pool.get(connectionId);
        if (existing && existing.connected) return;
        // Otherwise store config for later connect
        this.pool.set(connectionId, {
            client: new Client(),
            config,
            connected: false,
        });
    }

    /** Remove a connection from the pool and disconnect it */
    unregister(connectionId: string) {
        const entry = this.pool.get(connectionId);
        if (entry) {
            if (entry.connected) entry.client.end();
            this.pool.delete(connectionId);
        }
        if (this.activeId === connectionId) {
            this.activeId = null;
        }
    }

    /** Set the active connection ID (used by bind9-service) */
    setActive(connectionId: string | null) {
        this.activeId = connectionId;
    }

    /** Get the active connection ID */
    getActiveId(): string | null {
        return this.activeId;
    }

    /** Check if a specific connection is connected */
    isConnected(connectionId: string): boolean {
        return this.pool.get(connectionId)?.connected ?? false;
    }

    /** Get list of all connected connection IDs */
    getConnectedIds(): string[] {
        const result: string[] = [];
        this.pool.forEach((entry, id) => {
            if (entry.connected) result.push(id);
        });
        return result;
    }

    // ── Legacy Compatibility ──────────────────────────────────────

    /** Check if the active SSH connection is configured */
    isConfigured(): boolean {
        if (this.activeId === null) return false;
        return this.pool.has(this.activeId);
    }

    /** Set the active SSH connection config (legacy — registers + sets active) */
    setConfig(config: SSHConnectionConfig | null) {
        if (config && this.activeId) {
            this.register(this.activeId, config);
        } else if (!config && this.activeId) {
            this.unregister(this.activeId);
        }
    }

    /** Disconnect the active connection (legacy) */
    disconnect() {
        if (this.activeId) {
            this.unregister(this.activeId);
        }
    }

    /** Get current connection state (for dashboard) */
    getState(): { configured: boolean; connected: boolean; host: string | null } {
        if (this.activeId === null) {
            return { configured: false, connected: false, host: null };
        }
        const entry = this.pool.get(this.activeId);
        return {
            configured: !!entry,
            connected: entry?.connected ?? false,
            host: entry?.config.host ?? null,
        };
    }

    // ── Connection ─────────────────────────────────────────────────

    /** Connect a specific connection by ID */
    async connectById(connectionId: string): Promise<void> {
        const entry = this.pool.get(connectionId);
        if (!entry) throw new Error(`SSH connection ${connectionId} not registered`);
        if (entry.connected) return;

        return new Promise((resolve, reject) => {
            const client = new Client();
            const timeout = setTimeout(() => {
                client.end();
                reject(new Error("SSH connection timeout (10s)"));
            }, 10000);

            const connectConfig: ConnectConfig = {
                host: entry.config.host,
                port: entry.config.port,
                username: entry.config.username,
                readyTimeout: 10000,
                keepaliveInterval: 30000,
            };

            if (entry.config.authType === "password") {
                connectConfig.password = entry.config.password;
            } else {
                connectConfig.privateKey = entry.config.privateKey;
            }

            client.on("ready", () => {
                clearTimeout(timeout);
                entry.client = client;
                entry.connected = true;
                console.log(`[ssh] Connected to ${entry.config.host}:${entry.config.port} (${connectionId})`);
                resolve();
            });

            client.on("error", (err) => {
                clearTimeout(timeout);
                entry.connected = false;
                reject(new Error(`SSH connection failed: ${err.message}`));
            });

            client.on("close", () => {
                entry.connected = false;
                console.log(`[ssh] Connection closed (${connectionId})`);
            });

            client.connect(connectConfig);
        });
    }

    /** Connect the active connection (legacy) */
    async connect(): Promise<void> {
        if (!this.activeId) throw new Error("No active SSH connection");
        await this.connectById(this.activeId);
    }

    /** Disconnect a specific connection by ID (keeps it in pool) */
    async disconnectById(connectionId: string) {
        const entry = this.pool.get(connectionId);
        if (entry && entry.connected) {
            entry.client.end();
            entry.connected = false;
        }
    }

    // ── Ensure Connected ───────────────────────────────────────────

    /** Ensure a specific connection is active, reconnect if needed */
    private async ensureConnectedById(connectionId: string): Promise<Client> {
        const entry = this.pool.get(connectionId);
        if (!entry) throw new Error(`SSH connection ${connectionId} not registered`);
        if (!entry.connected) {
            await this.connectById(connectionId);
        }
        return this.pool.get(connectionId)!.client;
    }

    /** Ensure the active connection is active (legacy) */
    private async ensureConnected(): Promise<Client> {
        if (!this.activeId) throw new Error("No active SSH connection");
        return this.ensureConnectedById(this.activeId);
    }

    // ── Exec ───────────────────────────────────────────────────────

    /** Execute a command on a specific connection */
    async execById(connectionId: string, command: string): Promise<RemoteExecResult> {
        const client = await this.ensureConnectedById(connectionId);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("SSH execution timed out (60s)"));
            }, 60000);

            client.exec(command, (err, stream) => {
                if (err) {
                    clearTimeout(timeout);
                    const entry = this.pool.get(connectionId);
                    if (entry) entry.connected = false;
                    this.ensureConnectedById(connectionId)
                        .then((c) => {
                            c.exec(command, (retryErr, retryStream) => {
                                if (retryErr) return reject(new Error(`SSH exec failed: ${retryErr.message}`));
                                this.collectStream(retryStream, (res) => {
                                    clearTimeout(timeout);
                                    resolve(res);
                                }, (err) => {
                                    clearTimeout(timeout);
                                    reject(err);
                                });
                            });
                        })
                        .catch((err) => {
                            clearTimeout(timeout);
                            reject(err);
                        });
                    return;
                }
                this.collectStream(stream, (res) => {
                    clearTimeout(timeout);
                    resolve(res);
                }, (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });
        });
    }

    /** Execute a command on the active connection (legacy) */
    async exec(command: string): Promise<RemoteExecResult> {
        if (!this.activeId) throw new Error("No active SSH connection");
        return this.execById(this.activeId, command);
    }

    private collectStream(
        stream: any,
        resolve: (result: RemoteExecResult) => void,
        reject: (err: Error) => void
    ) {
        let stdout = "";
        let stderr = "";

        stream.on("data", (data: Buffer) => {
            stdout += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
        });

        stream.on("close", (code: number) => {
            resolve({ stdout, stderr, code: code || 0 });
        });

        stream.on("error", (err: Error) => {
            reject(new Error(`SSH stream error: ${err.message}`));
        });
    }

    // ── SFTP Read ──────────────────────────────────────────────────

    /** Read a file on a specific connection via SFTP (with retry) */
    async readFileById(connectionId: string, remotePath: string): Promise<string> {
        try {
            return await this._readFileById(connectionId, remotePath);
        } catch {
            const entry = this.pool.get(connectionId);
            if (entry) entry.connected = false;
            return this._readFileById(connectionId, remotePath);
        }
    }

    /** Read a file on the active connection (legacy) */
    async readFile(remotePath: string): Promise<string> {
        if (!this.activeId) throw new Error("No active SSH connection");
        return this.readFileById(this.activeId, remotePath);
    }

    private async _readFileById(connectionId: string, remotePath: string): Promise<string> {
        const client = await this.ensureConnectedById(connectionId);

        return new Promise((resolve, reject) => {
            client.sftp((err, sftp) => {
                if (err) return reject(new Error(`SFTP failed: ${err.message}`));

                sftp.readFile(remotePath, "utf-8", (readErr, data) => {
                    if (readErr) return reject(new Error(`Cannot read ${remotePath}: ${readErr.message}`));
                    resolve(data as unknown as string);
                });
            });
        });
    }

    // ── SFTP Write ─────────────────────────────────────────────────

    /** Write a file on a specific connection via SFTP (with retry) */
    async writeFileById(connectionId: string, remotePath: string, content: string): Promise<void> {
        try {
            await this._writeFileById(connectionId, remotePath, content);
        } catch {
            const entry = this.pool.get(connectionId);
            if (entry) entry.connected = false;
            await this._writeFileById(connectionId, remotePath, content);
        }
    }

    /** Write a file on the active connection (legacy) */
    async writeFile(remotePath: string, content: string): Promise<void> {
        if (!this.activeId) throw new Error("No active SSH connection");
        return this.writeFileById(this.activeId, remotePath, content);
    }

    private async _writeFileById(connectionId: string, remotePath: string, content: string): Promise<void> {
        const client = await this.ensureConnectedById(connectionId);

        return new Promise((resolve, reject) => {
            client.sftp((err, sftp) => {
                if (err) return reject(new Error(`SFTP failed: ${err.message}`));

                sftp.writeFile(remotePath, content, "utf-8", (writeErr) => {
                    if (writeErr) return reject(new Error(`Cannot write ${remotePath}: ${writeErr.message}`));
                    resolve();
                });
            });
        });
    }

    // ── File Exists ────────────────────────────────────────────────

    /** Check if a file exists on a specific connection */
    async fileExistsById(connectionId: string, remotePath: string): Promise<boolean> {
        try {
            if (!/^[a-zA-Z0-9.\/_:-]+$/.test(remotePath)) {
                throw new Error(`Invalid remote path: ${remotePath}`);
            }
            const result = await this.execById(connectionId, `test -f "${remotePath}" && echo "exists" || echo "missing"`);
            return result.stdout.trim() === "exists";
        } catch {
            return false;
        }
    }

    /** Check if a file exists on the active connection (legacy) */
    async fileExists(remotePath: string): Promise<boolean> {
        if (!this.activeId) throw new Error("No active SSH connection");
        return this.fileExistsById(this.activeId, remotePath);
    }

    // ── Test Connection ────────────────────────────────────────────

    /** Test SSH connection and return server info */
    async testConnection(config: SSHConnectionConfig): Promise<{
        success: boolean;
        message: string;
        serverInfo?: {
            hostname: string;
            os: string;
            bind9Version: string;
            bind9Running: boolean;
            confDir: string;
            zoneDir: string;
        };
    }> {
        const testClient = new Client();

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                testClient.end();
                resolve({ success: false, message: "Connection timeout (10s)" });
            }, 10000);

            const connectConfig: ConnectConfig = {
                host: config.host,
                port: config.port,
                username: config.username,
                readyTimeout: 10000,
            };

            if (config.authType === "password") {
                connectConfig.password = config.password;
            } else {
                connectConfig.privateKey = config.privateKey;
            }

            testClient.on("ready", async () => {
                clearTimeout(timeout);

                try {
                    const hostnameResult = await this.execOnClient(testClient, "hostname");
                    const hostname = hostnameResult.stdout.trim();

                    const osResult = await this.execOnClient(testClient, "cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"' || uname -s");
                    const os = osResult.stdout.trim();

                    const versionResult = await this.execOnClient(testClient, "named -v 2>/dev/null || echo 'not installed'");
                    const bind9Version = versionResult.stdout.trim();

                    const runningResult = await this.execOnClient(testClient, "systemctl is-active named 2>/dev/null || systemctl is-active bind9 2>/dev/null || echo 'inactive'");
                    const bind9Running = runningResult.stdout.trim() === "active";

                    const confDir = await this.detectBind9Path(testClient, "conf");
                    const zoneDir = await this.detectBind9Path(testClient, "zone");

                    testClient.end();
                    resolve({
                        success: true,
                        message: `Connected to ${hostname} (${os})`,
                        serverInfo: { hostname, os, bind9Version, bind9Running, confDir, zoneDir },
                    });
                } catch (e: any) {
                    testClient.end();
                    resolve({ success: false, message: `Connected but probe failed: ${e.message}` });
                }
            });

            testClient.on("error", (err) => {
                clearTimeout(timeout);
                resolve({ success: false, message: `SSH error: ${err.message}` });
            });

            testClient.connect(connectConfig);
        });
    }

    /** Auto-detect bind9 configuration and zone directory paths */
    private async detectBind9Path(client: Client, type: "conf" | "zone"): Promise<string> {
        if (type === "conf") {
            const paths = ["/etc/bind", "/etc/named", "/usr/local/etc/namedb"];
            for (const p of paths) {
                const result = await this.execOnClient(client, `test -d "${p}" && echo "found" || echo "missing"`);
                if (result.stdout.trim() === "found") return p;
            }
            const findResult = await this.execOnClient(client, "find /etc -name 'named.conf*' -type f 2>/dev/null | head -1");
            if (findResult.stdout.trim()) {
                const dir = findResult.stdout.trim().split("/").slice(0, -1).join("/");
                return dir || "/etc/bind";
            }
            return "/etc/bind";
        } else {
            const paths = ["/var/cache/bind", "/var/named", "/var/lib/bind"];
            for (const p of paths) {
                const result = await this.execOnClient(client, `test -d "${p}" && echo "found" || echo "missing"`);
                if (result.stdout.trim() === "found") return p;
            }
            const confResult = await this.execOnClient(client, `grep -r 'directory' /etc/bind/named.conf* /etc/named.conf 2>/dev/null | head -1`);
            const dirMatch = confResult.stdout.match(/directory\s+"([^"]+)"/);
            if (dirMatch) return dirMatch[1];
            return "/var/cache/bind";
        }
    }

    /** Execute a command on a specific client instance */
    private execOnClient(client: Client, command: string): Promise<RemoteExecResult> {
        return new Promise((resolve, reject) => {
            client.exec(command, (err, stream) => {
                if (err) return reject(err);
                let stdout = "";
                let stderr = "";
                stream.on("data", (data: Buffer) => { stdout += data.toString(); });
                stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
                stream.on("close", (code: number) => {
                    resolve({ stdout, stderr, code: code || 0 });
                });
            });
        });
    }
}

export const sshManager = new SSHManager();
