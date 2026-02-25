import { NextRequest, NextResponse } from "next/server";
import { parseSearchQuery, runDeterministicSearch } from "@/lib/search";

export const dynamic = "force-dynamic";

function buildSummary(results: ReturnType<typeof runDeterministicSearch>) {
    const critical = results.filter((r) => r.score >= 0.8).length;
    const highValue = results.filter((r) => r.value >= 5000).length;

    return {
        total: results.length,
        critical,
        highValue,
    };
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const query = typeof body?.query === "string" ? body.query.trim() : "";

        if (!query) {
            return NextResponse.json({ error: "Query is required" }, { status: 400 });
        }

        const { filters, parser } = await parseSearchQuery(query, process.env.OPENAI_API_KEY);
        const results = runDeterministicSearch(filters);
        const summary = buildSummary(results);

        const explanation = results.length === 0
            ? "No matching active orders. Try broadening terms or removing constraints."
            : `${results.length} matching active orders. Top signals: ${Array.from(new Set(results.flatMap((r) => r.reasons))).slice(0, 3).join(", ") || "general risk"}.`;

        return NextResponse.json({
            query,
            parser,
            parsed: filters,
            summary,
            results,
            explanation,
        });
    } catch (err) {
        console.error("[/api/search]", err);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
}
