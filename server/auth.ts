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

export function setupAuth(app: Express) {
    const sessionSettings: session.SessionOptions = {
        secret: process.env.SESSION_SECRET || "bind9_secret_key_change_me",
        resave: false,
        saveUninitialized: false,
        store: undefined,
        cookie: {
            secure: app.get("env") === "production",
            httpOnly: true,
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
        passport.authenticate("local", (err: any, user: any, info: any) => {
            if (err) return next(err);
            if (!user) {
                return res.status(401).json({ message: "Invalid credentials" });
            }
            req.login(user, (err) => {
                if (err) return next(err);
                const { password, ...userWithoutPassword } = user;
                return res.json(userWithoutPassword);
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
            });
            console.log("[auth] Default admin user created (admin/admin)");
        }
    })();
}

// Helper to hash passwords (e.g. for user creation routes)
export { hashPassword };
