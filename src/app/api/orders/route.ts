import { NextResponse } from "next/server";
import { sqlite } from "@/lib/db";
import { computeRisk } from "@/lib/risk-engine";

export const dynamic = "force-dynamic";

interface OrderRow {
    id: number;
    jobNumber: string;
    customer: string;
    status: string;
    requestedShipDate: string;
    totalDue: number | null;
    isLate: number;
    daysInProduction: number;
    isRush: number;
    hasProof: number;
}

export async function GET() {
    try {
        // Get the set of flagged order IDs from the risk engine
        const risk = computeRisk();
        const flaggedIds = new Set(risk.issues.map(i => i.orderId));

        const rows = sqlite.prepare(`
            SELECT
                o.id,
                o.job_number      AS jobNumber,
                c.company         AS customer,
                o.status,
                o.requested_ship_date AS requestedShipDate,
                pr.total_due      AS totalDue,
                COALESCE(m.is_late, 0)              AS isLate,
                COALESCE(p.days_in_production, 0)   AS daysInProduction,
                COALESCE(w.is_rush, 0)              AS isRush,
                COALESCE(w.has_proof, 0)            AS hasProof
            FROM orders o
            JOIN customers c ON c.id = o.customer_id
            LEFT JOIN order_pricing pr ON pr.order_id = o.id
            LEFT JOIN order_metadata m ON m.order_id = o.id
            LEFT JOIN order_production p ON p.order_id = o.id
            LEFT JOIN order_workflow w ON w.order_id = o.id
            WHERE o.is_completed = 0
            ORDER BY o.requested_ship_date ASC
        `).all() as OrderRow[];

        const reasonsMap = new Map<number, string[]>();
        for (const issue of risk.issues) {
            reasonsMap.set(issue.orderId, issue.reasons);
        }

        const orders = rows.map(r => {
            let health: "needs_attention" | "at_risk" | "on_track";
            if (flaggedIds.has(r.id)) {
                health = "needs_attention";
            } else if (r.isLate || r.daysInProduction > 7 || (r.isRush && !r.hasProof)) {
                health = "at_risk";
            } else {
                health = "on_track";
            }
            return {
                id: r.id,
                jobNumber: r.jobNumber,
                customer: r.customer,
                status: r.status,
                requestedShipDate: r.requestedShipDate,
                value: r.totalDue ?? 0,
                health,
                reasons: reasonsMap.get(r.id) ?? [],
            };
        });

        const summary = {
            total: orders.length,
            onTrack: orders.filter(o => o.health === "on_track").length,
            atRisk: orders.filter(o => o.health === "at_risk").length,
            needsAttention: orders.filter(o => o.health === "needs_attention").length,
        };

        return NextResponse.json({ summary, orders });
    } catch (err) {
        console.error("[/api/orders]", err);
        return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
    }
}
