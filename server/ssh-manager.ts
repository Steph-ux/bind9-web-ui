// Copyright © 2025 Stephane ASSOGBA
/**
 * SSH Connection Manager
 * Manages SSH connections to remote BIND9 servers.
 * Supports command execution and SFTP file operations over SSH.
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

class SSHManager {
    private client: Client | null = null;
    private connected = false;
    private activeConfig: SSHConnectionConfig | null = null;
    private reconnecting = false;

    /** Set the active SSH connection config */
    setConfig(config: SSHConnectionConfig | null) {
        if (this.connected) {
            this.disconnect();
        }
        this.activeConfig = config;
    }

    /** Check if SSH is configured */
    isConfigured(): boolean {
        return this.activeConfig !== null;
    }

    /** Connect to the remote server */
    async connect(): Promise<void> {
        if (!this.activeConfig) throw new Error("No SSH connection configured");
        if (this.connected && this.client) return;

        return new Promise((resolve, reject) => {
            const client = new Client();
            const timeout = setTimeout(() => {
                client.end();
                reject(new Error("SSH connection timeout (10s)"));
            }, 10000);

            const connectConfig: ConnectConfig = {
                host: this.activeConfig!.host,
                port: this.activeConfig!.port,
                username: this.activeConfig!.username,
                readyTimeout: 10000,
                keepaliveInterval: 30000,
            };

            if (this.activeConfig!.authType === "password") {
                connectConfig.password = this.activeConfig!.password;
            } else {
                connectConfig.privateKey = this.activeConfig!.privateKey;
            }

            client.on("ready", () => {
                clearTimeout(timeout);
                this.client = client;
                this.connected = true;
                console.log(`[ssh] Connected to ${this.activeConfig!.host}:${this.activeConfig!.port}`);
                resolve();
            });

            client.on("error", (err) => {
                clearTimeout(timeout);
                this.connected = false;
                this.client = null;
                reject(new Error(`SSH connection failed: ${err.message}`));
            });

            client.on("close", () => {
                this.connected = false;
                this.client = null;
                console.log(`[ssh] Connection closed`);
            });

            client.connect(connectConfig);
        });
    }

    /** Disconnect from the remote server */
    disconnect() {
        if (this.client) {
            this.client.end();
            this.client = null;
            this.connected = false;
        }
    }

    /** Ensure connection is active, reconnect if needed */
    private async ensureConnected(): Promise<Client> {
        if (!this.connected || !this.client) {
            await this.connect();
        }
        return this.client!;
    }

    /** Execute a command on the remote server */
    async exec(command: string): Promise<RemoteExecResult> {
        const client = await this.ensureConnected();

        return new Promise((resolve, reject) => {
            // Add safety timeout to prevent infinite hangs
            const timeout = setTimeout(() => {
                // We can't easily kill the remote process without a stream, 
                // but we can reject the promise and maybe close connection
                reject(new Error("SSH execution timed out (60s)"));
            }, 60000);

            client.exec(command, (err, stream) => {
                if (err) {
                    clearTimeout(timeout);
                    // Try reconnecting once on error
                    this.connected = false;
                    this.ensureConnected()
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

    /** Read a file on the remote server via SFTP (with retry on channel failure) */
    async readFile(remotePath: string): Promise<string> {
        try {
            return await this._readFile(remotePath);
        } catch {
            // Channel open failure — reconnect and retry once
            this.connected = false;
            return this._readFile(remotePath);
        }
    }

    private async _readFile(remotePath: string): Promise<string> {
        const client = await this.ensureConnected();

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

    /** Write a file on the remote server via SFTP (with retry on channel failure) */
    async writeFile(remotePath: string, content: string): Promise<void> {
        try {
            await this._writeFile(remotePath, content);
        } catch {
            // Channel open failure — reconnect and retry once
            this.connected = false;
            await this._writeFile(remotePath, content);
        }
    }

    private async _writeFile(remotePath: string, content: string): Promise<void> {
        const client = await this.ensureConnected();

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

    /** Check if a file exists on the remote server */
    async fileExists(remotePath: string): Promise<boolean> {
        try {
            // Sanitize path: only allow safe characters to prevent shell injection
            if (!/^[a-zA-Z0-9.\/_:-]+$/.test(remotePath)) {
                throw new Error(`Invalid remote path: ${remotePath}`);
            }
            const result = await this.exec(`test -f "${remotePath}" && echo "exists" || echo "missing"`);
            return result.stdout.trim() === "exists";
        } catch {
            return false;
        }
    }

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
                    // Get hostname
                    const hostnameResult = await this.execOnClient(testClient, "hostname");
                    const hostname = hostnameResult.stdout.trim();

                    // Get OS info
                    const osResult = await this.execOnClient(testClient, "cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"' || uname -s");
                    const os = osResult.stdout.trim();

                    // Check BIND9 version
                    const versionResult = await this.execOnClient(testClient, "named -v 2>/dev/null || echo 'not installed'");
                    const bind9Version = versionResult.stdout.trim();

                    // Check if BIND9 is running
                    const runningResult = await this.execOnClient(testClient, "systemctl is-active named 2>/dev/null || systemctl is-active bind9 2>/dev/null || echo 'inactive'");
                    const bind9Running = runningResult.stdout.trim() === "active";

                    // Auto-detect BIND9 paths
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
            // Check common config directories
            const paths = ["/etc/bind", "/etc/named", "/usr/local/etc/namedb"];
            for (const p of paths) {
                const result = await this.execOnClient(client, `test -d "${p}" && echo "found" || echo "missing"`);
                if (result.stdout.trim() === "found") return p;
            }
            // Fallback: check named.conf location
            const findResult = await this.execOnClient(client, "find /etc -name 'named.conf*' -type f 2>/dev/null | head -1");
            if (findResult.stdout.trim()) {
                const dir = findResult.stdout.trim().split("/").slice(0, -1).join("/");
                return dir || "/etc/bind";
            }
            return "/etc/bind";
        } else {
            // Check common zone directories  
            const paths = ["/var/cache/bind", "/var/named", "/var/lib/bind"];
            for (const p of paths) {
                const result = await this.execOnClient(client, `test -d "${p}" && echo "found" || echo "missing"`);
                if (result.stdout.trim() === "found") return p;
            }
            // Fallback: parse named.conf for directory directive
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

    /** Get current connection state */
    getState(): { configured: boolean; connected: boolean; host: string | null } {
        return {
            configured: this.activeConfig !== null,
            connected: this.connected,
            host: this.activeConfig?.host || null,
        };
    }
}

export const sshManager = new SSHManager();
