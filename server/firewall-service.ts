
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import { sshManager } from "./ssh-manager";

const execAsync = promisify(exec);

export interface FirewallRule {
    id: number;
    to: string;
    action: "ALLOW" | "DENY" | "REJECT" | "LIMIT";
    from: string;
    ipv6: boolean;
    comment?: string;
}

export interface FirewallStatus {
    active: boolean;
    rules: FirewallRule[];
}

class FirewallService {
    private mockRules: FirewallRule[] = [
        { id: 1, to: "22/tcp", action: "ALLOW", from: "Anywhere", ipv6: false },
        { id: 2, to: "53", action: "ALLOW", from: "Anywhere", ipv6: false },
        { id: 3, to: "80/tcp", action: "ALLOW", from: "Anywhere", ipv6: false },
        { id: 4, to: "22/tcp (v6)", action: "ALLOW", from: "Anywhere (v6)", ipv6: true },
        { id: 5, to: "53 (v6)", action: "ALLOW", from: "Anywhere (v6)", ipv6: true },
    ];
    private mockActive = true;

    /** Execute a shell command (locally or via SSH) */
    private async execCommand(command: string): Promise<string> {
        // If SSH is configured, run remotely
        if (sshManager.isConfigured()) {
            const result = await sshManager.exec(command);
            if (result.code !== 0) {
                throw new Error(`Command failed: ${result.stderr || result.stdout}`);
            }
            return result.stdout;
        }

        // If local and Windows, use Mock
        if (os.platform() === "win32") {
            return this.execMock(command);
        }

        // Local Linux execution
        const { stdout, stderr } = await execAsync(command);
        if (stderr && !stderr.includes("To Action From")) { // Ignore ufw header in stderr if any
            // console.warn("UFW stderr:", stderr);
        }
        return stdout;
    }

    private execMock(command: string): string {
        console.log(`[Mock Firewall] Executing: ${command}`);
        if (command.includes("status numbered")) {
            if (!this.mockActive) return "Status: inactive";
            let output = "Status: active\n\n     To                         Action      From\n     --                         ------      ----\n";
            this.mockRules.forEach(r => {
                output += `[ ${r.id}] ${r.to.padEnd(26)} ${r.action.padEnd(11)} ${r.from}\n`;
            });
            return output;
        }
        if (command.includes("ufw enable")) { this.mockActive = true; return "Firewall is active and enabled on system startup"; }
        if (command.includes("ufw disable")) { this.mockActive = false; return "Firewall stopped and disabled on system startup"; }
        if (command.includes("ufw allow")) {
            const newId = this.mockRules.length + 1;
            const portMatch = command.match(/port\s+(\d+)/);
            const port = portMatch ? portMatch[1] : "8080";
            const protoMatch = command.match(/proto\s+(\w+)/);
            const proto = protoMatch ? protoMatch[1] : "tcp";

            this.mockRules.push({ id: newId, to: `${port}/${proto}`, action: "ALLOW", from: "Anywhere", ipv6: false });
            return "Rule added";
        }
        if (command.includes("ufw delete")) {
            const id = parseInt(command.split("delete")[1].trim());
            this.mockRules = this.mockRules.filter(r => r.id !== id);
            return "Rule deleted";
        }
        return "";
    }

    async getStatus(): Promise<FirewallStatus> {
        try {
            // Need sudo for ufw, but we'll assume the user running the server has sudo access 
            // OR proper permissions. For SSH, we log in as root or a sudoer.
            // We'll prepend 'sudo -n' to avoid prompt if possible, or assume running as root.
            const output = await this.execCommand("sudo -n ufw status numbered");

            const active = output.toLowerCase().includes("status: active");
            const rules: FirewallRule[] = [];

            if (active) {
                const lines = output.split("\n");
                // Skip header lines until we find the rules
                // Example:
                // [ 1] 22/tcp                     ALLOW IN    Anywhere
                const regex = /\[\s*(\d+)\]\s+(.*?)\s+(ALLOW|DENY|REJECT|LIMIT)(?:\s+(IN|OUT))?\s+(.*)/;

                for (const line of lines) {
                    const match = line.match(regex);
                    if (match) {
                        const [_, id, to, action, direction, from] = match;
                        rules.push({
                            id: parseInt(id),
                            to: to.trim(),
                            action: action as any,
                            from: from.trim(),
                            ipv6: from.includes("(v6)") || to.includes("(v6)"),
                            comment: ""
                        });
                    }
                }
            }

            return { active, rules };
        } catch (e: any) {
            if (e.message.includes("inactive")) {
                return { active: false, rules: [] };
            }
            // Fallback for mock environment if not caught above
            if (os.platform() === "win32" && !sshManager.isConfigured()) {
                return { active: this.mockActive, rules: this.mockRules };
            }
            console.error("Failed to get firewall status:", e);
            throw e;
        }
    }

    async toggle(enable: boolean): Promise<void> {
        const cmd = enable ? "enable" : "disable";
        await this.execCommand(`sudo -n ufw ${cmd}`);
        // If enabling, we must ensure SSH is allowed to prevent lockout!
        if (enable) {
            // Basic safeguard: Ensure SSH port is open. 
            // Ideally we check before enabling, but 'ufw allow ssh' is idempotent usually.
            await this.execCommand("sudo -n ufw allow 22/tcp");
        }
    }

    async addRule(toPort: string, proto: "tcp" | "udp" | "any", action: "allow" | "deny", fromIp: string = "any"): Promise<void> {
        // Construct UFW command
        // ufw allow from <ip> to any port <port> proto <proto>
        // ufw allow 80/tcp
        let cmd = `sudo -n ufw ${action}`;

        if (fromIp && fromIp !== "any") {
            cmd += ` from ${fromIp}`;
        }

        if (toPort) {
            cmd += ` to any port ${toPort}`;
            if (proto !== "any") {
                cmd += ` proto ${proto}`;
            }
        }

        await this.execCommand(cmd);
    }

    async deleteRule(id: number): Promise<void> {
        // 'yes |' to auto-confirm deletion prompt "Delete: [...] ? (y|n)"
        await this.execCommand(`echo "y" | sudo -n ufw delete ${id}`);
    }
}

export const firewallService = new FirewallService();
