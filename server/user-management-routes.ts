import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";

import { insertUserSchema } from "@shared/schema";

import { hashPassword } from "./auth";
import { storage } from "./storage";

type RegisterUserManagementRoutesOptions = {
  app: Express;
  requireAdmin: RequestHandler;
  safeError: (status: number, message: string) => string;
};

const ALLOWED_ROLES = ["admin", "operator", "viewer"] as const;

export function registerUserManagementRoutes({
  app,
  requireAdmin,
  safeError,
}: RegisterUserManagementRoutesOptions) {
  app.get("/api/users", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const users = await storage.getUsers();
      const safeUsers = users.map(({ password, ...rest }) => rest);
      res.json(safeUsers);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.post("/api/users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const existing = await storage.getUserByUsername(data.username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await hashPassword(data.password);
      const user = await storage.createUser({
        ...data,
        password: hashedPassword,
      });

      const { password, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/users/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const { role, username, mustChangePassword, newPassword } = req.body;

      const updateData: Record<string, unknown> = {};
      if (role) {
        if (!ALLOWED_ROLES.includes(role)) {
          return res.status(400).json({ message: `Invalid role. Allowed: ${ALLOWED_ROLES.join(", ")}` });
        }
        updateData.role = role;
      }
      if (newPassword) {
        if (typeof newPassword !== "string" || newPassword.length < 8) {
          return res.status(400).json({ message: "New password must be at least 8 characters" });
        }
        updateData.password = await hashPassword(newPassword);
        updateData.mustChangePassword = false;
      }
      if (username !== undefined) {
        if (typeof username !== "string" || username.trim().length < 2) {
          return res.status(400).json({ message: "Username must be at least 2 characters" });
        }
        if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
          return res.status(400).json({ message: "Username contains invalid characters" });
        }
        updateData.username = username.trim();
      }
      if (mustChangePassword !== undefined) {
        updateData.mustChangePassword = !!mustChangePassword;
      }

      const updated = await storage.updateUser(id, updateData);
      const { password, ...safeUser } = updated;
      res.json(safeUser);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.delete("/api/users/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (id === (req.user as any).id) {
        return res.status(400).json({ message: "Cannot delete yourself" });
      }
      await storage.deleteUser(id);
      res.json({ message: "User deleted" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.get("/api/users/:id/domains", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = String(req.params.id);
      const assignments = await storage.getUserDomains(userId);
      res.json(assignments);
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });

  app.put("/api/users/:id/domains", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = String(req.params.id);
      const { zoneIds } = req.body;
      if (!Array.isArray(zoneIds)) {
        return res.status(400).json({ message: "zoneIds must be an array" });
      }

      await storage.setUserDomains(userId, zoneIds);
      await storage.insertLog({
        level: "INFO",
        source: "users",
        message: `Domain assignments updated for user ${userId} (${zoneIds.length} zones)`,
      });
      res.json({ message: "Domain assignments updated" });
    } catch (error: any) {
      res.status(500).json({ message: safeError(500, error.message) });
    }
  });
}
