import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET() {
    try {
        // Query sqlite_master to list all user-created tables
        const tables = db
            .all<{ name: string }>(
                sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
            )
            .map((r) => r.name);

        return NextResponse.json({
            status: "ok",
            database: "ordermind.db",
            tables,
            tableCount: tables.length,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json(
            { status: "error", message },
            { status: 500 }
        );
    }
}
