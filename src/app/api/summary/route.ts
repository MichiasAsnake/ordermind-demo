import { NextResponse } from "next/server";
import { sqlite } from "@/lib/db";

export const dynamic = "force-dynamic";

interface CountRow { count: number }
interface SumRow { total: number | null }
interface BottleneckRow { reasons: string; cnt: number }

export async function GET() {
    try {
        const today = new Date("2026-02-22");
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 7);
        const weekStartStr = weekStart.toISOString().split("T")[0];
        const todayStr = today.toISOString().split("T")[0];

        // Late open orders
        const lateOrders = (sqlite
            .prepare(`SELECT COUNT(*) as count FROM order_metadata WHERE is_late = 1`)
            .get() as CountRow).count;

        // Rush orders entered today or recently (last 2 days)
        const rushCutoff = new Date(today);
        rushCutoff.setDate(today.getDate() - 2);
        const rushCutoffStr = rushCutoff.toISOString();
        const rushOrders = (sqlite
            .prepare(`SELECT COUNT(*) as count FROM order_workflow w
                JOIN orders o ON o.id = w.order_id
                WHERE w.is_rush = 1 AND o.is_completed = 0 AND o.date_entered >= ?`)
            .get(rushCutoffStr) as CountRow).count;

        // Active VIP orders
        const vipOrders = (sqlite
            .prepare(`SELECT COUNT(*) as count FROM customers c
                JOIN orders o ON o.customer_id = c.id
                WHERE c.customer_priority = 'VIP' AND o.is_completed = 0`)
            .get() as CountRow).count;

        // Revenue this week (completed orders)
        const revenueRow = sqlite
            .prepare(`SELECT SUM(pr.total_due) as total
                FROM order_pricing pr
                JOIN orders o ON o.id = pr.order_id
                WHERE o.is_completed = 0 AND o.date_entered >= ?`)
            .get(weekStartStr) as SumRow;
        const revenueThisWeek = revenueRow.total ?? 0;

        // Total active (non-completed) orders
        const totalActiveOrders = (sqlite
            .prepare(`SELECT COUNT(*) as count FROM orders WHERE is_completed = 0`)
            .get() as CountRow).count;

        // At-risk count: open orders with any risk tier
        // Simplified: late OR (rush + no proof) OR dip > 7 OR (due in 2d + missing files)
        const atRisk = (sqlite
            .prepare(`SELECT COUNT(DISTINCT o.id) as count
                FROM orders o
                LEFT JOIN order_workflow w ON w.order_id = o.id
                LEFT JOIN order_production p ON p.order_id = o.id
                LEFT JOIN order_metadata m ON m.order_id = o.id
                WHERE o.is_completed = 0 AND (
                    m.is_late = 1
                    OR (w.is_rush = 1 AND w.has_proof = 0)
                    OR (p.days_in_production > 7)
                    OR (o.requested_ship_date <= ? AND (w.has_proof = 0 OR w.has_job_files = 0))
                )`)
            .get(new Date(today.getTime() + 2 * 86400000).toISOString().split("T")[0]) as CountRow).count;

        // Orders due today
        const dueTodayCount = (sqlite
            .prepare(`SELECT COUNT(*) as count FROM orders WHERE is_completed = 0 AND requested_ship_date = ?`)
            .get(todayStr) as CountRow).count;

        // Main bottleneck (most common risk reason by category label)
        // We derive it from computed flags:
        const rushNoProof = (sqlite
            .prepare(`SELECT COUNT(*) as count FROM order_workflow w
                JOIN orders o ON o.id = w.order_id
                WHERE w.is_rush = 1 AND w.has_proof = 0 AND o.is_completed = 0`)
            .get() as CountRow).count;
        const lateVIP = (sqlite
            .prepare(`SELECT COUNT(*) as count FROM order_metadata m
                JOIN orders o ON o.id = m.order_id
                JOIN customers c ON c.id = o.customer_id
                WHERE m.is_late = 1 AND c.customer_priority = 'VIP' AND o.is_completed = 0`)
            .get() as CountRow).count;
        const stalledProd = (sqlite
            .prepare(`SELECT COUNT(*) as count FROM order_production p
                JOIN orders o ON o.id = p.order_id
                WHERE p.days_in_production > 7 AND o.is_completed = 0`)
            .get() as CountRow).count;

        const bottlenecks = [
            { label: `Missing proofs (${rushNoProof} rush orders)`, count: rushNoProof },
            { label: `VIP orders late (${lateVIP} accounts)`, count: lateVIP },
            { label: `Stalled production (${stalledProd} orders > 7 days)`, count: stalledProd },
        ].sort((a, b) => b.count - a.count);

        const mainBottleneck = bottlenecks[0].label;

        return NextResponse.json({
            date: todayStr,
            totalActiveOrders,
            onTrackOrders: totalActiveOrders - atRisk,
            lateOrders,
            atRisk,
            rushOrdersRecent: rushOrders,
            vipOrdersActive: vipOrders,
            revenueThisWeek: parseFloat(revenueThisWeek.toFixed(2)),
            dueToday: dueTodayCount,
            mainBottleneck,
            bottlenecks,
        });
    } catch (err) {
        console.error("[/api/summary]", err);
        return NextResponse.json({ error: "Summary failed" }, { status: 500 });
    }
}
