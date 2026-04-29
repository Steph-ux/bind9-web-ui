import { z } from "zod";

export const managedUserCreateSchema = z.object({
    username: z
        .string()
        .trim()
        .min(2, "Username must be at least 2 characters")
        .max(64, "Username is too long")
        .regex(/^[a-zA-Z0-9._-]+$/, "Username contains invalid characters"),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters"),
    role: z.enum(["admin", "operator", "viewer"]),
});

export type ManagedUserCreateForm = z.infer<typeof managedUserCreateSchema>;

const connectionNameSchema = z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name is too long")
    .regex(/^[a-zA-Z0-9._ -]+$/, "Name contains invalid characters");

const connectionHostSchema = z
    .string()
    .trim()
    .min(1, "Host is required")
    .max(255, "Host is too long")
    .regex(/^[a-zA-Z0-9.:-]+$/, "Host contains invalid characters");

const connectionUsernameSchema = z
    .string()
    .trim()
    .min(1, "Username is required")
    .max(64, "Username is too long")
    .regex(/^[a-zA-Z0-9._-]+$/, "Username contains invalid characters");

const linuxPathSchema = z
    .string()
    .trim()
    .max(255, "Path is too long")
    .refine(
        (value) => value === "" || (/^[a-zA-Z0-9._/-]+$/.test(value) && !value.split("/").includes("..")),
        "Path contains invalid characters",
    );

export const connectionFormSchema = z.object({
    name: connectionNameSchema,
    host: connectionHostSchema,
    port: z
        .string()
        .trim()
        .min(1, "Port is required")
        .refine((value) => /^\d+$/.test(value), "Port must be a number")
        .refine((value) => {
            const port = Number.parseInt(value, 10);
            return port >= 1 && port <= 65535;
        }, "Port must be between 1 and 65535"),
    username: connectionUsernameSchema,
    authType: z.enum(["password", "key"]),
    password: z.string().max(4096, "Password is too long"),
    privateKey: z.string().max(20000, "Private key is too long"),
    bind9ConfDir: linuxPathSchema,
    bind9ZoneDir: linuxPathSchema,
    rndcBin: linuxPathSchema,
});

export type ConnectionFormValues = z.infer<typeof connectionFormSchema>;

type ConnectionValidationOptions = {
    requirePassword?: boolean;
    requirePrivateKey?: boolean;
};

export function validateConnectionForm(
    values: ConnectionFormValues,
    options: ConnectionValidationOptions = {},
) {
    return connectionFormSchema.superRefine((form, ctx) => {
        if (form.authType === "password" && options.requirePassword && !form.password.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["password"],
                message: "Password is required when authType is password",
            });
        }

        if (form.authType === "key" && options.requirePrivateKey && !form.privateKey.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["privateKey"],
                message: "Private key is required when authType is key",
            });
        }
    }).safeParse(values);
}

const replicationRoleSchema = z.enum(["slave", "secondary"]);
const notificationTypeSchema = z.enum(["email", "webhook", "slack"]);
const notificationEventSchema = z.enum([
    "server_down",
    "conflict_detected",
    "health_degraded",
]);
const notificationUrlSchema = z.string().trim().max(2048, "URL is too long");
const notificationEmailSchema = z.string().trim().max(320, "Email address is too long");
const internalHostnamePattern =
    /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|localhost|::1|fe80::|fd[0-9a-f]{2}:|fc[0-9a-f]{2}:|169\.254\.)/i;

export const replicationServerFormSchema = z.object({
    name: connectionNameSchema,
    host: connectionHostSchema,
    port: z
        .string()
        .trim()
        .min(1, "Port is required")
        .refine((value) => /^\d+$/.test(value), "Port must be a number")
        .refine((value) => {
            const port = Number.parseInt(value, 10);
            return port >= 1 && port <= 65535;
        }, "Port must be between 1 and 65535"),
    username: connectionUsernameSchema,
    authType: z.enum(["password", "key"]),
    password: z.string().max(4096, "Password is too long"),
    privateKey: z.string().max(20000, "Private key is too long"),
    bind9ConfDir: linuxPathSchema,
    bind9ZoneDir: linuxPathSchema,
    role: replicationRoleSchema,
});

export type ReplicationServerFormValues = z.infer<typeof replicationServerFormSchema>;

type ReplicationServerValidationOptions = {
    editing?: boolean;
    previousAuthType?: "password" | "key";
};

export function validateReplicationServerForm(
    values: ReplicationServerFormValues,
    options: ReplicationServerValidationOptions = {},
) {
    return replicationServerFormSchema.superRefine((form, ctx) => {
        if (form.authType === "password") {
            const requiresPassword = !options.editing || options.previousAuthType !== "password";
            if (requiresPassword && !form.password.trim()) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["password"],
                    message: options.editing
                        ? "Password cannot be blank when switching to password auth"
                        : "Password is required when authType is password",
                });
            }
        }

        if (form.authType === "key") {
            const requiresPrivateKey = !options.editing || options.previousAuthType !== "key";
            if (requiresPrivateKey && !form.privateKey.trim()) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["privateKey"],
                    message: options.editing
                        ? "Private key cannot be blank when switching to key auth"
                        : "Private key is required when authType is key",
                });
            }
        }
    }).safeParse(values);
}

export const notificationChannelFormSchema = z.object({
    name: connectionNameSchema,
    type: notificationTypeSchema,
    url: notificationUrlSchema,
    email: notificationEmailSchema,
    enabled: z.boolean(),
    events: z.array(notificationEventSchema).min(1, "Select at least one event"),
});

export type NotificationChannelFormValues = z.infer<typeof notificationChannelFormSchema>;

type NotificationChannelValidationOptions = {
    editing?: boolean;
    previousType?: "email" | "webhook" | "slack";
};

export function validateNotificationChannelForm(
    values: NotificationChannelFormValues,
    options: NotificationChannelValidationOptions = {},
) {
    return notificationChannelFormSchema.superRefine((form, ctx) => {
        if (form.type === "email") {
            const requiresEmail =
                !options.editing || options.previousType !== "email" || form.email.trim().length > 0;

            if (requiresEmail && !form.email.trim()) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["email"],
                    message: options.editing
                        ? "Email is required when switching to email or replacing the destination"
                        : "Email address is required",
                });
                return;
            }

            if (form.email.trim() && !z.string().email().safeParse(form.email.trim()).success) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["email"],
                    message: "Email address must be valid",
                });
            }
            return;
        }

        const requiresUrl =
            !options.editing || options.previousType !== form.type || form.url.trim().length > 0;

        if (requiresUrl && !form.url.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["url"],
                message: options.editing
                    ? "A destination URL is required when switching channel type or replacing the endpoint"
                    : "Destination URL is required",
            });
            return;
        }

        if (!form.url.trim()) {
            return;
        }

        try {
            const parsed = new URL(form.url.trim());
            if (!["http:", "https:"].includes(parsed.protocol)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["url"],
                    message: "Only http/https URLs are allowed",
                });
            }
            if (internalHostnamePattern.test(parsed.hostname)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["url"],
                    message: "Private or internal URLs are not allowed",
                });
            }
        } catch {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["url"],
                message: "URL format is invalid",
            });
        }
    }).safeParse(values);
}
