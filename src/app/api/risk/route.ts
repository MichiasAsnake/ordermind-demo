import { NextResponse } from "next/server";
import { computeRisk } from "@/lib/risk-engine";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const summary = computeRisk();
        return NextResponse.json(summary);
    } catch (err) {
        console.error("[/api/risk]", err);
        return NextResponse.json({ error: "Risk engine failed" }, { status: 500 });
    }
}
