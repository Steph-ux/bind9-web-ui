// Copyright © 2025 Stephane ASSOGBA
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import { sshManager } from "./ssh-manager";

const execAsync = promisify(exec);

export type FirewallBackend = "ufw" | "firewalld" | "iptables" | "nftables" | "none";
const ALLOWED_BACKENDS: FirewallBackend[] = ["ufw", "firewalld", "iptables", "nftables", "none"];
const ALLOWED_PROTOS = ["tcp", "udp", "any"];
const ALLOWED_ACTIONS = ["allow", "deny", "reject"];
const ALLOWED_RNDC_COMMANDS = ["reload", "flush", "status", "stats", "reconfig", "dumpdb", "querylog"];

/** Validate a port number (1-65535, or service name alphanumeric) */
function validatePort(port: string): string {
    if (/^\d+$/.test(port)) {
        const n = parseInt(port, 10);
        if (n < 1 || n > 65535) throw new Error(`Invalid port number: ${port}`);
        return port;
    }
    // Service name: alphanumeric + hyphen only
    if (/^[a-zA-Z0-9-]+$/.test(port)) return port;
    throw new Error(`Invalid port value: ${port}`);
}

/** Validate an IP address or CIDR */
function validateIp(ip: string): string {
    if (ip === "any" || ip === "Anywhere" || ip === "Anywhere (v6)") return ip;
    // IPv4/CIDR
    if (/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(ip)) return ip;
    // IPv6/CIDR (simplified)
    if (/^[0-9a-fA-F:]+(\/\d{1,3})?$/.test(ip) && ip.includes(":")) return ip;
    throw new Error(`Invalid IP address: ${ip}`);
}

/** Sanitize a string for safe shell interpolation (alphanumeric, dots, dashes, slashes, colons, underscores) */
function shellSafe(input: string): string {
    if (/^[a-zA-Z0-9.\/_:-]+$/.test(input)) return input;
    throw new Error(`Invalid characters in input: ${input}`);
}

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
    installed: boolean;
    backend: FirewallBackend;
    availableBackends: FirewallBackend[];
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
    private detectedBackend: FirewallBackend | null = null;
    private detectedAvailable: FirewallBackend[] | null = null;

    /** Execute a shell command (locally or via SSH) */
    private async execCommand(command: string): Promise<string> {
        if (sshManager.isConfigured()) {
            const resolvedCommand = command
                .replace(/\bufw\b/g, "/usr/sbin/ufw")
                .replace(/\bfirewall-cmd\b/g, "/usr/bin/firewall-cmd")
                .replace(/\biptables\b/g, "/usr/sbin/iptables")
                .replace(/\bnft\b/g, "/usr/sbin/nft")
                .replace(/\bsystemctl\b/g, "/usr/bin/systemctl");
            const result = await sshManager.exec(resolvedCommand);
            if (result.code !== 0) {
                throw new Error(`Command failed: ${result.stderr || result.stdout}`);
            }
            return result.stdout;
        }

        if (os.platform() === "win32") {
            return this.execMock(command);
        }

        const { stdout, stderr } = await execAsync(command);
        if (stderr && !stderr.includes("To Action From")) { }
        return stdout;
    }

    /** Check if a command exists on the remote/local system */
    private async commandExists(cmd: string): Promise<boolean> {
        try {
            await this.execCommand(`which ${cmd} 2>/dev/null || command -v ${cmd} 2>/dev/null`);
            return true;
        } catch {
            return false;
        }
    }

    /** Try a command and return stdout or null on failure */
    private async tryExec(command: string): Promise<string | null> {
        try {
            const out = await this.execCommand(command);
            return out?.trim() || null;
        } catch {
            return null;
        }
    }

    /** Auto-detect which firewall backend is ACTIVE, and list all installed */
    async detectBackend(): Promise<{ active: FirewallBackend; available: FirewallBackend[] }> {
        if (this.detectedBackend && this.detectedAvailable) {
            return { active: this.detectedBackend, available: this.detectedAvailable };
        }

        // Single SSH call: check all backends at once
        // Each section: INSTALLED/MISSING, then status info
        const script = [
            'echo "===UFW==="',
            'if command -v ufw >/dev/null 2>&1; then echo "INSTALLED"; sudo -n ufw status 2>/dev/null; else echo "MISSING"; fi',
            'echo "===FIREWALLD==="',
            'if command -v firewall-cmd >/dev/null 2>&1; then echo "INSTALLED"; sudo -n firewall-cmd --state 2>/dev/null; else echo "MISSING"; fi',
            'echo "===NFT==="',
            'if command -v nft >/dev/null 2>&1; then echo "INSTALLED"; NFTOUT=$(sudo -n nft list ruleset 2>/dev/null); if echo "$NFTOUT" | grep -q "chain"; then echo "HAS_RULES"; else echo "NO_RULES"; fi; else echo "MISSING"; fi',
            'echo "===IPT==="',
            'if command -v iptables >/dev/null 2>&1; then echo "INSTALLED"; sudo -n iptables -L INPUT -n 2>/dev/null | head -3; else echo "MISSING"; fi',
            'echo "===END==="',
        ].join("; ");

        let output: string;
        try {
            output = await this.execCommand(script);
        } catch {
            if (os.platform() === "win32" && !sshManager.isConfigured()) {
                this.detectedBackend = "ufw";
                this.detectedAvailable = ["ufw"];
                return { active: "ufw", available: ["ufw"] };
            }
            this.detectedBackend = "none";
            this.detectedAvailable = [];
            return { active: "none", available: [] };
        }

        const available: FirewallBackend[] = [];
        let activeBackend: FirewallBackend = "none";

        const ufwSection = output.match(/===UFW===\n([\s\S]*?)===FIREWALLD===/)?.[1] || "";
        const fwSection = output.match(/===FIREWALLD===\n([\s\S]*?)===NFT===/)?.[1] || "";
        const nftSection = output.match(/===NFT===\n([\s\S]*?)===IPT===/)?.[1] || "";
        const iptSection = output.match(/===IPT===\n([\s\S]*?)===END===/)?.[1] || "";

        // ufw
        if (ufwSection.includes("INSTALLED")) {
            available.push("ufw");
            if (ufwSection.toLowerCase().includes("status: active")) {
                activeBackend = "ufw";
            }
        }

        // firewalld
        if (fwSection.includes("INSTALLED")) {
            available.push("firewalld");
            if (activeBackend === "none" && fwSection.includes("running")) {
                activeBackend = "firewalld";
            }
        }

        // nftables - only active if it HAS_RULES (contains "chain" keyword)
        if (nftSection.includes("INSTALLED")) {
            available.push("nftables");
            if (activeBackend === "none" && nftSection.includes("HAS_RULES")) {
                activeBackend = "nftables";
            }
        }

        // iptables
        if (iptSection.includes("INSTALLED")) {
            available.push("iptables");
            if (activeBackend === "none" && !iptSection.includes("(policy ACCEPT") && iptSection.includes("Chain")) {
                activeBackend = "iptables";
            }
        }

        // If nothing is active, prefer the best installed backend
        if (activeBackend === "none" && available.length > 0) {
            const preference: FirewallBackend[] = ["ufw", "firewalld", "nftables", "iptables"];
            activeBackend = preference.find(b => available.includes(b)) || "none";
        }

        // Windows without SSH: no real firewall backends, use mock UFW
        if (available.length === 0 && os.platform() === "win32" && !sshManager.isConfigured()) {
            this.detectedBackend = "ufw";
            this.detectedAvailable = ["ufw"];
            console.log(`[firewall] Windows mock mode: active=ufw, available=[ufw]`);
            return { active: "ufw", available: ["ufw"] };
        }

        this.detectedBackend = activeBackend;
        this.detectedAvailable = available;
        console.log(`[firewall] Detected: active=${activeBackend}, available=[${available.join(",")}]`);
        return { active: activeBackend, available };
    }

    /** Reset cached backend detection */
    resetDetection(): void {
        this.detectedBackend = null;
        this.detectedAvailable = null;
    }

    /** Manually set the active backend (user choice) */
    setBackend(backend: FirewallBackend): void {
        if (!ALLOWED_BACKENDS.includes(backend)) throw new Error(`Invalid backend: ${backend}`);
        if (this.detectedAvailable?.includes(backend) || backend === "none") {
            this.detectedBackend = backend;
            console.log(`[firewall] Backend switched to: ${backend}`);
        } else {
            throw new Error(`Backend '${backend}' is not available on this system`);
        }
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

    // ── UFW Implementation ──────────────────────────────────────

    private async getStatusUfw(available: FirewallBackend[]): Promise<FirewallStatus> {
        const output = await this.execCommand("sudo -n ufw status numbered");
        const active = output.toLowerCase().includes("status: active");
        const rules: FirewallRule[] = [];

        // UFW shows rules even when inactive - parse them always
        const regex = /\[\s*(\d+)\]\s+(.*?)\s+(ALLOW|DENY|REJECT|LIMIT)(?:\s+(IN|OUT))?\s+(.*)/;
        for (const line of output.split("\n")) {
            const match = line.match(regex);
            if (match) {
                const [_, id, to, action, _dir, from] = match;
                rules.push({
                    id: parseInt(id), to: to.trim(),
                    action: action as any, from: from.trim(),
                    ipv6: from.includes("(v6)") || to.includes("(v6)"),
                });
            }
        }
        return { active, rules, installed: true, backend: "ufw", availableBackends: available };
    }

    private async toggleUfw(enable: boolean): Promise<void> {
        await this.execCommand(`sudo -n ufw ${enable ? "enable" : "disable"}`);
        if (enable) await this.execCommand("sudo -n ufw allow 22/tcp");
    }

    private async addRuleUfw(toPort: string, proto: string, action: string, fromIp: string): Promise<void> {
        const safePort = validatePort(toPort);
        if (!ALLOWED_PROTOS.includes(proto as any)) throw new Error(`Invalid protocol: ${proto}`);
        if (!ALLOWED_ACTIONS.includes(action)) throw new Error(`Invalid action: ${action}`);
        const safeIp = validateIp(fromIp);
        let cmd = `sudo -n ufw ${action}`;
        if (safeIp && safeIp !== "any") cmd += ` from ${safeIp}`;
        if (safePort) {
            cmd += ` to any port ${safePort}`;
            if (proto !== "any") cmd += ` proto ${proto}`;
        }
        await this.execCommand(cmd);
    }

    private async deleteRuleUfw(id: number): Promise<void> {
        if (!Number.isInteger(id) || id < 1) throw new Error("Invalid rule ID");
        await this.execCommand(`echo "y" | sudo -n ufw delete ${id}`);
    }

    // ── Firewalld Implementation ────────────────────────────────

    private async getStatusFirewalld(available: FirewallBackend[]): Promise<FirewallStatus> {
        const stateOutput = await this.execCommand("sudo -n firewall-cmd --state 2>/dev/null");
        const active = stateOutput.trim() === "running";
        const rules: FirewallRule[] = [];

        if (active) {
            const services = await this.execCommand("sudo -n firewall-cmd --list-services");
            const ports = await this.execCommand("sudo -n firewall-cmd --list-ports");
            let id = 1;

            for (const svc of services.trim().split(/\s+/).filter(Boolean)) {
                rules.push({ id: id++, to: `${svc}`, action: "ALLOW", from: "Anywhere", ipv6: false });
            }
            for (const port of ports.trim().split(/\s+/).filter(Boolean)) {
                rules.push({ id: id++, to: port, action: "ALLOW", from: "Anywhere", ipv6: false });
            }
        }
        return { active, rules, installed: true, backend: "firewalld", availableBackends: available };
    }

    private async toggleFirewalld(enable: boolean): Promise<void> {
        if (enable) {
            await this.execCommand("sudo -n systemctl start firewalld");
            await this.execCommand("sudo -n systemctl enable firewalld");
            await this.execCommand("sudo -n firewall-cmd --add-service=ssh --permanent");
            await this.execCommand("sudo -n firewall-cmd --reload");
        } else {
            await this.execCommand("sudo -n systemctl stop firewalld");
            await this.execCommand("sudo -n systemctl disable firewalld");
        }
    }

    private async addRuleFirewalld(toPort: string, proto: string, action: string, fromIp: string): Promise<void> {
        const safePort = validatePort(toPort);
        if (!ALLOWED_PROTOS.includes(proto as any)) throw new Error(`Invalid protocol: ${proto}`);
        if (!ALLOWED_ACTIONS.includes(action)) throw new Error(`Invalid action: ${action}`);
        const safeIp = validateIp(fromIp);
        const perm = "--permanent";
        if (action === "allow") {
            if (safeIp && safeIp !== "any") {
                await this.execCommand(`sudo -n firewall-cmd ${perm} --add-rich-rule='rule family="ipv4" source address="${safeIp}" port port="${safePort}" protocol="${proto}" accept'`);
            } else if (/^\d+$/.test(safePort)) {
                await this.execCommand(`sudo -n firewall-cmd ${perm} --add-port=${safePort}/${proto}`);
            } else {
                await this.execCommand(`sudo -n firewall-cmd ${perm} --add-service=${safePort}`);
            }
        } else {
            if (safeIp && safeIp !== "any") {
                await this.execCommand(`sudo -n firewall-cmd ${perm} --add-rich-rule='rule family="ipv4" source address="${safeIp}" port port="${safePort}" protocol="${proto}" reject'`);
            } else {
                await this.execCommand(`sudo -n firewall-cmd ${perm} --remove-port=${safePort}/${proto}`);
            }
        }
        await this.execCommand("sudo -n firewall-cmd --reload");
    }

    private async deleteRuleFirewalld(_id: number): Promise<void> {
        throw new Error("Firewalld rule deletion requires the rule details. Use remove-port or remove-service directly.");
    }

    // ── iptables Implementation ──────────────────────────────────

    private async getStatusIptables(available: FirewallBackend[]): Promise<FirewallStatus> {
        let output: string;
        try {
            output = await this.execCommand("sudo -n iptables -L INPUT -n --line-numbers");
        } catch {
            return { active: false, rules: [], installed: true, backend: "iptables", availableBackends: available };
        }
        const active = output.includes("Chain") && !output.includes("(policy ACCEPT");
        const rules: FirewallRule[] = [];
        const regex = /^(\d+)\s+(ACCEPT|DROP|REJECT)\s+(\S+)\s+--\s+(\S+)\s+(\S+)\s+(.*)$/;

        for (const line of output.split("\n")) {
            const match = line.match(regex);
            if (match) {
                const [_, id, act, _chain, src, _dst, extra] = match;
                const action = act === "ACCEPT" ? "ALLOW" : act === "DROP" ? "DENY" : "REJECT";
                const portMatch = extra.match(/dpt:(\S+)/);
                const protoMatch = extra.match(/proto\s+(\w+)/);
                rules.push({
                    id: parseInt(id),
                    to: portMatch ? `${portMatch[1]}/${protoMatch?.[1] || "tcp"}` : extra.substring(0, 30),
                    action: action as any,
                    from: src === "0.0.0.0/0" ? "Anywhere" : src,
                    ipv6: false,
                });
            }
        }
        return { active, rules, installed: true, backend: "iptables", availableBackends: available };
    }

    private async toggleIptables(enable: boolean): Promise<void> {
        if (enable) {
            await this.execCommand("sudo -n iptables -P INPUT DROP");
            await this.execCommand("sudo -n iptables -P FORWARD DROP");
            await this.execCommand("sudo -n iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT");
            await this.execCommand("sudo -n iptables -A INPUT -i lo -j ACCEPT");
            await this.execCommand("sudo -n iptables -A INPUT -p tcp --dport 22 -j ACCEPT");
        } else {
            await this.execCommand("sudo -n iptables -P INPUT ACCEPT");
            await this.execCommand("sudo -n iptables -P FORWARD ACCEPT");
            await this.execCommand("sudo -n iptables -F");
        }
    }

    private async addRuleIptables(toPort: string, proto: string, action: string, fromIp: string): Promise<void> {
        const safePort = validatePort(toPort);
        if (!ALLOWED_PROTOS.includes(proto as any)) throw new Error(`Invalid protocol: ${proto}`);
        if (!ALLOWED_ACTIONS.includes(action)) throw new Error(`Invalid action: ${action}`);
        const safeIp = validateIp(fromIp);
        const iptAction = action === "allow" ? "ACCEPT" : action === "deny" ? "DROP" : "REJECT";
        let cmd = `sudo -n iptables -A INPUT`;
        if (safeIp && safeIp !== "any") cmd += ` -s ${safeIp}`;
        cmd += ` -p ${proto} --dport ${safePort} -j ${iptAction}`;
        await this.execCommand(cmd);
    }

    private async deleteRuleIptables(id: number): Promise<void> {
        if (!Number.isInteger(id) || id < 1) throw new Error("Invalid rule ID");
        await this.execCommand(`sudo -n iptables -D INPUT ${id}`);
    }

    // ── nftables Implementation ──────────────────────────────────

    private async getStatusNftables(available: FirewallBackend[]): Promise<FirewallStatus> {
        let output: string;
        try {
            output = await this.execCommand("sudo -n nft list ruleset 2>/dev/null");
        } catch {
            return { active: false, rules: [], installed: true, backend: "nftables", availableBackends: available };
        }
        const active = output.trim().length > 0 && output.includes("chain");
        const rules: FirewallRule[] = [];
        let id = 1;

        if (active) {
            // Parse nft ruleset - extract basic allow/deny rules
            // Format: ip saddr X tcp dport { 22, 53 } accept
            // or: tcp dport 22 accept
            const ruleRegex = /(?:ip\s+saddr\s+(\S+)\s+)?(?:ip6?\s+saddr\s+(\S+)\s+)?(?:(tcp|udp)\s+)?dport\s+\{?\s*([\d,\s]+)\s*\}?\s+(accept|drop|reject)/g;
            let match;
            while ((match = ruleRegex.exec(output)) !== null) {
                const src = match[1] || match[2] || "Anywhere";
                const proto = match[3] || "tcp";
                const ports = match[4].split(",").map(p => p.trim()).filter(Boolean);
                const action = match[5] === "accept" ? "ALLOW" : match[5] === "drop" ? "DENY" : "REJECT";

                for (const port of ports) {
                    rules.push({
                        id: id++,
                        to: `${port}/${proto}`,
                        action: action as any,
                        from: src === "0.0.0.0/0" || src === "::/0" ? "Anywhere" : src,
                        ipv6: src.includes(":"),
                    });
                }
            }

            // Also catch simple "accept" / "drop" in input hooks (established/related)
            const hookRegex = /chain\s+(\w+)\s*\{[^}]*type\s+filter\s+hook\s+(\w+)\s+priority\s+\w+\s*;\s*policy\s+(\w+)/g;
            while ((match = hookRegex.exec(output)) !== null) {
                // If policy is drop and no specific rules, firewall is active with default deny
                if (match[3] === "drop" && rules.length === 0) {
                    // Default deny - active but no explicit allow rules parsed
                }
            }
        }
        return { active, rules, installed: true, backend: "nftables", availableBackends: available };
    }

    private async toggleNftables(enable: boolean): Promise<void> {
        if (enable) {
            // Create a basic nftables ruleset with default deny + SSH allow
            const ruleset = `table inet filter {
    chain input {
        type filter hook input priority 0; policy drop;
        ct state established,related accept
        iif lo accept
        tcp dport 22 accept
    }
    chain forward {
        type filter hook forward priority 0; policy drop;
    }
    chain output {
        type filter hook output priority 0; policy accept;
    }
}`;
            // Write to a temp file then load it
            await this.execCommand(`echo '${ruleset.replace(/'/g, "'\\''")}' | sudo -n nft -f -`);
        } else {
            await this.execCommand("sudo -n nft flush ruleset");
        }
    }

    private async addRuleNftables(toPort: string, proto: string, action: string, fromIp: string): Promise<void> {
        const safePort = validatePort(toPort);
        if (!ALLOWED_PROTOS.includes(proto as any)) throw new Error(`Invalid protocol: ${proto}`);
        if (!ALLOWED_ACTIONS.includes(action)) throw new Error(`Invalid action: ${action}`);
        const safeIp = validateIp(fromIp);
        const nftAction = action === "allow" ? "accept" : action === "deny" ? "drop" : "reject";
        let cmd = `sudo -n nft add rule inet filter input`;
        if (safeIp && safeIp !== "any") {
            const family = safeIp.includes(":") ? "ip6" : "ip";
            cmd += ` ${family} saddr ${safeIp}`;
        }
        cmd += ` ${proto} dport ${safePort} ${nftAction}`;
        await this.execCommand(cmd);
    }

    private async deleteRuleNftables(_id: number): Promise<void> {
        // nftables rule deletion requires handle - complex to map by ID
        throw new Error("nftables rule deletion requires the rule handle. Use 'nft delete rule' directly.");
    }

    // ── Unified API ──────────────────────────────────────────────

    async getStatus(): Promise<FirewallStatus> {
        try {
            const { active: backend, available } = await this.detectBackend();

            if (backend === "none" && os.platform() === "win32" && !sshManager.isConfigured()) {
                return { active: this.mockActive, rules: this.mockRules, installed: true, backend: "ufw", availableBackends: ["ufw"] };
            }

            switch (backend) {
                case "ufw": return await this.getStatusUfw(available);
                case "firewalld": return await this.getStatusFirewalld(available);
                case "iptables": return await this.getStatusIptables(available);
                case "nftables": return await this.getStatusNftables(available);
                default: return { active: false, rules: [], installed: false, backend: "none", availableBackends: available };
            }
        } catch (e: any) {
            if (e.message.includes("inactive")) {
                return { active: false, rules: [], installed: true, backend: "ufw", availableBackends: ["ufw"] };
            }
            if (e.message.includes("command not found") || e.message.includes("not found")) {
                return { active: false, rules: [], installed: false, backend: "none", availableBackends: [] };
            }
            if (os.platform() === "win32" && !sshManager.isConfigured()) {
                return { active: this.mockActive, rules: this.mockRules, installed: true, backend: "ufw", availableBackends: ["ufw"] };
            }
            console.error("Failed to get firewall status:", e);
            throw e;
        }
    }

    async toggle(enable: boolean): Promise<void> {
        const { active: backend } = await this.detectBackend();
        if (backend === "none" && os.platform() === "win32" && !sshManager.isConfigured()) {
            this.mockActive = enable;
            console.log(`[Mock Firewall] Toggle: ${enable}`);
            return;
        }
        switch (backend) {
            case "ufw": return await this.toggleUfw(enable);
            case "firewalld": return await this.toggleFirewalld(enable);
            case "iptables": return await this.toggleIptables(enable);
            case "nftables": return await this.toggleNftables(enable);
            default: throw new Error("No firewall backend detected");
        }
    }

    async addRule(toPort: string, proto: "tcp" | "udp" | "any", action: "allow" | "deny", fromIp: string = "any"): Promise<void> {
        const { active: backend } = await this.detectBackend();
        if (backend === "none" && os.platform() === "win32" && !sshManager.isConfigured()) {
            const newId = this.mockRules.length + 1;
            const ruleAction = action === "allow" ? "ALLOW" as const : "DENY" as const;
            this.mockRules.push({ id: newId, to: `${toPort}/${proto}`, action: ruleAction, from: fromIp === "any" ? "Anywhere" : fromIp, ipv6: false });
            console.log(`[Mock Firewall] Add rule: ${action} ${proto} ${toPort} from ${fromIp}`);
            return;
        }
        switch (backend) {
            case "ufw": return await this.addRuleUfw(toPort, proto, action, fromIp);
            case "firewalld": return await this.addRuleFirewalld(toPort, proto, action, fromIp);
            case "iptables": return await this.addRuleIptables(toPort, proto, action, fromIp);
            case "nftables": return await this.addRuleNftables(toPort, proto, action, fromIp);
            default: throw new Error("No firewall backend detected");
        }
    }

    async deleteRule(id: number): Promise<void> {
        const { active: backend } = await this.detectBackend();
        if (backend === "none" && os.platform() === "win32" && !sshManager.isConfigured()) {
            this.mockRules = this.mockRules.filter(r => r.id !== id);
            console.log(`[Mock Firewall] Delete rule: ${id}`);
            return;
        }
        switch (backend) {
            case "ufw": return await this.deleteRuleUfw(id);
            case "firewalld": return await this.deleteRuleFirewalld(id);
            case "iptables": return await this.deleteRuleIptables(id);
            case "nftables": return await this.deleteRuleNftables(id);
            default: throw new Error("No firewall backend detected");
        }
    }
}

export const firewallService = new FirewallService();
