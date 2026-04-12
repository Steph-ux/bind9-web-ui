// Copyright © 2025 Stephane ASSOGBA
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./migrations-pg",
  schema: "./shared/schema-pg.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://bind9admin:bind9admin@localhost:5432/bind9admin",
  },
});
