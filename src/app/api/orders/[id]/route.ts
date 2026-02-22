import { NextRequest, NextResponse } from "next/server";
import { sqlite } from "@/lib/db";
import { computeRisk } from "@/lib/risk-engine";

export const dynamic = "force-dynamic";

interface OrderDetailRow {
    id: number;
    jobNumber: string;
    orderNumber: string;
    status: string;
    priority: string;
    description: string | null;
    comment: string | null;
    dateEntered: string;
    requestedShipDate: string;
    approvedBy: string | null;
    approvedDate: string | null;
    // customer
    company: string;
    contactPerson: string;
    customerPriority: string;
    lifetimeValue: number;
    // pricing
    subtotal: number | null;
    totalDue: number | null;
    // workflow
    hasJobFiles: number;
    hasProof: number;
    isRush: number;
    hasPackingSlip: number;
    // production
    daysInProduction: number;
    estimatedCompletionDate: string | null;
    productionNotes: string | null;
    // metadata
    isLate: number;
    complexity: string | null;
    lastUpdated: string;
}

interface LineItemRow {
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    status: string | null;
    comment: string | null;
    category: string | null;
}

function buildAISummary(order: OrderDetailRow, reasons: string[]): { bullets: string[]; actions: string[] } {
    const bullets: string[] = [];
    const actions: string[] = [];

    const today = new Date("2026-02-22");
    const shipDate = new Date(order.requestedShipDate);
    const daysUntilShip = Math.ceil((shipDate.getTime() - today.getTime()) / 86400000);
    const overdueDays = daysUntilShip < 0 ? Math.abs(daysUntilShip) : 0;

    // Explain each risk reason in plain English
    if (reasons.includes("vip_late")) {
        bullets.push(`VIP account (${order.company}) — order is past the ship date by ${overdueDays} day${overdueDays !== 1 ? "s" : ""}`);
        actions.push(`Contact ${order.contactPerson} at ${order.company} to communicate status immediately`);
    }
    if (reasons.includes("large_order_late")) {
        bullets.push(`High-value order ($${(order.totalDue ?? 0).toLocaleString()}) is ${overdueDays} day${overdueDays !== 1 ? "s" : ""} past the ship date`);
        actions.push("Prioritize in production queue to minimize financial and relationship risk");
    }
    if (reasons.includes("rush_no_proof")) {
        bullets.push("Marked as rush, but proof has not been sent or approved");
        actions.push("Send proof to customer immediately — production cannot safely start without approval");
    }
    if (reasons.some(r => r.startsWith("stalled_"))) {
        bullets.push(`Order has been in production for ${order.daysInProduction} days with no completion date set`);
        actions.push("Check with production floor for bottleneck — escalate if capacity is the issue");
    }
    if (reasons.includes("due_soon_no_proof")) {
        bullets.push(`Ship date is ${Math.abs(daysUntilShip)} day${Math.abs(daysUntilShip) !== 1 ? "s" : ""} away and the proof has not been approved`);
        actions.push("Expedite proof review or adjust ship date with customer agreement");
    }
    if (reasons.includes("due_soon_no_files")) {
        bullets.push(`Ship date is ${Math.abs(daysUntilShip)} day${Math.abs(daysUntilShip) !== 1 ? "s" : ""} away and job files have not been received`);
        actions.push("Follow up with customer for print-ready files before production can begin");
    }

    if (overdueDays > 0 && bullets.length === 0) {
        bullets.push(`Order is ${overdueDays} day${overdueDays !== 1 ? "s" : ""} past the requested ship date`);
        actions.push("Contact customer and coordinate revised delivery timeline");
    }

    // Estimated completion context
    if (order.estimatedCompletionDate) {
        const estDate = new Date(order.estimatedCompletionDate);
        const lateByDays = Math.ceil((estDate.getTime() - shipDate.getTime()) / 86400000);
        if (lateByDays > 0) {
            bullets.push(`Current estimated completion is ${order.estimatedCompletionDate} — ${lateByDays} day${lateByDays !== 1 ? "s" : ""} after ship target`);
        }
    }

    if (bullets.length === 0) bullets.push("Order has been flagged based on combined risk factors");
    if (actions.length === 0) actions.push("Review order status with production team");

    return { bullets, actions };
}

function buildTimeline(order: OrderDetailRow) {
    const today = new Date("2026-02-22");
    const shipDate = new Date(order.requestedShipDate);
    const entered = new Date(order.dateEntered);

    const events: { label: string; date: string; status: "done" | "late" | "pending" | "warning" }[] = [];

    // Order created
    events.push({ label: "Order Created", date: order.dateEntered.split("T")[0], status: "done" });

    // Files received
    if (order.hasJobFiles) {
        const filesDate = new Date(entered);
        filesDate.setDate(filesDate.getDate() + 1);
        events.push({ label: "Job Files Received", date: filesDate.toISOString().split("T")[0], status: "done" });
    } else {
        events.push({ label: "Job Files", date: "Pending", status: "warning" });
    }

    // Proof
    if (order.hasProof) {
        const proofSentDate = new Date(entered);
        proofSentDate.setDate(proofSentDate.getDate() + 1);
        const proofApprDate = new Date(entered);
        const turnaround = order.approvedDate ? Math.ceil((new Date(order.approvedDate).getTime() - entered.getTime()) / 86400000) : 3;
        proofApprDate.setDate(proofApprDate.getDate() + turnaround);
        const isProofLate = turnaround > 2;
        events.push({ label: "Proof Sent", date: proofSentDate.toISOString().split("T")[0], status: "done" });
        events.push({ label: `Proof Approved${isProofLate ? ` (+${turnaround - 1}d delay)` : ""}`, date: proofApprDate.toISOString().split("T")[0], status: isProofLate ? "late" : "done" });
    } else if (order.isRush) {
        events.push({ label: "Proof", date: "Not sent — Rush order!", status: "warning" });
    } else {
        events.push({ label: "Proof", date: "Pending", status: "pending" });
    }

    // Production started
    if (order.daysInProduction > 0) {
        const prodStart = new Date(today);
        prodStart.setDate(prodStart.getDate() - order.daysInProduction);
        const isStalled = order.daysInProduction > 7;
        events.push({ label: `Production Started${isStalled ? ` (${order.daysInProduction}d, stalled)` : ""}`, date: prodStart.toISOString().split("T")[0], status: isStalled ? "late" : "done" });
    } else {
        events.push({ label: "Production", date: "Not started", status: "pending" });
    }

    // Ship date
    const isOverdue = shipDate < today;
    events.push({
        label: `${isOverdue ? "Ship Target (MISSED)" : "Ship Target"}`,
        date: order.requestedShipDate,
        status: isOverdue ? "late" : shipDate.getTime() - today.getTime() < 2 * 86400000 ? "warning" : "pending"
    });

    return events;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const orderId = parseInt(id);
        if (isNaN(orderId)) return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });

        const row = sqlite.prepare(`
            SELECT
                o.id, o.job_number AS jobNumber, o.order_number AS orderNumber,
                o.status, o.priority, o.description, o.comment,
                o.date_entered AS dateEntered, o.requested_ship_date AS requestedShipDate,
                o.approved_by AS approvedBy, o.approved_date AS approvedDate,
                c.company, c.contact_person AS contactPerson,
                c.customer_priority AS customerPriority, c.lifetime_value AS lifetimeValue,
                pr.subtotal, pr.total_due AS totalDue,
                COALESCE(w.has_job_files, 0) AS hasJobFiles,
                COALESCE(w.has_proof, 0) AS hasProof,
                COALESCE(w.is_rush, 0) AS isRush,
                COALESCE(w.has_packing_slip, 0) AS hasPackingSlip,
                COALESCE(p.days_in_production, 0) AS daysInProduction,
                p.estimated_completion_date AS estimatedCompletionDate,
                p.production_notes AS productionNotes,
                COALESCE(m.is_late, 0) AS isLate,
                m.complexity, m.last_updated AS lastUpdated
            FROM orders o
            JOIN customers c ON c.id = o.customer_id
            LEFT JOIN order_pricing pr ON pr.order_id = o.id
            LEFT JOIN order_workflow w ON w.order_id = o.id
            LEFT JOIN order_production p ON p.order_id = o.id
            LEFT JOIN order_metadata m ON m.order_id = o.id
            WHERE o.id = ?
        `).get(orderId) as OrderDetailRow | undefined;

        if (!row) return NextResponse.json({ error: "Order not found" }, { status: 404 });

        const lineItems = sqlite.prepare(`
            SELECT description, quantity, unit_price AS unitPrice,
                   total_price AS totalPrice, status, comment, category
            FROM line_items WHERE order_id = ? ORDER BY id
        `).all(orderId) as LineItemRow[];

        // Get risk info for this order
        const risk = computeRisk();
        const riskIssue = risk.issues.find(i => i.orderId === orderId);
        const reasons = riskIssue?.reasons ?? [];
        const priority = riskIssue?.priority ?? null;

        const aiSummary = buildAISummary(row, reasons);
        const timeline = buildTimeline(row);

        const today = new Date("2026-02-22");
        const shipDate = new Date(row.requestedShipDate);
        const daysUntilShip = Math.ceil((shipDate.getTime() - today.getTime()) / 86400000);

        return NextResponse.json({
            order: {
                id: row.id,
                jobNumber: row.jobNumber,
                orderNumber: row.orderNumber,
                status: row.status,
                priority: row.priority,
                description: row.description,
                comment: row.comment,
                dateEntered: row.dateEntered.split("T")[0],
                requestedShipDate: row.requestedShipDate,
                approvedDate: row.approvedDate,
                isLate: !!row.isLate,
                daysUntilShip,
            },
            customer: {
                company: row.company,
                contactPerson: row.contactPerson,
                priority: row.customerPriority,
                lifetimeValue: row.lifetimeValue,
            },
            pricing: {
                subtotal: row.subtotal ?? 0,
                totalDue: row.totalDue ?? 0,
            },
            workflow: {
                hasJobFiles: !!row.hasJobFiles,
                hasProof: !!row.hasProof,
                isRush: !!row.isRush,
                hasPackingSlip: !!row.hasPackingSlip,
            },
            production: {
                daysInProduction: row.daysInProduction,
                estimatedCompletionDate: row.estimatedCompletionDate,
                productionNotes: row.productionNotes,
                complexity: row.complexity,
            },
            risk: {
                priority,
                reasons,
                isHealthy: reasons.length === 0,
            },
            aiSummary,
            timeline,
            lineItems,
        });
    } catch (err) {
        console.error("[/api/orders/[id]]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
