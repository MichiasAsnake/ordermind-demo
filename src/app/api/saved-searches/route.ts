import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const STORE_PATH = path.join(process.cwd(), "saved-searches.json");

interface SavedSearch {
    id: string;
    name: string;
    query: string;
    createdAt: string;
}

function readStore(): SavedSearch[] {
    try {
        if (!fs.existsSync(STORE_PATH)) return [];
        const raw = fs.readFileSync(STORE_PATH, "utf-8");
        return JSON.parse(raw) as SavedSearch[];
    } catch {
        return [];
    }
}

function writeStore(data: SavedSearch[]) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export async function GET() {
    return NextResponse.json(readStore());
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const query = typeof body?.query === "string" ? body.query.trim() : "";

    if (!name || !query) {
        return NextResponse.json({ error: "name and query are required" }, { status: 400 });
    }

    const saved: SavedSearch = {
        id: randomUUID(),
        name,
        query,
        createdAt: new Date().toISOString(),
    };

    const store = readStore();
    store.push(saved);
    writeStore(store);

    return NextResponse.json(saved, { status: 201 });
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const store = readStore().filter(s => s.id !== id);
    writeStore(store);

    return NextResponse.json({ ok: true });
}
