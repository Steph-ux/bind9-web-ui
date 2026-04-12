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

// Simple in-memory rate limiter for login attempts
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_RATE_LIMIT = 5;       // max attempts per window
const LOGIN_RATE_WINDOW = 60000;  // 60 seconds

function checkLoginRate(ip: string): boolean {
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
        loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_RATE_WINDOW });
        return true;
    }
    entry.count++;
    return entry.count <= LOGIN_RATE_LIMIT;
}

// Clean up old entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    const expired: string[] = [];
    loginAttempts.forEach((entry, ip) => {
        if (now > entry.resetAt) expired.push(ip);
    });
    expired.forEach(ip => loginAttempts.delete(ip));
}, 5 * 60 * 1000);

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
    app.post("/api/auth/login", (req, res, next) => {
        // Rate limit login attempts by IP
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        if (!checkLoginRate(ip)) {
            return res.status(429).json({ message: "Too many login attempts. Try again in 60 seconds." });
        }

        passport.authenticate("local", (err: any, user: any, info: any) => {
            if (err) return next(err);
            if (!user) {
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

    // Seed Admin User
    (async () => {
        const existingAdmin = await storage.getUserByUsername("admin");
        if (!existingAdmin) {
            const hashedPassword = await hashPassword("admin");
            await storage.createUser({
                username: "admin",
                password: hashedPassword,
                role: "admin",
                mustChangePassword: true,
            } as any);
            console.log("[auth] Default admin user created (admin/admin) — CHANGE PASSWORD IMMEDIATELY");
        }
    })();
}

// Helper to hash passwords (e.g. for user creation routes)
export { hashPassword };
