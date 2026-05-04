// Copyright © 2025 Stephane ASSOGBA
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for MySQL migrations");
}

export default defineConfig({
  out: "./migrations-mysql",
  schema: "./shared/schema-mysql.ts",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
