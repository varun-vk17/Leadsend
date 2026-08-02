import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use DIRECT_URL for migrations (bypasses pgbouncer)
    // The schema.prisma uses DATABASE_URL for runtime queries
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});
