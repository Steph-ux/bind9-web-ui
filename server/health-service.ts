import { storage } from "./storage";
import { replicationService } from "./replication-service";
import type { ReplicationServer } from "@shared/schema";

export interface HealthCheckResult {
  serverId: string;
  serverName: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number | null;
  details: string;
}

class HealthService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private checkIntervalMs = 60_000; // 1 minute default

  /** Start periodic health checks */
  start(intervalMs = 60_000) {
    this.checkIntervalMs = intervalMs;
    if (this.interval) clearInterval(this.interval);
    // Run immediately, then on interval
    this.runCheck();
    this.interval = setInterval(() => this.runCheck(), this.checkIntervalMs);
    console.log(`[health] Periodic health checks started (every ${intervalMs / 1000}s)`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("[health] Periodic health checks stopped");
    }
  }

  /** Run a single health check round for all enabled servers */
  async runCheck(): Promise<HealthCheckResult[]> {
    const servers = await storage.getReplicationServers();
    const enabled = servers.filter(s => s.enabled);
    const results: HealthCheckResult[] = [];

    for (const server of enabled) {
      const result = await this.checkServer(server);
      results.push(result);

      // Store result
      await storage.createHealthCheck({
        serverId: server.id,
        status: result.status,
        latencyMs: result.latencyMs,
        details: result.details,
      });

      // Send notifications if status changed
      // Get the 2 most recent checks (the one we just inserted + the previous one)
      const allChecks = await storage.getHealthChecks(server.id, 2);
      if (allChecks.length >= 2 && allChecks[1].status !== result.status) {
        await this.dispatchNotification({
          event: result.status === "down" ? "server_down" : "health_degraded",
          serverName: server.name,
          serverId: server.id,
          previousStatus: allChecks[1].status,
          newStatus: result.status,
          details: result.details,
        });
      }
    }

    return results;
  }

  /** Check a single server's health via SSH */
  async checkServer(server: ReplicationServer): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const client = await replicationService.connectToServer(server);
      try {
        // Run a lightweight command to verify SSH + BIND9 availability
        const { stdout } = await replicationService.execOnClient(
          client,
          "sudo -n /usr/sbin/rndc status 2>/dev/null || echo 'BIND9_UNAVAILABLE'"
        );
        const latency = Date.now() - start;

        if (stdout.includes("BIND9_UNAVAILABLE")) {
          return {
            serverId: server.id,
            serverName: server.name,
            status: "degraded",
            latencyMs: latency,
            details: "SSH OK but BIND9/rndc unavailable",
          };
        }

        return {
          serverId: server.id,
          serverName: server.name,
          status: "healthy",
          latencyMs: latency,
          details: stdout.trim().split("\n")[0], // First line of rndc status
        };
      } finally {
        client.end();
      }
    } catch (err: any) {
      return {
        serverId: server.id,
        serverName: server.name,
        status: "down",
        latencyMs: null,
        details: err.message || "Connection failed",
      };
    }
  }

  /** Check if a URL points to a private/internal address (SSRF protection) */
  private isPrivateUrl(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      if (!["http:", "https:"].includes(parsed.protocol)) return true;
      const h = parsed.hostname;
      return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|localhost|::1|fe80::|fd[0-9a-f]{2}:|fc[0-9a-f]{2}:|169\.254\.)/i.test(h);
    } catch { return true; }
  }

  /** Dispatch notification to all enabled channels matching the event */
  private async dispatchNotification(alert: {
    event: string;
    serverName: string;
    serverId: string;
    previousStatus: string;
    newStatus: string;
    details: string;
  }) {
    const channels = await storage.getNotificationChannels();
    const enabled = channels.filter(c => c.enabled);

    for (const channel of enabled) {
      const events = channel.events.split(",");
      if (!events.includes(alert.event)) continue;

      try {
        const config = JSON.parse(channel.config);
        const message = `[Bind9 Manager] ${alert.event.toUpperCase()}: ${alert.serverName} changed from ${alert.previousStatus} to ${alert.newStatus}. ${alert.details}`;

        if (channel.type === "webhook" && config.url) {
          if (this.isPrivateUrl(config.url)) {
            console.error(`[health] Blocked webhook to private URL: ${config.url}`);
            continue;
          }
          await fetch(config.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: alert.event,
              server: alert.serverName,
              previousStatus: alert.previousStatus,
              newStatus: alert.newStatus,
              details: alert.details,
              timestamp: new Date().toISOString(),
            }),
            signal: AbortSignal.timeout(5000),
          });
        } else if (channel.type === "slack" && config.webhookUrl) {
          if (this.isPrivateUrl(config.webhookUrl)) {
            console.error(`[health] Blocked Slack webhook to private URL`);
            continue;
          }
          await fetch(config.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: message }),
            signal: AbortSignal.timeout(5000),
          });
        }
        // Email type would require a mail transport — placeholder for now
        if (channel.type === "email") {
          console.log(`[health] Email notification to ${config.email}: ${message}`);
        }
      } catch (err: any) {
        console.error(`[health] Failed to notify channel ${channel.name}: ${err.message}`);
      }
    }

    // Also log the health event
    await storage.insertLog({
      level: alert.newStatus === "down" ? "ERROR" : "WARN",
      source: "health",
      message: `${alert.serverName}: ${alert.previousStatus} → ${alert.newStatus} (${alert.details})`,
    });
  }
}

export const healthService = new HealthService();
