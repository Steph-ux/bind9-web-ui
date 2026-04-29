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
