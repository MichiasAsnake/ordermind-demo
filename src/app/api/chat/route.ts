import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { computeRisk } from "@/lib/risk-engine";
import { sqlite } from "@/lib/db";

export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface SummaryRow {
    lateOrders: number;
    atRisk: number;
    rushOrders: number;
    vipActive: number;
    revenue: number | null;
    mainBottleneck: string | null;
}

function buildContext(): string {
    // Live summary stats
    const today = new Date("2026-02-22");
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 7);

    const late = (sqlite.prepare(`SELECT COUNT(*) as lateOrders FROM order_metadata WHERE is_late = 1`).get() as { lateOrders: number }).lateOrders;
    const atRisk = (sqlite.prepare(`SELECT COUNT(DISTINCT o.id) as atRisk
        FROM orders o
        LEFT JOIN order_workflow w ON w.order_id = o.id
        LEFT JOIN order_production p ON p.order_id = o.id
        LEFT JOIN order_metadata m ON m.order_id = o.id
        WHERE o.is_completed = 0 AND (
            m.is_late = 1 OR (w.is_rush = 1 AND w.has_proof = 0) OR p.days_in_production > 7
        )`).get() as { atRisk: number }).atRisk;
    const vip = (sqlite.prepare(`SELECT COUNT(*) as v FROM customers c JOIN orders o ON o.customer_id = c.id WHERE c.customer_priority = 'VIP' AND o.is_completed = 0`).get() as { v: number }).v;
    const rev = (sqlite.prepare(`SELECT SUM(pr.total_due) as total FROM order_pricing pr JOIN orders o ON o.id = pr.order_id WHERE o.is_completed = 0 AND o.date_entered >= ?`).get(weekStart.toISOString().split("T")[0]) as { total: number | null }).total ?? 0;

    // Top risk issues
    const risk = computeRisk();
    const topIssues = risk.issues.slice(0, 10).map(i =>
        `- ${i.jobNumber} | ${i.customer} (${i.customerPriority}) | $${i.value.toFixed(0)} | ${i.priority.toUpperCase()} | ${i.reasons.join(", ")} | Ship: ${i.requestedShipDate}`
    ).join("\n");

    return `
TODAY'S SHOP HEALTH SNAPSHOT (Feb 22, 2026):
- Late orders: ${late}
- At-risk orders: ${atRisk}
- Active VIP orders: ${vip}
- Revenue this week (open orders): $${rev.toFixed(0)}
- Total risk flags: ${risk.totalIssues} (${risk.critical} critical, ${risk.high} high, ${risk.medium} medium)

TOP FLAGGED ORDERS:
${topIssues}

You are OrderMind, an AI operations assistant for a print shop. You have access to real-time shop data above.
Answer the operator's questions directly using this data. Be concise, specific, and action-oriented.
Speak like a smart ops manager, not a chatbot. No fluff. If asked about an order detail not in context, say you can look it up.
`.trim();
}

export async function POST(req: NextRequest) {
    try {
        const { messages } = await req.json();

        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
        }

        const systemPrompt = buildContext();

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                ...messages,
            ],
            max_tokens: 400,
            temperature: 0.4,
        });

        const reply = completion.choices[0]?.message?.content ?? "No response.";
        return NextResponse.json({ reply });
    } catch (err: unknown) {
        console.error("[/api/chat]", err);
        const msg = err instanceof Error ? err.message : "Chat failed";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
