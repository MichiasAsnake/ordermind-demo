import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const DB_PATH = path.join(process.cwd(), "ordermind.db");

// Singleton pattern — reuse across hot-reloads in dev
const globalForDb = globalThis as unknown as {
    sqlite: ReturnType<typeof Database> | undefined;
};

const sqlite = globalForDb.sqlite ?? new Database(DB_PATH);

if (process.env.NODE_ENV !== "production") {
    globalForDb.sqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;

// Raw sqlite instance — used by risk engine for prepared statements
export { sqlite };
