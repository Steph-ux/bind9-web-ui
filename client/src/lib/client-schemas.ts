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

const bindIdentifierSchema = z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(128, "Name is too long")
    .regex(/^[a-zA-Z0-9._-]+$/, "Name contains invalid characters");

const aclNetworksSchema = z
    .string()
    .trim()
    .min(1, "At least one network is required")
    .max(4096, "Network list is too long")
    .refine((value) => !/["'{}]/.test(value), "Networks contain unsupported characters");

export const aclFormSchema = z.object({
    name: bindIdentifierSchema,
    networks: aclNetworksSchema,
    comment: z.string().trim().max(255, "Comment is too long"),
});

export type AclFormValues = z.infer<typeof aclFormSchema>;

export function validateAclForm(values: AclFormValues) {
    return aclFormSchema.safeParse(values);
}

export const tsigKeyFormSchema = z.object({
    name: bindIdentifierSchema,
    algorithm: z.enum(["hmac-sha256", "hmac-sha512", "hmac-md5"]),
    secret: z
        .string()
        .trim()
        .min(1, "Secret is required")
        .max(4096, "Secret is too long"),
});

export type TsigKeyFormValues = z.infer<typeof tsigKeyFormSchema>;

export function validateTsigKeyForm(values: TsigKeyFormValues) {
    return tsigKeyFormSchema.safeParse(values);
}

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

const zoneDomainSchema = z
    .string()
    .trim()
    .min(1, "Domain is required")
    .max(255, "Domain is too long")
    .regex(/^[a-zA-Z0-9.-]+\.?$/, "Domain contains invalid characters");

const zoneAdminSchema = z
    .string()
    .trim()
    .max(255, "Admin email is too long")
    .refine((value) => value === "" || /^[a-zA-Z0-9.-]+$/.test(value), "Admin email must use the BIND host-style format");

const zoneServerListSchema = z.string().trim().max(2048, "Server list is too long");
const zoneTypeSchema = z.enum(["master", "slave", "forward"]);
const zoneNetworkSchema = z.string().trim().max(64, "Network is too long");

function parseZoneServerList(value: string) {
    return value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function isValidZoneServer(value: string) {
    const ipv4 = value.match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/);
    if (ipv4) {
        return value.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
    }
    return /^[a-fA-F0-9:]+$/.test(value);
}

function isSupportedReverseCidr(value: string) {
    const match = value.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
    if (!match) {
        return false;
    }

    const octets = match[1].split(".").map((part) => Number(part));
    const prefix = Number(match[2]);

    if (octets.some((part) => part < 0 || part > 255)) {
        return false;
    }

    return [8, 16, 24].includes(prefix);
}

export const zoneCreateFormSchema = z.object({
    domain: zoneDomainSchema,
    zoneType: zoneTypeSchema,
    adminEmail: zoneAdminSchema,
    masterServers: zoneServerListSchema,
    forwarders: zoneServerListSchema,
    autoReverse: z.boolean(),
    network: zoneNetworkSchema,
}).superRefine((form, ctx) => {
    if (form.zoneType === "slave") {
        const servers = parseZoneServerList(form.masterServers);
        if (servers.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["masterServers"],
                message: "Slave zones require at least one master server",
            });
        } else if (servers.some((server) => !isValidZoneServer(server))) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["masterServers"],
                message: "Use only IPv4 or IPv6 addresses in the master list",
            });
        }
    }

    if (form.zoneType === "forward") {
        const servers = parseZoneServerList(form.forwarders);
        if (servers.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["forwarders"],
                message: "Forward zones require at least one forwarder",
            });
        } else if (servers.some((server) => !isValidZoneServer(server))) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["forwarders"],
                message: "Use only IPv4 or IPv6 addresses in the forwarder list",
            });
        }
    }

    if (form.zoneType === "master" && form.autoReverse) {
        if (!form.network.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["network"],
                message: "Network is required when auto-reverse is enabled",
            });
        } else if (!isSupportedReverseCidr(form.network)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["network"],
                message: "Use a valid IPv4 CIDR with /8, /16 or /24",
            });
        }
    }
});

export type ZoneCreateFormValues = z.infer<typeof zoneCreateFormSchema>;

export function validateZoneCreateForm(values: ZoneCreateFormValues) {
    return zoneCreateFormSchema.safeParse(values);
}

export const recordFormTypeOptions = [
    "A",
    "AAAA",
    "CNAME",
    "MX",
    "TXT",
    "NS",
    "PTR",
    "SRV",
    "CAA",
    "TLSA",
    "DS",
    "DNSKEY",
] as const;

export const recordPriorityTypes = ["MX", "SRV"] as const;

const recordNameSchema = z
    .string()
    .trim()
    .min(1, "Record name is required")
    .max(255, "Record name is too long")
    .regex(/^[a-zA-Z0-9*_.@-]+$/, "Record name contains invalid characters");

const recordValueSchema = z
    .string()
    .trim()
    .min(1, "Record value is required")
    .max(4096, "Record value is too long");

const recordTtlSchema = z
    .string()
    .trim()
    .min(1, "TTL is required")
    .refine((value) => /^\d+$/.test(value), "TTL must be a number")
    .refine((value) => Number.parseInt(value, 10) >= 1, "TTL must be at least 1");

const recordPrioritySchema = z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d+$/.test(value), "Priority must be a number")
    .refine((value) => value === "" || Number.parseInt(value, 10) >= 0, "Priority cannot be negative");

export const recordFormSchema = z.object({
    name: recordNameSchema,
    type: z.enum(recordFormTypeOptions),
    value: recordValueSchema,
    ttl: recordTtlSchema,
    priority: recordPrioritySchema,
}).superRefine((form, ctx) => {
    if (recordPriorityTypes.includes(form.type as (typeof recordPriorityTypes)[number]) && !form.priority.trim()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["priority"],
            message: "Priority is required for MX and SRV records",
        });
    }
});

export type RecordFormValues = z.infer<typeof recordFormSchema>;

export function validateRecordForm(values: RecordFormValues) {
    return recordFormSchema.safeParse(values);
}

const apiTokenPermissionsSchema = z
    .string()
    .trim()
    .min(1, "Permission scope is required")
    .max(1024, "Permission scope is too long")
    .refine(
        (value) => value === "*" || /^[a-zA-Z0-9:/*,._-]+(?:\s*,\s*[a-zA-Z0-9:/*,._-]+)*$/.test(value),
        "Use * or comma-separated API scopes",
    );

export const apiTokenFormSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "Token name is required")
        .max(64, "Token name is too long"),
    permissions: apiTokenPermissionsSchema,
    expiresAt: z.string().trim().max(64, "Expiry value is too long"),
}).superRefine((form, ctx) => {
    if (!form.expiresAt.trim()) {
        return;
    }

    const timestamp = Date.parse(form.expiresAt);
    if (Number.isNaN(timestamp)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["expiresAt"],
            message: "Expiry must be a valid date and time",
        });
        return;
    }

    if (timestamp <= Date.now()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["expiresAt"],
            message: "Expiry must be in the future",
        });
    }
});

export type ApiTokenFormValues = z.infer<typeof apiTokenFormSchema>;

export function validateApiTokenForm(values: ApiTokenFormValues) {
    return apiTokenFormSchema.safeParse(values);
}

export const blacklistBanFormSchema = z.object({
    ip: z
        .string()
        .trim()
        .min(1, "IP address is required")
        .max(64, "IP address is too long")
        .regex(/^[0-9a-f.:]+$/i, "Use a valid IPv4 or IPv6 address"),
    reason: z.enum(["manual", "api_abuse", "brute_force"]),
    durationMinutes: z
        .string()
        .trim()
        .max(16, "Duration is too long")
        .refine((value) => value === "" || /^\d+$/.test(value), "Duration must be a whole number")
        .refine((value) => value === "" || Number.parseInt(value, 10) > 0, "Duration must be greater than 0")
        .refine((value) => value === "" || Number.parseInt(value, 10) <= 525600, "Duration cannot exceed 525600 minutes"),
});

export type BlacklistBanFormValues = z.infer<typeof blacklistBanFormSchema>;

export function validateBlacklistBanForm(values: BlacklistBanFormValues) {
    return blacklistBanFormSchema.safeParse(values);
}

export const ownPasswordChangeSchema = z.object({
    currentPassword: z.string().max(4096, "Current password is too long"),
    newPassword: z
        .string()
        .min(8, "New password must be at least 8 characters")
        .max(4096, "New password is too long"),
    confirmPassword: z
        .string()
        .min(1, "Confirm password is required")
        .max(4096, "Confirmation is too long"),
}).superRefine((form, ctx) => {
    if (form.newPassword !== form.confirmPassword) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["confirmPassword"],
            message: "Passwords do not match",
        });
    }
});

export type OwnPasswordChangeValues = z.infer<typeof ownPasswordChangeSchema>;

export function validateOwnPasswordChange(
    values: OwnPasswordChangeValues,
    options: { requireCurrentPassword?: boolean } = {},
) {
    return ownPasswordChangeSchema.superRefine((form, ctx) => {
        if (options.requireCurrentPassword && !form.currentPassword.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["currentPassword"],
                message: "Current password is required",
            });
        }
    }).safeParse(values);
}
