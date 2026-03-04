/**
 * Synapto Risk Logic Engine
 *
 * 5-tier prioritized risk detection for the demo dashboard.
 * Each order is evaluated against all tiers and assigned a priority level.
 */

import { sqlite } from "./db";


export type RiskPriority = "critical" | "high" | "medium" | "low";

export interface RiskIssue {
    orderId: number;
    jobNumber: string;
    orderNumber: string;
    customer: string;
    customerPriority: string;
    value: number;         // total_due
    status: string;
    requestedShipDate: string;
    daysInProduction: number;
    comment: string | null;
    reasons: string[];
    priority: RiskPriority;
}

export interface RiskSummary {
    totalIssues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    issues: RiskIssue[];
}

// ─── Raw query row type ───────────────────────────────────────────────────────

interface OrderRow {
    orderId: number;
    jobNumber: string;
    orderNumber: string;
    customer: string;
    customerPriority: string;
    status: string;
    priority: string;
    comment: string | null;
    requestedShipDate: string;
    isRush: number;
    hasProof: number;
    hasJobFiles: number;
    daysInProduction: number;
    isLate: number;
    totalDue: number;
}

// ─── Fetch all open orders with relevant joined fields ────────────────────────

function fetchOpenOrders(): OrderRow[] {
    const rows = sqlite
        .prepare(
            `SELECT
                o.id              AS orderId,
                o.job_number      AS jobNumber,
                o.order_number    AS orderNumber,
                c.company         AS customer,
                c.customer_priority AS customerPriority,
                o.status,
                o.priority,
                o.comment,
                o.requested_ship_date AS requestedShipDate,
                w.is_rush         AS isRush,
                w.has_proof       AS hasProof,
                w.has_job_files   AS hasJobFiles,
                p.days_in_production AS daysInProduction,
                m.is_late         AS isLate,
                pr.total_due      AS totalDue
            FROM orders o
            JOIN customers c        ON c.id = o.customer_id
            LEFT JOIN order_workflow w  ON w.order_id = o.id
            LEFT JOIN order_production p ON p.order_id = o.id
            LEFT JOIN order_metadata m  ON m.order_id = o.id
            LEFT JOIN order_pricing pr  ON pr.order_id = o.id
            WHERE o.is_completed = 0
            ORDER BY o.id`
        )
        .all() as OrderRow[];
    return rows;
}

// ─── Priority mapping ─────────────────────────────────────────────────────────

const TIER_PRIORITY: Record<number, RiskPriority> = {
    1: "critical",
    2: "critical",
    3: "high",
    4: "high",
    5: "medium",
};

// ─── Core engine ──────────────────────────────────────────────────────────────

export function computeRisk(): RiskSummary {
    const orders = fetchOpenOrders();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const issues: RiskIssue[] = [];

    for (const row of orders) {
        const reasons: string[] = [];
        const tiers: number[] = [];

        const isVIP = row.customerPriority === "VIP";
        const isLate = Boolean(row.isLate);
        const isRush = Boolean(row.isRush);
        const hasProof = Boolean(row.hasProof);
        const hasJobFiles = Boolean(row.hasJobFiles);
        const isLargeOrder = row.totalDue >= 5000;
        const dip = row.daysInProduction ?? 0;

        // Due-date math
        const shipDate = new Date(row.requestedShipDate + "T00:00:00");
        const msPerDay = 1000 * 60 * 60 * 24;
        const daysUntilDue = Math.round((shipDate.getTime() - today.getTime()) / msPerDay);

        // ── Tier 1: VIP + Late ─────────────────────────────────────────────
        if (isVIP && isLate) {
            tiers.push(1);
            reasons.push("vip_late");
        }

        // ── Tier 2: Large Order + Late ─────────────────────────────────────
        if (isLargeOrder && isLate) {
            tiers.push(2);
            reasons.push("large_order_late");
        }

        // ── Tier 3: Rush + No Proof ────────────────────────────────────────
        if (isRush && !hasProof) {
            tiers.push(3);
            reasons.push("rush_no_proof");
        }

        // ── Tier 4: Due within 48h + Missing Requirements ──────────────────
        if (daysUntilDue >= 0 && daysUntilDue <= 2 && (!hasProof || !hasJobFiles)) {
            tiers.push(4);
            if (!hasProof) reasons.push("due_soon_no_proof");
            if (!hasJobFiles) reasons.push("due_soon_no_files");
        }

        // ── Tier 5: Days in Production > 7 ────────────────────────────────
        if (dip > 7) {
            tiers.push(5);
            reasons.push(`stalled_${dip}_days`);
        }

        if (tiers.length === 0) continue; // no risk

        const highestTier = Math.min(...tiers);
        const priority = TIER_PRIORITY[highestTier];

        issues.push({
            orderId: row.orderId,
            jobNumber: row.jobNumber,
            orderNumber: row.orderNumber,
            customer: row.customer,
            customerPriority: row.customerPriority,
            value: row.totalDue,
            status: row.status,
            requestedShipDate: row.requestedShipDate,
            daysInProduction: dip,
            comment: row.comment,
            reasons,
            priority,
        });
    }

    // Sort: critical first, then highest value
    const ORDER: Record<RiskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    issues.sort((a, b) => {
        const pd = ORDER[a.priority] - ORDER[b.priority];
        return pd !== 0 ? pd : b.value - a.value;
    });

    const count = (p: RiskPriority) => issues.filter(i => i.priority === p).length;

    return {
        totalIssues: issues.length,
        critical: count("critical"),
        high: count("high"),
        medium: count("medium"),
        low: count("low"),
        issues,
    };
}
