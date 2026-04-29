import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";

import { insertAclSchema, insertTsigKeySchema } from "@shared/schema";

import { bind9Service } from "./bind9-service";
import { storage } from "./storage";

type RegisterBindSecurityRoutesOptions = {
  app: Express;
  requireViewer: RequestHandler;
  requireOperator: RequestHandler;
  safeError: (status: number, message: string) => string;
  refreshAclsFromBind: () => Promise<any[]>;
  refreshKeysFromBind: () => Promise<any[]>;
};

export function registerBindSecurityRoutes({
  app,
  requireViewer,
  requireOperator,
  safeError,
  refreshAclsFromBind,
  refreshKeysFromBind,
}: RegisterBindSecurityRoutesOptions) {
  app.get("/api/acls", requireViewer, async (_req: Request, res: Response) => {
    try {
      let acls = await storage.getAcls();
      if (await bind9Service.isAvailable()) {
        const management = await bind9Service.getManagementSummary();
        if (management.features.acls) {
          acls = await refreshAclsFromBind();
        }
      }
      res.json(acls);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/acls", requireOperator, async (req: Request, res: Response) => {
    try {
      const data = insertAclSchema.parse(req.body);
      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }

      const management = await bind9Service.getManagementSummary();
      if (!management.features.acls) {
        return res.status(409).json({
          message: "ACL management is disabled because named.conf.acls is not included or not writable on this server",
        });
      }

      const existingAcls = await refreshAclsFromBind();
      if (existingAcls.some((item) => item.name === data.name)) {
        return res.status(409).json({ message: `ACL '${data.name}' already exists` });
      }

      await bind9Service.writeAclsConf([...existingAcls, data]);
      await bind9Service.rndc("reconfig");
      const acl = await storage.createAcl(data);

      await storage.insertLog({
        level: "INFO",
        source: "security",
        message: `ACL '${acl.name}' created with networks: ${acl.networks}`,
      });

      res.status(201).json(acl);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/acls/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const acl = await storage.getAcl(id);
      if (!acl) {
        return res.status(404).json({ message: "ACL not found" });
      }

      const allowed: Record<string, any> = {};
      const { name, networks, comment } = req.body;
      if (name !== undefined) allowed.name = String(name);
      if (networks !== undefined) allowed.networks = String(networks);
      if (comment !== undefined) allowed.comment = String(comment);

      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }

      const management = await bind9Service.getManagementSummary();
      if (!management.features.acls) {
        return res.status(409).json({
          message: "ACL management is disabled because named.conf.acls is not included or not writable on this server",
        });
      }

      const currentAcls = await refreshAclsFromBind();
      const nextAcl = { ...acl, ...allowed };
      if (currentAcls.some((item) => item.id !== id && item.name === nextAcl.name)) {
        return res.status(409).json({ message: `ACL '${nextAcl.name}' already exists` });
      }

      await bind9Service.writeAclsConf(currentAcls.map((item) => (item.id === id ? nextAcl : item)));
      await bind9Service.rndc("reconfig");
      const updated = await storage.updateAcl(id, allowed);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/acls/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const acl = await storage.getAcl(id);
      if (!acl) {
        return res.status(404).json({ message: "ACL not found" });
      }

      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }

      const management = await bind9Service.getManagementSummary();
      if (!management.features.acls) {
        return res.status(409).json({
          message: "ACL management is disabled because named.conf.acls is not included or not writable on this server",
        });
      }

      const currentAcls = await refreshAclsFromBind();
      await bind9Service.writeAclsConf(currentAcls.filter((item) => item.id !== id));
      await bind9Service.rndc("reconfig");
      await storage.deleteAcl(id);

      await storage.insertLog({
        level: "WARN",
        source: "security",
        message: `ACL '${acl.name}' deleted`,
      });
      res.json({ message: "ACL deleted" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/keys", requireViewer, async (_req: Request, res: Response) => {
    try {
      let keys = await storage.getKeys();
      if (await bind9Service.isAvailable()) {
        const management = await bind9Service.getManagementSummary();
        if (management.features.keys) {
          keys = await refreshKeysFromBind();
        }
      }

      res.json(
        keys.map((key) => ({
          ...key,
          secret: key.secret.slice(0, 5) + "...[hidden]",
        })),
      );
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/keys", requireOperator, async (req: Request, res: Response) => {
    try {
      const parsed = insertTsigKeySchema.parse(req.body);
      const data = {
        ...parsed,
        algorithm: parsed.algorithm || "hmac-sha256",
      };

      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }

      const management = await bind9Service.getManagementSummary();
      if (!management.features.keys) {
        return res.status(409).json({
          message: "TSIG key management is disabled because named.conf.keys is not included or not writable on this server",
        });
      }

      const existingKeys = await refreshKeysFromBind();
      if (existingKeys.some((item) => item.name === data.name)) {
        return res.status(409).json({ message: `TSIG key '${data.name}' already exists` });
      }

      await bind9Service.writeKeysConf([...existingKeys, data]);
      await bind9Service.rndc("reconfig");
      const key = await storage.createKey(data);

      await storage.insertLog({
        level: "INFO",
        source: "security",
        message: `TSIG key '${key.name}' created`,
      });

      res.status(201).json({
        ...key,
        secret: key.secret.slice(0, 5) + "...[hidden]",
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/keys/:id", requireOperator, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const key = await storage.getKey(id);
      if (!key) {
        return res.status(404).json({ message: "Key not found" });
      }

      if (!(await bind9Service.isAvailable())) {
        return res.status(503).json({ message: "BIND9 is not available" });
      }

      const management = await bind9Service.getManagementSummary();
      if (!management.features.keys) {
        return res.status(409).json({
          message: "TSIG key management is disabled because named.conf.keys is not included or not writable on this server",
        });
      }

      const currentKeys = await refreshKeysFromBind();
      await bind9Service.writeKeysConf(currentKeys.filter((item) => item.id !== id));
      await bind9Service.rndc("reconfig");
      await storage.deleteKey(id);

      await storage.insertLog({
        level: "WARN",
        source: "security",
        message: `TSIG key '${key.name}' deleted`,
      });
      res.json({ message: "Key deleted" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });
}
