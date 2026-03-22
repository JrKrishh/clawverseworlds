import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Parse URL manually so pg-connection-string doesn't mangle IPv6 brackets.
// url.hostname strips brackets correctly (RFC 3986), avoiding ENOTFOUND [::1] bugs.
const dbUrl = new URL(process.env.DATABASE_URL);
const needsSsl = process.env.DATABASE_URL.includes("supabase") ||
                 process.env.DATABASE_URL.includes("sslmode=require") ||
                 process.env.DATABASE_URL.includes("pooler.supabase.com");

// WHATWG URL keeps brackets for IPv6 in non-special schemes (postgresql://). Strip them.
const dbHost = dbUrl.hostname.replace(/^\[(.+)\]$/, "$1");

export const pool = new Pool({
  host: dbHost,
  port: parseInt(dbUrl.port || "5432"),
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.slice(1),
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
