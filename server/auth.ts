// Copyright © 2025 Stephane ASSOGBA
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { type Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User, InsertUser } from "@shared/schema";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
    const [hashed, salt] = stored.split(".");
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    const match = timingSafeEqual(hashedBuf, suppliedBuf);

    return match;
}

// IP Blacklisting is now handled via persistent DB storage (storage.recordFailedAttempt, storage.isIpBanned)
// Cleanup expired bans every hour
setInterval(() => {
    storage.cleanupExpiredBans().catch(() => {});
}, 60 * 60 * 1000);

export function setupAuth(app: Express) {
    // Enforce a strong session secret — in production, MUST be set via env
    let sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
        if (app.get("env") === "production") {
            console.error("[auth] FATAL: SESSION_SECRET environment variable must be set in production!");
            process.exit(1);
        }
        // In dev, generate a random one so sessions still work
        sessionSecret = randomBytes(32).toString("hex");
        console.warn("[auth] WARNING: Using auto-generated SESSION_SECRET. Set SESSION_SECRET env var for production.");
    }

    const sessionSettings: session.SessionOptions = {
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        store: undefined,
        cookie: {
            secure: app.get("env") === "production",
            httpOnly: true,
            sameSite: app.get("env") === "production" ? "lax" : "lax",
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    };

    if (app.get("env") === "production") {
        app.set("trust proxy", 1); // trust first proxy
    }

    app.use(session(sessionSettings));
    app.use(passport.initialize());
    app.use(passport.session());

    passport.use(
        new LocalStrategy(async (username, password, done) => {

            try {
                const user = await storage.getUserByUsername(username);
                if (!user) {

                    return done(null, false, { message: "Incorrect username." });
                }


                const isValid = await comparePasswords(password, user.password);
                if (!isValid) {

                    return done(null, false, { message: "Incorrect password." });
                }

                return done(null, user);
            } catch (error) {

                return done(error);
            }
        }),
    );

    passport.serializeUser((user, done) => {
        done(null, (user as User).id);
    });

    passport.deserializeUser(async (id: string, done) => {
        try {
            const user = await storage.getUser(id);
            done(null, user);
        } catch (error) {
            done(error);
        }
    });

    // Auth Routes
    app.post("/api/auth/login", async (req, res, next) => {
        // Check if IP is banned (persistent blacklist)
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        const banned = await storage.isIpBanned(ip);
        if (banned) {
            return res.status(429).json({ message: "Your IP has been banned due to too many failed attempts. Contact an administrator." });
        }

        passport.authenticate("local", async (err: any, user: any, info: any) => {
            if (err) return next(err);
            if (!user) {
                // Record failed attempt in persistent blacklist
                await storage.recordFailedAttempt(ip, "login_failed");
                return res.status(401).json({ message: "Invalid credentials" });
            }
            req.login(user, (err) => {
                if (err) return next(err);
                // Express 5 compat: manually save session so cookie is set
                req.session.save(() => {
                    const { password, ...userWithoutPassword } = user;
                    return res.json(userWithoutPassword);
                });
            });
        })(req, res, next);
    });

    app.post("/api/auth/logout", (req, res, next) => {
        req.logout((err) => {
            if (err) return next(err);
            res.sendStatus(200);
        });
    });

    app.get("/api/auth/me", (req, res) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ message: "Not authenticated" });
        }
        const { password, ...userWithoutPassword } = req.user as User;
        res.json(userWithoutPassword);
    });

    // Allow any authenticated user to change their own password
    app.put("/api/auth/password", async (req, res) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ message: "Not authenticated" });
        }
        const { currentPassword, newPassword } = req.body;
        if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
            return res.status(400).json({ message: "New password must be at least 8 characters" });
        }
        const user = req.user as User;
        // Verify current password if user doesn't have mustChangePassword flag
        if (!user.mustChangePassword) {
            if (!currentPassword) {
                return res.status(400).json({ message: "Current password is required" });
            }
            const isValid = await comparePasswords(currentPassword, user.password);
            if (!isValid) {
                return res.status(401).json({ message: "Current password is incorrect" });
            }
        }
        const hashedPassword = await hashPassword(newPassword);
        await storage.updateUser(user.id, { password: hashedPassword, mustChangePassword: false });
        // Update req.user so subsequent /me calls reflect the change
        const updated = await storage.getUser(user.id);
        if (updated) {
            req.login(updated, () => {});
        }
        res.json({ message: "Password changed successfully" });
    });

    // Seed Admin User
    (async () => {
        const existingAdmin = await storage.getUserByUsername("admin");
        if (!existingAdmin) {
            const bootstrapPassword = process.env.DEFAULT_ADMIN_PASSWORD || randomBytes(9).toString("base64url");
            const hashedPassword = await hashPassword(bootstrapPassword);
            await storage.createUser({
                username: "admin",
                password: hashedPassword,
                role: "admin",
                mustChangePassword: true,
            } as any);
            console.log(`[auth] Bootstrap admin user created (admin/${bootstrapPassword}) - CHANGE PASSWORD IMMEDIATELY`);
        }
    })();
}

// Helper to hash passwords (e.g. for user creation routes)
export { hashPassword };
