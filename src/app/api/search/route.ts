import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { parseSearchQuery, runDeterministicSearch, SearchResult } from "@/lib/search";

export const dynamic = "force-dynamic";

function buildSummary(results: SearchResult[]) {
    const critical = results.filter((r) => r.score >= 0.8).length;
    const highValue = results.filter((r) => r.value >= 5000).length;

    return {
        total: results.length,
        critical,
        highValue,
    };
}

async function generateAiSummary(results: SearchResult[], query: string): Promise<string | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || results.length === 0) return null;

    try {
        const openai = new OpenAI({ apiKey });

        // Only pass top-10 results to the LLM — keep tokens minimal
        const top10 = results.slice(0, 10);
        const orderLines = top10.map((r, i) =>
            `${i + 1}. Job ${r.jobNumber} | ${r.customer} | ${r.status} | Ship: ${r.requestedShipDate} | $${r.value.toFixed(0)} | Signals: ${r.reasons.join(", ") || "none"} | Score: ${r.score.toFixed(2)}`
        ).join("\n");

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.3,
            max_tokens: 280,
            messages: [
                {
                    role: "system",
                    content: `You are an operations intelligence assistant for a print shop. Given a list of up to 10 flagged orders, produce a SHORT 3–4 bullet-point summary for an ops manager. Focus on: key patterns, immediate risks, and one concrete recommended action. Be direct and specific. No fluff. Format as plain text bullet points starting with "•".`,
                },
                {
                    role: "user",
                    content: `Search query: "${query}"\n\nTop matching orders:\n${orderLines}\n\nProvide a concise ops summary.`,
                },
            ],
        });

        return completion.choices[0]?.message?.content?.trim() ?? null;
    } catch {
        return null;
    }
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

        // AI summary from top-10 results only (non-blocking, best-effort)
        const aiSummary = await generateAiSummary(results, query);

        return NextResponse.json({
            query,
            parser,
            parsed: filters,
            summary,
            results,
            explanation,
            aiSummary,
        });
    } catch (err) {
        console.error("[/api/search]", err);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
}
