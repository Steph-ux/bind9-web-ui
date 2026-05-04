// Copyright © 2025 Stephane ASSOGBA
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for PostgreSQL migrations");
}

export default defineConfig({
  out: "./migrations-pg",
  schema: "./shared/schema-pg.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
