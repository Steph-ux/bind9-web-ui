// Copyright © 2025 Stephane ASSOGBA
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./migrations-mysql",
  schema: "./shared/schema-mysql.ts",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "mysql://bind9admin:bind9admin@localhost:3306/bind9admin",
  },
});
