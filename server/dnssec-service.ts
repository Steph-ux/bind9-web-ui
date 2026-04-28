import { storage } from "./storage";
import { bind9Service } from "./bind9-service";
import type { DnssecKey } from "@shared/schema";

export interface DnssecKeyResult {
  success: boolean;
  message: string;
  key?: DnssecKey;
}

const VALID_ALGORITHMS = ["ECDSAP256SHA256", "ECDSAP384SHA384", "RSASHA256", "RSASHA512"];
const DOMAIN_REGEX = /^[a-zA-Z0-9._-]+$/;

function sanitizeDomain(domain: string): string {
  if (!DOMAIN_REGEX.test(domain)) throw new Error("Invalid domain name");
  return domain;
}

class DnssecService {
  /** Generate a new DNSSEC key for a zone via rndc */
  async generateKey(zoneId: string, keyType: "KSK" | "ZSK", algorithm = "ECDSAP256SHA256", keySize = 256): Promise<DnssecKeyResult> {
    try {
      const zone = await storage.getZone(zoneId);
      if (!zone) return { success: false, message: "Zone not found" };
      if (zone.type !== "master") return { success: false, message: "DNSSEC keys can only be generated for master zones" };

      if (!(await bind9Service.isAvailable())) {
        return { success: false, message: "BIND9 is not available" };
      }

      if (keyType !== "KSK" && keyType !== "ZSK") return { success: false, message: "Invalid keyType" };
      if (!VALID_ALGORITHMS.includes(algorithm)) return { success: false, message: "Invalid algorithm" };
      if (keySize && (!Number.isInteger(keySize) || keySize < 1 || keySize > 4096)) return { success: false, message: "Invalid keySize" };
      const safeDomain = sanitizeDomain(zone.domain);

      const sizeFlag = keySize ? ` -b ${keySize}` : "";
      const algoFlag = ` -a ${algorithm}`;
      const rndcCmd = `dnssec -keycreate ${keyType === "KSK" ? "-ksk" : "-zsk"}${algoFlag}${sizeFlag} ${safeDomain}`;

      const result = await bind9Service.rndc(rndcCmd);
      const keyTagMatch = result.match(/key tag:\s*(\d+)/i) || result.match(/key=(\d+)/);
      const keyTag = keyTagMatch ? keyTagMatch[1] : `gen-${Date.now()}`;

      const key = await storage.createDnssecKey({
        zoneId,
        keyTag,
        keyType,
        algorithm,
        keySize,
        status: "active",
        filePath: null,
        activatedAt: new Date().toISOString(),
        retiredAt: null,
      });

      await storage.insertLog({
        level: "INFO",
        source: "dnssec",
        message: `DNSSEC ${keyType} key generated for ${zone.domain} (tag: ${keyTag}, algo: ${algorithm})`,
      });

      return { success: true, message: `${keyType} key generated for ${zone.domain}`, key };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /** Sign a zone using rndc dnssec-signzone */
  async signZone(zoneId: string): Promise<DnssecKeyResult> {
    try {
      const zone = await storage.getZone(zoneId);
      if (!zone) return { success: false, message: "Zone not found" };

      if (!(await bind9Service.isAvailable())) {
        return { success: false, message: "BIND9 is not available" };
      }

      if (zone.type !== "master") return { success: false, message: "Only master zones can be signed" };
      const safeDomain = sanitizeDomain(zone.domain);
      await bind9Service.rndc(`signing -nsec3param 1 0 10 auto ${safeDomain}`);

      await storage.insertLog({
        level: "INFO",
        source: "dnssec",
        message: `DNSSEC signing initiated for ${zone.domain}`,
      });

      return { success: true, message: `Signing initiated for ${zone.domain}` };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /** Check DNSSEC signing status for a zone */
  async getSigningStatus(zoneId: string): Promise<{ signed: boolean; keys: DnssecKey[]; details: string }> {
    try {
      const zone = await storage.getZone(zoneId);
      if (!zone) return { signed: false, keys: [], details: "Zone not found" };

      const keys = await storage.getDnssecKeys(zoneId);
      const activeKeys = keys.filter((key) => key.status === "active");

      let details = "";
      if (await bind9Service.isAvailable()) {
        try {
          const safeDomain = sanitizeDomain(zone.domain);
          details = await bind9Service.rndc(`signing -list ${safeDomain}`);
        } catch {
          details = "Unable to retrieve signing status";
        }
      }

      return {
        signed: activeKeys.length > 0,
        keys,
        details,
      };
    } catch (err: any) {
      return { signed: false, keys: [], details: err.message };
    }
  }

  /** Retire a DNSSEC key */
  async retireKey(keyId: string): Promise<DnssecKeyResult> {
    try {
      const key = await storage.getDnssecKey(keyId);
      if (!key) return { success: false, message: "Key not found" };

      const zone = await storage.getZone(key.zoneId);
      if (!zone) return { success: false, message: "Zone not found" };
      if (!(await bind9Service.isAvailable())) {
        return { success: false, message: "BIND9 is not available" };
      }

      const safeDomain = sanitizeDomain(zone.domain);
      if (!/^[0-9]+$/.test(key.keyTag)) return { success: false, message: "Invalid key tag" };
      await bind9Service.rndc(`dnssec -keyretire ${key.keyTag} ${safeDomain}`);

      await storage.updateDnssecKey(keyId, {
        status: "retired",
        retiredAt: new Date().toISOString(),
      });

      await storage.insertLog({
        level: "INFO",
        source: "dnssec",
        message: `DNSSEC ${key.keyType} key ${key.keyTag} retired for ${zone.domain}`,
      });

      return { success: true, message: `Key ${key.keyTag} retired` };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /** Delete a DNSSEC key record */
  async deleteKey(keyId: string): Promise<DnssecKeyResult> {
    try {
      const key = await storage.getDnssecKey(keyId);
      if (!key) return { success: false, message: "Key not found" };

      const zone = await storage.getZone(key.zoneId);
      if (!zone) return { success: false, message: "Zone not found" };
      if (!(await bind9Service.isAvailable())) {
        return { success: false, message: "BIND9 is not available" };
      }
      if (key.status === "active") return { success: false, message: "Cannot delete an active key; retire it first" };

      const safeDomain = sanitizeDomain(zone.domain);
      if (!/^[0-9]+$/.test(key.keyTag)) return { success: false, message: "Invalid key tag" };
      await bind9Service.rndc(`dnssec -keydelete ${key.keyTag} ${safeDomain}`);

      await storage.deleteDnssecKey(keyId);

      await storage.insertLog({
        level: "INFO",
        source: "dnssec",
        message: `DNSSEC ${key.keyType} key ${key.keyTag} deleted for ${zone.domain}`,
      });

      return { success: true, message: `Key ${key.keyTag} deleted` };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}

export const dnssecService = new DnssecService();

