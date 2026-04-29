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
