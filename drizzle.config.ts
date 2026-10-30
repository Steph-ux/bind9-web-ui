import { defineConfig } from "drizzle-kit";

const dbType = (process.env.DB_TYPE || "sqlite").toLowerCase();

function getConfig() {
  if (dbType === "postgresql") {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for PostgreSQL migrations");
    }
    return {
      out: "./migrations-pg",
      schema: "./shared/schema-pg.ts",
      dialect: "postgresql" as const,
      dbCredentials: {
        url: process.env.DATABASE_URL,
      },
    };
  }

  if (dbType === "mysql") {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for MySQL migrations");
    }
    return {
      out: "./migrations-mysql",
      schema: "./shared/schema-mysql.ts",
      dialect: "mysql" as const,
      dbCredentials: {
        url: process.env.DATABASE_URL,
      },
    };
  }

  return {
    out: "./migrations",
    schema: "./shared/schema.ts",
    dialect: "sqlite" as const,
    dbCredentials: {
      url: process.env.DATABASE_URL || "./data/bind9admin.db",
    },
  };
}

export default defineConfig(getConfig());
