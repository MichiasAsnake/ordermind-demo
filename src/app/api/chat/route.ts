import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { computeRisk } from "@/lib/risk-engine";
import { sqlite } from "@/lib/db";

export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface AllOrderRow {
    id: number;
    jobNumber: string;
    customer: string;
    customerPriority: string;
    status: string;
    requestedShipDate: string;
    totalDue: number | null;
    isLate: number;
    isRush: number;
    daysInProduction: number;
}

function buildContext(): string {
    const today = new Date("2026-02-22");
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 7);

    const late = (sqlite.prepare(`SELECT COUNT(*) as n FROM order_metadata WHERE is_late = 1`).get() as { n: number }).n;
    const vip = (sqlite.prepare(`SELECT COUNT(*) as n FROM customers c JOIN orders o ON o.customer_id = c.id WHERE c.customer_priority = 'VIP' AND o.is_completed = 0`).get() as { n: number }).n;
    const rev = (sqlite.prepare(`SELECT SUM(pr.total_due) as total FROM order_pricing pr JOIN orders o ON o.id = pr.order_id WHERE o.is_completed = 0 AND o.date_entered >= ?`).get(weekStart.toISOString().split("T")[0]) as { total: number | null }).total ?? 0;

    // Risk engine — flagged order IDs + reasons
    const risk = computeRisk();
    const flaggedMap = new Map(risk.issues.map(i => [i.orderId, i]));

    // All active orders in compact one-liner format
    const allOrders = sqlite.prepare(`
        SELECT o.id, o.job_number AS jobNumber, c.company AS customer,
               c.customer_priority AS customerPriority, o.status,
               o.requested_ship_date AS requestedShipDate,
               pr.total_due AS totalDue,
               COALESCE(m.is_late, 0) AS isLate,
               COALESCE(w.is_rush, 0) AS isRush,
               COALESCE(p.days_in_production, 0) AS daysInProduction
        FROM orders o
        JOIN customers c ON c.id = o.customer_id
        LEFT JOIN order_pricing pr ON pr.order_id = o.id
        LEFT JOIN order_metadata m ON m.order_id = o.id
        LEFT JOIN order_workflow w ON w.order_id = o.id
        LEFT JOIN order_production p ON p.order_id = o.id
        WHERE o.is_completed = 0
        ORDER BY o.requested_ship_date ASC
    `).all() as AllOrderRow[];

    const orderLines = allOrders.map(o => {
        const issue = flaggedMap.get(o.id);
        let health: string;
        if (issue) {
            health = `🔴 FLAGGED(${issue.priority.toUpperCase()}): ${issue.reasons.join(", ")}`;
        } else if (o.isLate || o.daysInProduction > 7) {
            health = "🟠 AT RISK";
        } else {
            health = "🟢 on track";
        }
        const vipTag = o.customerPriority === "VIP" ? " [VIP]" : "";
        return `- [${o.jobNumber}](/orders/${o.id}) | ${o.customer}${vipTag} | ${o.status} | Ship: ${o.requestedShipDate} | $${(o.totalDue ?? 0).toFixed(0)} | ${health}`;
    }).join("\n");

    return `
TODAY'S SHOP HEALTH SNAPSHOT (Feb 22, 2026):
- Late orders: ${late}
- Active VIP orders: ${vip}
- Revenue this week (open orders): $${rev.toFixed(0)}
- Total risk flags: ${risk.totalIssues} (${risk.critical} critical, ${risk.high} high, ${risk.medium} medium)

ALL ACTIVE ORDERS (${allOrders.length} total):
${orderLines}

You are OrderMind, an AI operations assistant for a print shop. You have access to the complete active order list above.
Answer the operator's questions directly using this data. Be concise, specific, and action-oriented.
Speak like a smart ops manager, not a chatbot. No fluff. When listing orders for a specific customer, show ALL of their orders and clearly differentiate healthy vs flagged ones.

FORMATTING RULE: Whenever you mention a specific order, ALWAYS use markdown link format: [JB-XXXX](/orders/ID)
For example, write [JB-4809](/orders/9) not just "JB-4809". The ID number comes from the order list above.
Never mention order numbers as plain text — always as clickable links.
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
            max_tokens: 600,
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
