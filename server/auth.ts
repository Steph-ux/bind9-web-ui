// Copyright Â(c) 2025 Stephane ASSOGBA
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { type Express, type Request } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User } from "@shared/schema";

const scryptAsync = promisify(scrypt);
const unsafeApiMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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

type ParsedOrigin = {
    protocol: string;
    hostname: string;
    port: string | null;
};

function parseHeaderOrigin(value?: string): ParsedOrigin | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return {
            protocol: url.protocol.toLowerCase(),
            hostname: url.hostname.toLowerCase(),
            port: url.port || null,
        };
    } catch {
        return null;
    }
}

function getRequestOrigin(req: Request): ParsedOrigin | null {
    const host = (req.get("x-forwarded-host") || req.get("host") || "")
        .split(",")[0]
        .trim()
        .toLowerCase();
    if (!host) return null;

    const protocol = `${(req.get("x-forwarded-proto") || req.protocol || "http")
        .split(",")[0]
        .trim()
        .toLowerCase()}:`;

    try {
        const url = new URL(`${protocol}//${host}`);
        return {
            protocol: url.protocol.toLowerCase(),
            hostname: url.hostname.toLowerCase(),
            port: url.port || req.get("x-forwarded-port") || null,
        };
    } catch {
        return null;
    }
}

function originsMatch(left: ParsedOrigin, right: ParsedOrigin): boolean {
    if (left.protocol !== right.protocol) return false;
    if (left.hostname !== right.hostname) return false;

    // Reverse proxies commonly drop the external port from Host/X-Forwarded-Host.
    // When one side lacks explicit port information, fall back to host+scheme match.
    if (!left.port || !right.port) return true;

    return left.port === right.port;
}

function hasTrustedBrowserOrigin(req: Request): boolean {
    const requestOrigin = getRequestOrigin(req);
    if (!requestOrigin) return false;

    const origin = parseHeaderOrigin(req.get("origin") || undefined);
    if (origin) {
        return originsMatch(origin, requestOrigin);
    }

    const referer = parseHeaderOrigin(req.get("referer") || undefined);
    if (referer) {
        return originsMatch(referer, requestOrigin);
    }

    return false;
}

// IP blacklisting is handled via persistent DB storage.
const cleanupInterval = setInterval(() => {
    storage.cleanupExpiredBans().catch(() => {});
}, 60 * 60 * 1000);
cleanupInterval.unref?.();

export function setupAuth(app: Express) {
    const isProduction = app.get("env") === "production";
    const sessionTtlMs = 24 * 60 * 60 * 1000;
    const sessionCookieName = isProduction ? "__Host-bind9admin.sid" : "bind9admin.sid";
    const MemoryStore = createMemoryStore(session);
    const sessionStore = new MemoryStore({
        checkPeriod: sessionTtlMs,
        ttl: sessionTtlMs,
    });

    // Enforce a strong session secret in production.
    let sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
        if (isProduction) {
            console.error("[auth] FATAL: SESSION_SECRET environment variable must be set in production!");
            process.exit(1);
        }
        sessionSecret = randomBytes(32).toString("hex");
        console.warn("[auth] WARNING: Using auto-generated SESSION_SECRET. Set SESSION_SECRET for production.");
    }

    const sessionSettings: session.SessionOptions = {
        name: sessionCookieName,
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        rolling: false,
        proxy: isProduction,
        unset: "destroy",
        store: sessionStore,
        cookie: {
            secure: isProduction,
            httpOnly: true,
            sameSite: isProduction ? "strict" : "lax",
            path: "/",
            maxAge: sessionTtlMs,
        },
    };

    if (isProduction) {
        app.set("trust proxy", 1);
    }

    app.use(session(sessionSettings));
    app.use(passport.initialize());
    app.use(passport.session());
    app.use("/api/auth", (_req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Pragma", "no-cache");
        next();
    });
    app.use("/api", (req, res, next) => {
        if (!unsafeApiMethods.has(req.method)) return next();
        if (req.get("authorization")?.startsWith("Bearer ")) return next();

        const cookieHeader = req.get("cookie");
        if (!cookieHeader || !cookieHeader.includes(`${sessionCookieName}=`)) {
            return next();
        }

        if (hasTrustedBrowserOrigin(req)) {
            return next();
        }

        return res.status(403).json({ message: "Cross-site request blocked" });
    });

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

        passport.authenticate("local", async (err: any, user: any) => {
            if (err) return next(err);
            if (!user) {
                await storage.recordFailedAttempt(ip, "login_failed");
                return res.status(401).json({ message: "Invalid credentials" });
            }

            req.session.regenerate((regenErr) => {
                if (regenErr) return next(regenErr);

                req.login(user, (loginErr) => {
                    if (loginErr) return next(loginErr);

                    req.session.save((saveErr) => {
                        if (saveErr) return next(saveErr);
                        const { password, ...userWithoutPassword } = user;
                        return res.json(userWithoutPassword);
                    });
                });
            });
        })(req, res, next);
    });

    app.post("/api/auth/logout", (req, res, next) => {
        const clearSessionCookie = () => {
            res.clearCookie(sessionCookieName, {
                httpOnly: true,
                path: "/",
                sameSite: isProduction ? "strict" : "lax",
                secure: isProduction,
            });
            res.sendStatus(200);
        };

        req.logout((logoutErr) => {
            if (logoutErr) return next(logoutErr);
            if (!req.session) {
                return clearSessionCookie();
            }

            req.session.destroy((destroyErr) => {
                if (destroyErr) return next(destroyErr);
                return clearSessionCookie();
            });
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

    (async () => {
        const existingAdmin = await storage.getUserByUsername("admin");
        if (existingAdmin) {
            return;
        }

        const bootstrapPassword = process.env.DEFAULT_ADMIN_PASSWORD;
        if (!bootstrapPassword && isProduction) {
            console.error("[auth] FATAL: DEFAULT_ADMIN_PASSWORD must be set to bootstrap the first admin user in production!");
            process.exit(1);
        }

        const resolvedBootstrapPassword = bootstrapPassword || randomBytes(9).toString("base64url");
        const hashedPassword = await hashPassword(resolvedBootstrapPassword);
        await storage.createUser({
            username: "admin",
            password: hashedPassword,
            role: "admin",
            mustChangePassword: true,
        } as any);

        if (bootstrapPassword) {
            console.log("[auth] Bootstrap admin user created from DEFAULT_ADMIN_PASSWORD - CHANGE PASSWORD IMMEDIATELY");
            return;
        }

        console.log(`[auth] Bootstrap admin user created for development (admin/${resolvedBootstrapPassword}) - CHANGE PASSWORD IMMEDIATELY`);
    })();
}

export { hashPassword };

