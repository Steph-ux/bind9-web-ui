// Copyright (c) 2025 Stephane ASSOGBA
/**
 * Host BIND9 Manager
 * Orchestrates local OS-level BIND9 installation, initial configuration (setup wizard),
 * systemd service lifecycle control (start/stop/restart/reload), and diagnostic queries.
 */
import { exec, spawn } from "child_process";
import { promisify } from "util";
import fsPromises from "fs/promises";
import fs from "fs";
import os from "os";
import path from "path";
import dns from "dns";

const execAsync = promisify(exec);

export type PkgManager = "apt" | "dnf" | "yum" | "apk" | "pacman" | "unknown";

export interface HostOsInfo {
  platform: string;
  distro: string;
  version: string;
  pkgManager: PkgManager;
  isLinux: boolean;
}

export interface HostBind9Detection {
  os: HostOsInfo;
  bind9: {
    isInstalled: boolean;
    namedBin: string | null;
    rndcBin: string | null;
    version: string;
    serviceName: string;
    serviceStatus: "active" | "inactive" | "failed" | "not-installed" | "unknown";
    serviceEnabled: boolean;
    mainPid: number | null;
  };
  config: {
    confDir: string;
    hasNamedConf: boolean;
    hasNamedConfOptions: boolean;
    hasNamedConfLocal: boolean;
    hasRndcKey: boolean;
    isSyntaxValid: boolean;
    syntaxError?: string;
  };
  ports: {
    port53Listening: boolean;
    listeners: string[];
    hasSystemdResolvedConflict: boolean;
  };
  needsInstallation: boolean;
  needsInitialization: boolean;
}

export interface InstallProgress {
  status: "idle" | "running" | "success" | "error";
  startedAt: string | null;
  completedAt: string | null;
  logs: string[];
  error?: string;
}

export interface SetupProfileOptions {
  profile: "authoritative" | "resolver" | "hybrid";
  forwarders?: string[];
  forwardOnly?: boolean;
  listenV4?: string;
  listenV6?: string;
  allowQuery?: string;
  allowRecursion?: string;
  dnssecValidation?: boolean;
}

export interface DnsQueryResult {
  domain: string;
  type: string;
  server: string;
  status: string;
  queryTimeMs: number;
  answers: Array<{
    name: string;
    type: string;
    ttl: number;
    value: string;
  }>;
  rawOutput?: string;
}

class HostBindManager {
  private installProgress: InstallProgress = {
    status: "idle",
    startedAt: null,
    completedAt: null,
    logs: [],
  };

  private quoteShell(val: string): string {
    return `'${val.replace(/'/g, `'\\''`)}'`;
  }

  private async execWithSudo(command: string): Promise<{ stdout: string; stderr: string }> {
    let cmd = command;
    if (process.platform === "linux" && process.getuid && process.getuid() !== 0) {
      cmd = `sudo -n ${command}`;
    }
    return execAsync(cmd);
  }

  private async isCommandAvailable(bin: string): Promise<boolean> {
    try {
      await execAsync(`which ${bin}`);
      return true;
    } catch {
      return false;
    }
  }

  private async getBinPath(bin: string): Promise<string | null> {
    const commonPaths = [
      `/usr/sbin/${bin}`,
      `/usr/bin/${bin}`,
      `/sbin/${bin}`,
      `/bin/${bin}`,
      `/usr/local/sbin/${bin}`,
      `/usr/local/bin/${bin}`,
    ];
    for (const p of commonPaths) {
      if (fs.existsSync(p)) return p;
    }
    try {
      const { stdout } = await execAsync(`which ${bin}`);
      const trimmed = stdout.trim();
      if (trimmed) return trimmed;
    } catch {}
    return null;
  }

  async detectOs(): Promise<HostOsInfo> {
    const isLinux = process.platform === "linux";
    if (!isLinux) {
      return {
        platform: process.platform,
        distro: os.type(),
        version: os.release(),
        pkgManager: "unknown",
        isLinux: false,
      };
    }

    let distro = "Linux";
    let version = "";
    try {
      const osRelease = await fsPromises.readFile("/etc/os-release", "utf-8");
      const idMatch = osRelease.match(/^ID=["']?([^"'\n]+)/m);
      const verMatch = osRelease.match(/^VERSION_ID=["']?([^"'\n]+)/m);
      if (idMatch) distro = idMatch[1].toLowerCase();
      if (verMatch) version = verMatch[1];
    } catch {}

    let pkgManager: PkgManager = "unknown";
    if (await this.isCommandAvailable("apt-get")) pkgManager = "apt";
    else if (await this.isCommandAvailable("dnf")) pkgManager = "dnf";
    else if (await this.isCommandAvailable("yum")) pkgManager = "yum";
    else if (await this.isCommandAvailable("apk")) pkgManager = "apk";
    else if (await this.isCommandAvailable("pacman")) pkgManager = "pacman";

    return {
      platform: process.platform,
      distro,
      version,
      pkgManager,
      isLinux: true,
    };
  }

  async detect(): Promise<HostBind9Detection> {
    const osInfo = await this.detectOs();

    if (!osInfo.isLinux) {
      return {
        os: osInfo,
        bind9: {
          isInstalled: false,
          namedBin: null,
          rndcBin: null,
          version: "Simulation (Non-Linux Host)",
          serviceName: "named",
          serviceStatus: "inactive",
          serviceEnabled: false,
          mainPid: null,
        },
        config: {
          confDir: process.env.BIND9_CONF_DIR || "data/bind-mock",
          hasNamedConf: false,
          hasNamedConfOptions: false,
          hasNamedConfLocal: false,
          hasRndcKey: false,
          isSyntaxValid: true,
        },
        ports: {
          port53Listening: false,
          listeners: [],
          hasSystemdResolvedConflict: false,
        },
        needsInstallation: true,
        needsInitialization: false,
      };
    }

    const namedBin = await this.getBinPath("named");
    const rndcBin = await this.getBinPath("rndc");
    const isInstalled = Boolean(namedBin || rndcBin);

    // Determine service name: bind9 on Debian/Ubuntu, named on RHEL/others
    let serviceName = "bind9";
    if (["rhel", "centos", "rocky", "almalinux", "fedora", "arch"].includes(osInfo.distro)) {
      serviceName = "named";
    } else {
      try {
        const { stdout } = await execAsync("systemctl list-unit-files named.service bind9.service 2>/dev/null || true");
        if (stdout.includes("bind9.service")) serviceName = "bind9";
        else if (stdout.includes("named.service")) serviceName = "named";
      } catch {}
    }

    let serviceStatus: "active" | "inactive" | "failed" | "not-installed" | "unknown" = "not-installed";
    let serviceEnabled = false;
    let mainPid: number | null = null;
    let version = "unknown";

    if (isInstalled) {
      try {
        const { stdout } = await execAsync(`systemctl is-active ${serviceName} 2>/dev/null || true`);
        const statusTrim = stdout.trim();
        if (statusTrim === "active") serviceStatus = "active";
        else if (statusTrim === "inactive") serviceStatus = "inactive";
        else if (statusTrim === "failed") serviceStatus = "failed";
        else serviceStatus = "inactive";
      } catch {
        serviceStatus = "unknown";
      }

      try {
        const { stdout } = await execAsync(`systemctl is-enabled ${serviceName} 2>/dev/null || true`);
        serviceEnabled = stdout.trim() === "enabled";
      } catch {}

      try {
        const { stdout } = await execAsync(`systemctl show -p MainPID --value ${serviceName} 2>/dev/null || true`);
        const pidNum = parseInt(stdout.trim(), 10);
        if (!isNaN(pidNum) && pidNum > 0) mainPid = pidNum;
      } catch {}

      if (namedBin) {
        try {
          const { stdout } = await execAsync(`${this.quoteShell(namedBin)} -v 2>/dev/null || true`);
          const vMatch = stdout.match(/BIND\s+([^\s]+)/i);
          if (vMatch) version = vMatch[1];
          else version = stdout.trim() || "installed";
        } catch {}
      }
    }

    // Config checks
    const confDir = process.env.BIND9_CONF_DIR || (osInfo.distro === "rhel" || osInfo.distro === "centos" ? "/etc/named" : "/etc/bind");
    const namedConf = path.join(confDir, "named.conf");
    const namedConfOptions = path.join(confDir, "named.conf.options");
    const namedConfLocal = path.join(confDir, "named.conf.local");
    const rndcKey = path.join(confDir, "rndc.key");

    const hasNamedConf = fs.existsSync(namedConf);
    const hasNamedConfOptions = fs.existsSync(namedConfOptions);
    const hasNamedConfLocal = fs.existsSync(namedConfLocal);
    const hasRndcKey = fs.existsSync(rndcKey);

    let isSyntaxValid = true;
    let syntaxError: string | undefined;

    if (hasNamedConf) {
      const checkconfBin = await this.getBinPath("named-checkconf");
      if (checkconfBin) {
        try {
          await this.execWithSudo(`${checkconfBin} ${this.quoteShell(namedConf)}`);
          isSyntaxValid = true;
        } catch (err: any) {
          isSyntaxValid = false;
          syntaxError = err.stderr || err.stdout || err.message;
        }
      }
    } else {
      isSyntaxValid = false;
    }

    // Port 53 check
    let port53Listening = false;
    const listeners: string[] = [];
    let hasSystemdResolvedConflict = false;

    try {
      const { stdout } = await execAsync("ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || true");
      const lines = stdout.split("\n");
      for (const line of lines) {
        if (line.includes(":53 ") || line.includes(":53\t") || line.includes(" 53 ")) {
          port53Listening = true;
          listeners.push(line.trim());
          if (line.includes("systemd-resolve") && line.includes("127.0.0.53")) {
            hasSystemdResolvedConflict = true;
          }
        }
      }
    } catch {}

    const needsInstallation = !isInstalled;
    const needsInitialization = isInstalled && (!hasNamedConf || !hasNamedConfOptions || !hasNamedConfLocal);

    return {
      os: osInfo,
      bind9: {
        isInstalled,
        namedBin,
        rndcBin,
        version,
        serviceName,
        serviceStatus,
        serviceEnabled,
        mainPid,
      },
      config: {
        confDir,
        hasNamedConf,
        hasNamedConfOptions,
        hasNamedConfLocal,
        hasRndcKey,
        isSyntaxValid,
        syntaxError,
      },
      ports: {
        port53Listening,
        listeners,
        hasSystemdResolvedConflict,
      },
      needsInstallation,
      needsInitialization,
    };
  }

  getInstallProgress(): InstallProgress {
    return this.installProgress;
  }

  async installBind9(): Promise<{ success: boolean; message: string }> {
    if (this.installProgress.status === "running") {
      return { success: false, message: "Installation is already in progress." };
    }

    const osInfo = await this.detectOs();
    if (!osInfo.isLinux) {
      return {
        success: false,
        message: "Automated package installation is only supported on Linux servers (Debian, Ubuntu, RHEL, Rocky, AlmaLinux, CentOS, Fedora, Alpine).",
      };
    }

    const commands: string[] = [];
    if (osInfo.pkgManager === "apt") {
      commands.push("apt-get update");
      commands.push("apt-get install -y --no-install-recommends bind9 bind9utils bind9-doc dnsutils");
    } else if (osInfo.pkgManager === "dnf") {
      commands.push("dnf install -y bind bind-utils");
    } else if (osInfo.pkgManager === "yum") {
      commands.push("yum install -y bind bind-utils");
    } else if (osInfo.pkgManager === "apk") {
      commands.push("apk add --no-cache bind bind-tools");
    } else if (osInfo.pkgManager === "pacman") {
      commands.push("pacman -Sy --noconfirm bind");
    } else {
      return {
        success: false,
        message: `Unsupported package manager for automatic install on ${osInfo.distro}. Please install bind9 manually.`,
      };
    }

    this.installProgress = {
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      logs: [`Starting BIND9 package installation on ${osInfo.distro} via ${osInfo.pkgManager}...`],
    };

    // Run install in background / async
    (async () => {
      try {
        for (const subCmd of commands) {
          let fullCmd = subCmd;
          if (process.getuid && process.getuid() !== 0) {
            fullCmd = `sudo -n env DEBIAN_FRONTEND=noninteractive ${subCmd}`;
          }

          this.installProgress.logs.push(`Executing: ${subCmd}`);
          const { stdout, stderr } = await execAsync(fullCmd, {
            timeout: 300_000,
            env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
          });
          if (stdout) {
            const lines = stdout.split("\n").filter(Boolean);
            this.installProgress.logs.push(...lines.slice(-30));
          }
          if (stderr) {
            this.installProgress.logs.push(`[stderr] ${stderr.trim()}`);
          }
        }

        this.installProgress.status = "success";
        this.installProgress.completedAt = new Date().toISOString();
        this.installProgress.logs.push("BIND9 package installation finished successfully.");
      } catch (err: any) {
        this.installProgress.status = "error";
        this.installProgress.completedAt = new Date().toISOString();
        this.installProgress.error = err.message;
        this.installProgress.logs.push(`ERROR: ${err.message}`);
        if (err.stderr) this.installProgress.logs.push(`[stderr] ${err.stderr}`);
      }
    })();

    return {
      success: true,
      message: "BIND9 installation started in the background. Poll /api/host/bind-install-status for logs.",
    };
  }

  async initializeBind9(options: SetupProfileOptions): Promise<{ success: boolean; message: string; details: any }> {
    const osInfo = await this.detectOs();
    const confDir = process.env.BIND9_CONF_DIR || (["rhel", "centos", "rocky", "almalinux"].includes(osInfo.distro) ? "/etc/named" : "/etc/bind");
    const zoneDir = process.env.BIND9_ZONE_DIR || (["rhel", "centos", "rocky", "almalinux"].includes(osInfo.distro) ? "/var/named" : "/var/cache/bind");
    const bindGroup = ["rhel", "centos", "rocky", "almalinux"].includes(osInfo.distro) ? "named" : "bind";

    // 1. Create directory structure
    await this.execWithSudo(`mkdir -p ${this.quoteShell(confDir)} ${this.quoteShell(zoneDir)} /var/log/named`);

    // 2. Build forwarders string
    const forwardersList = options.forwarders && options.forwarders.length > 0
      ? options.forwarders.map((ip) => ip.trim().replace(/;$/, "")).filter(Boolean)
      : ["1.1.1.1", "8.8.8.8"];

    const forwardersBlock = forwardersList.length > 0
      ? `\n    forwarders {\n        ${forwardersList.map((f) => `${f};`).join("\n        ")}\n    };`
      : "";

    const forwardOnlyDirective = options.forwardOnly ? "\n    forward only;" : "";

    // 3. Profile-specific settings
    let recursionSetting = "recursion no;";
    let allowRecursionSetting = "";

    if (options.profile === "resolver" || options.profile === "hybrid") {
      recursionSetting = "recursion yes;";
      const rec = options.allowRecursion?.trim() || "localhost; 192.168.0.0/16; 10.0.0.0/8; 172.16.0.0/12;";
      allowRecursionSetting = `\n    allow-recursion { ${rec} };`;
    }

    const allowQuery = options.allowQuery?.trim() || "any;";
    const listenV4 = options.listenV4?.trim() || "any;";
    const listenV6 = options.listenV6?.trim() || "any;";
    const dnssec = options.dnssecValidation !== false ? "dnssec-validation auto;" : "dnssec-validation no;";

    // Counter-Logic hardening: Prevent BIND9 configuration injection
    const validateConfigToken = (val: string, field: string) => {
      if (val && !/^[a-zA-Z0-9.\/_\s;{}:-]+$/.test(val)) {
        throw new Error(`Invalid characters detected in '${field}'`);
      }
    };
    validateConfigToken(allowQuery, "allowQuery");
    validateConfigToken(listenV4, "listenV4");
    validateConfigToken(listenV6, "listenV6");
    if (options.allowRecursion) validateConfigToken(options.allowRecursion, "allowRecursion");

    // 4. Generate named.conf.options
    const namedConfOptionsContent = `// Generated by BIND9 Web UI Setup Wizard
// Profile: ${options.profile} (${new Date().toISOString()})

options {
    directory "${zoneDir}";

    listen-on { ${listenV4} };
    listen-on-v6 { ${listenV6} };

    allow-query { ${allowQuery} };${allowRecursionSetting}
    ${recursionSetting}${forwardersBlock}${forwardOnlyDirective}

    ${dnssec}

    auth-nxdomain no;    # conform to RFC1035
    empty-zones-enable yes;

    // Security & hardening
    version none;
    hostname none;
    server-id none;
};
`;

    // 5. Generate named.conf.local
    const namedConfLocalContent = `// Generated by BIND9 Web UI Setup Wizard
// Local zone definitions and managed includes

// Include ACLs and TSIG keys managed by the UI
include "${confDir}/named.conf.acls";
include "${confDir}/named.conf.keys";

// User and custom zones will be appended below
`;

    // 6. Generate named.conf.default-zones (standard RFC1912 zones)
    const namedConfDefaultZonesContent = `// Standard RFC1912 default zones
zone "." {
    type hint;
    file "${path.posix.join(confDir, "db.root")}";
};

zone "localhost" {
    type master;
    file "${path.posix.join(confDir, "db.local")}";
};

zone "127.in-addr.arpa" {
    type master;
    file "${path.posix.join(confDir, "db.127")}";
};

zone "0.in-addr.arpa" {
    type master;
    file "${path.posix.join(confDir, "db.0")}";
};

zone "255.in-addr.arpa" {
    type master;
    file "${path.posix.join(confDir, "db.255")}";
};
`;

    // 7. Generate root named.conf
    const namedConfContent = `// BIND9 Master Configuration
// Managed by BIND9 Web UI

include "${confDir}/named.conf.options";
include "${confDir}/named.conf.local";
include "${confDir}/named.conf.default-zones";
`;

    // Write helper using temp file and sudo cp
    const writeConfigFile = async (targetPath: string, content: string) => {
      const tmpPath = `/tmp/bind_init_${Date.now()}_${path.basename(targetPath)}.tmp`;
      await fsPromises.writeFile(tmpPath, content, "utf-8");
      try {
        await this.execWithSudo(`cp ${this.quoteShell(tmpPath)} ${this.quoteShell(targetPath)}`);
        await this.execWithSudo(`rm -f ${this.quoteShell(tmpPath)}`);
      } catch (err) {
        try { await fsPromises.unlink(tmpPath); } catch {}
        throw err;
      }
    };

    // Write primary configuration files
    await writeConfigFile(path.join(confDir, "named.conf.options"), namedConfOptionsContent);
    await writeConfigFile(path.join(confDir, "named.conf.local"), namedConfLocalContent);
    await writeConfigFile(path.join(confDir, "named.conf"), namedConfContent);

    // Only write default-zones if it does not already exist
    const defaultZonesPath = path.join(confDir, "named.conf.default-zones");
    if (!fs.existsSync(defaultZonesPath)) {
      try { await writeConfigFile(defaultZonesPath, namedConfDefaultZonesContent); } catch {}
    }

    // Ensure empty acls and keys files exist
    const aclsPath = path.join(confDir, "named.conf.acls");
    if (!fs.existsSync(aclsPath)) {
      try { await writeConfigFile(aclsPath, "// Managed ACLs\n"); } catch {}
    }
    const keysPath = path.join(confDir, "named.conf.keys");
    if (!fs.existsSync(keysPath)) {
      try { await writeConfigFile(keysPath, "// Managed TSIG keys\n"); } catch {}
    }

    // 8. Generate RNDC key if missing
    const rndcKeyPath = path.join(confDir, "rndc.key");
    if (!fs.existsSync(rndcKeyPath)) {
      try {
        await this.execWithSudo(`rndc-confgen -a -r /dev/urandom -c ${this.quoteShell(rndcKeyPath)}`);
      } catch {
        // Fallback: generate rndc-key block manually
        const secret = Buffer.from(Math.random().toString() + Date.now().toString()).toString("base64");
        const rndcKeyContent = `key "rndc-key" {\n    algorithm hmac-sha256;\n    secret "${secret}";\n};\n`;
        await writeConfigFile(rndcKeyPath, rndcKeyContent);
      }
    }

    // 9. Fix file permissions & ownership
    try {
      await this.execWithSudo(`chown -R ${bindGroup}:${bindGroup} ${this.quoteShell(confDir)} ${this.quoteShell(zoneDir)} 2>/dev/null || true`);
      await this.execWithSudo(`chmod -R 750 ${this.quoteShell(confDir)} ${this.quoteShell(zoneDir)} 2>/dev/null || true`);
      await this.execWithSudo(`chmod 640 ${this.quoteShell(rndcKeyPath)} 2>/dev/null || true`);
    } catch {}

    // 10. Verify syntax with named-checkconf
    let syntaxValid = true;
    let syntaxOut = "";
    try {
      const { stdout, stderr } = await this.execWithSudo(`named-checkconf ${this.quoteShell(path.join(confDir, "named.conf"))}`);
      syntaxOut = stdout || stderr || "OK";
    } catch (e: any) {
      syntaxValid = false;
      syntaxOut = e.stderr || e.stdout || e.message;
    }

    // 11. Enable and restart service
    let serviceActionOutput = "";
    const detection = await this.detect();
    const serviceName = detection.bind9.serviceName || "bind9";
    try {
      await this.execWithSudo(`systemctl enable ${serviceName} 2>/dev/null || true`);
      const { stdout, stderr } = await this.execWithSudo(`systemctl restart ${serviceName}`);
      serviceActionOutput = stdout || stderr || "Started";
    } catch (e: any) {
      serviceActionOutput = `Service restart warning: ${e.message}`;
    }

    return {
      success: syntaxValid,
      message: syntaxValid
        ? `BIND9 initialized successfully with profile '${options.profile}' and service restarted.`
        : `Configuration written but named-checkconf reported warnings/errors.`,
      details: {
        syntaxValid,
        syntaxOutput: syntaxOut,
        serviceOutput: serviceActionOutput,
      },
    };
  }

  async controlService(action: "start" | "stop" | "restart" | "reload"): Promise<{ success: boolean; message: string; output: string }> {
    const osInfo = await this.detectOs();
    if (!osInfo.isLinux) {
      return {
        success: true,
        message: `Simulation: service ${action} executed (non-Linux environment).`,
        output: "Mock success",
      };
    }

    const detection = await this.detect();
    const serviceName = detection.bind9.serviceName || "bind9";

    try {
      const { stdout, stderr } = await this.execWithSudo(`systemctl ${action} ${serviceName}`);
      const output = (stdout || stderr || "Done").trim();
      return {
        success: true,
        message: `Service '${serviceName}' ${action} executed successfully.`,
        output,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to ${action} ${serviceName}: ${err.message}`,
        output: err.stderr || err.stdout || err.message,
      };
    }
  }

  async testDnsQuery(domain: string, type = "A", server = "127.0.0.1"): Promise<DnsQueryResult> {
    const cleanDomain = domain.trim().replace(/^\.+|\.+$/g, "");
    const cleanType = type.trim().toUpperCase() || "A";
    const cleanServer = server.trim() || "127.0.0.1";

    // Counter-Logic hardening: Strict input boundary validation against shell injection
    if (!/^[a-zA-Z0-9.-]+$/.test(cleanDomain)) {
      throw new Error("Invalid domain name: must contain only alphanumeric characters, dots, and hyphens");
    }
    if (!/^[A-Z0-9]+$/.test(cleanType)) {
      throw new Error("Invalid record type: must be alphanumeric");
    }
    if (!/^[0-9a-zA-Z.:_-]+$/.test(cleanServer)) {
      throw new Error("Invalid server address: contains disallowed characters");
    }

    const startTime = Date.now();

    // Check if dig is available
    if (await this.isCommandAvailable("dig")) {
      try {
        const { stdout } = await execAsync(
          `dig @${this.quoteShell(cleanServer)} ${this.quoteShell(cleanDomain)} ${this.quoteShell(cleanType)} +noall +answer +comments +stats +time=2 +tries=1`
        );
        const queryTimeMs = Date.now() - startTime;
        const answers: DnsQueryResult["answers"] = [];

        const lines = stdout.split("\n");
        let status = "NOERROR";
        for (const line of lines) {
          const statusMatch = line.match(/status:\s*([A-Z]+)/i);
          if (statusMatch) status = statusMatch[1].toUpperCase();

          // Answer section line format: domain. TTL IN TYPE VALUE
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 5 && parts[2] === "IN") {
            answers.push({
              name: parts[0],
              ttl: parseInt(parts[1], 10) || 0,
              type: parts[3],
              value: parts.slice(4).join(" "),
            });
          }
        }

        return {
          domain: cleanDomain,
          type: cleanType,
          server: cleanServer,
          status,
          queryTimeMs,
          answers,
          rawOutput: stdout,
        };
      } catch (err: any) {
        return {
          domain: cleanDomain,
          type: cleanType,
          server: cleanServer,
          status: "ERROR",
          queryTimeMs: Date.now() - startTime,
          answers: [],
          rawOutput: err.message,
        };
      }
    }

    // Node.js native dns.promises fallback
    try {
      const resolver = new dns.promises.Resolver({ timeout: 2000, tries: 1 });
      resolver.setServers([cleanServer]);

      const answers: DnsQueryResult["answers"] = [];
      if (cleanType === "A") {
        const res = await resolver.resolve4(cleanDomain, { ttl: true });
        for (const item of res) {
          answers.push({ name: cleanDomain, type: "A", ttl: item.ttl, value: item.address });
        }
      } else if (cleanType === "AAAA") {
        const res = await resolver.resolve6(cleanDomain, { ttl: true });
        for (const item of res) {
          answers.push({ name: cleanDomain, type: "AAAA", ttl: item.ttl, value: item.address });
        }
      } else if (cleanType === "MX") {
        const res = await resolver.resolveMx(cleanDomain);
        for (const item of res) {
          answers.push({ name: cleanDomain, type: "MX", ttl: 300, value: `${item.priority} ${item.exchange}` });
        }
      } else if (cleanType === "TXT") {
        const res = await resolver.resolveTxt(cleanDomain);
        for (const item of res) {
          answers.push({ name: cleanDomain, type: "TXT", ttl: 300, value: item.join(" ") });
        }
      } else if (cleanType === "NS") {
        const res = await resolver.resolveNs(cleanDomain);
        for (const item of res) {
          answers.push({ name: cleanDomain, type: "NS", ttl: 300, value: item });
        }
      } else if (cleanType === "CNAME") {
        const res = await resolver.resolveCname(cleanDomain);
        for (const item of res) {
          answers.push({ name: cleanDomain, type: "CNAME", ttl: 300, value: item });
        }
      } else {
        const res = await resolver.resolve(cleanDomain, cleanType);
        answers.push({ name: cleanDomain, type: cleanType, ttl: 300, value: JSON.stringify(res) });
      }

      return {
        domain: cleanDomain,
        type: cleanType,
        server: cleanServer,
        status: "NOERROR",
        queryTimeMs: Date.now() - startTime,
        answers,
        rawOutput: JSON.stringify(answers, null, 2),
      };
    } catch (err: any) {
      return {
        domain: cleanDomain,
        type: cleanType,
        server: cleanServer,
        status: err.code || "NXDOMAIN",
        queryTimeMs: Date.now() - startTime,
        answers: [],
        rawOutput: err.message,
      };
    }
  }
}

export const hostBindManager = new HostBindManager();
