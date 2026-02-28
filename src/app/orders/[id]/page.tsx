"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChatPanel } from "@/components/ChatPanel";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrderDetail {
    order: {
        id: number; jobNumber: string; orderNumber: string;
        status: string; priority: string; description: string | null;
        comment: string | null; dateEntered: string; requestedShipDate: string;
        approvedDate: string | null; isLate: boolean; daysUntilShip: number;
    };
    customer: { company: string; contactPerson: string; priority: string; lifetimeValue: number };
    pricing: { subtotal: number; totalDue: number };
    workflow: { hasJobFiles: boolean; hasProof: boolean; isRush: boolean; hasPackingSlip: boolean };
    production: { daysInProduction: number; estimatedCompletionDate: string | null; productionNotes: string | null; complexity: string | null };
    risk: { priority: string | null; reasons: string[]; isHealthy: boolean };
    aiSummary: { bullets: string[]; actions: string[] };
    timeline: { label: string; date: string; status: "done" | "late" | "pending" | "warning" }[];
    lineItems: { description: string; quantity: number; unitPrice: number; totalPrice: number; status: string | null; comment: string | null; category: string | null }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$$(n: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function HealthPill({ priority, isHealthy }: { priority: string | null; isHealthy: boolean }) {
    if (isHealthy) return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> On Track
        </span>
    );
    const styles: Record<string, string> = {
        critical: "bg-red-50 text-red-700 border-red-200",
        high: "bg-orange-50 text-orange-700 border-orange-200",
        medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
    };
    const dots: Record<string, string> = { critical: "bg-red-500", high: "bg-orange-400", medium: "bg-yellow-400" };
    const p = priority ?? "medium";
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold border ${styles[p] ?? styles.medium}`}>
            <span className={`w-2 h-2 rounded-full ${dots[p] ?? dots.medium}`} />
            {p.charAt(0).toUpperCase() + p.slice(1)} Risk
        </span>
    );
}

function CheckRow({ label, value }: { label: string; value: boolean }) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0">
            <span className="text-[13px] text-neutral-600">{label}</span>
            {value
                ? <span className="text-[12px] font-semibold text-emerald-600">✓ Yes</span>
                : <span className="text-[12px] font-semibold text-red-500">✗ No</span>}
        </div>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function OrderPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [data, setData] = useState<OrderDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailsOpen, setDetailsOpen] = useState(false);

    useEffect(() => {
        fetch(`/api/orders/${id}`)
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, [id]);

    if (loading) return (
        <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
            <div className="text-neutral-400 text-[14px] animate-pulse">Loading order…</div>
        </div>
    );

    if (!data || (data as { error?: string }).error) return (
        <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
            <div className="text-neutral-500 text-[14px]">Order not found. <Link href="/" className="underline text-zinc-700">Back to dashboard</Link></div>
        </div>
    );

    const { order, customer, pricing, workflow, production, risk, aiSummary, timeline, lineItems } = data;
    const isOverdue = order.daysUntilShip < 0;

    return (
        <div className="min-h-screen bg-neutral-50 font-sans">

            {/* Header bar */}
            <header className="border-b border-neutral-200 bg-white sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.back()} className="text-neutral-400 hover:text-neutral-600 transition-colors text-[14px]">← Back</button>
                        <span className="text-neutral-200">|</span>
                        <div className="flex items-center gap-2">
                            <Link href="/" className="flex items-center gap-2">
                                <img src="/new-logo.svg" alt="Logo" className="h-7 w-auto mb-1" />
                            </Link>
                        </div>
                    </div>
                    <a href="#" className="text-[13px] text-neutral-400 hover:text-neutral-600 border border-neutral-200 rounded-lg px-3 py-1.5 transition-colors">
                        Open in ERP ↗
                    </a>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

                {/* ── Job Snapshot Header ── */}
                <section className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6">
                    <div className="flex items-start justify-between flex-wrap gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h1 className="text-[22px] font-bold text-zinc-900 font-mono">{order.jobNumber}</h1>
                                <HealthPill priority={risk.priority} isHealthy={risk.isHealthy} />
                                {workflow.isRush && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-orange-50 text-orange-600 border border-orange-200 uppercase tracking-wide">Rush</span>
                                )}
                                {customer.priority === "VIP" && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wide">★ VIP</span>
                                )}
                            </div>
                            <p className="text-[17px] font-semibold text-zinc-800">{customer.company}</p>
                            <p className="text-[13px] text-neutral-400 mt-0.5">{customer.contactPerson}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-6 text-right">
                            <div>
                                <p className="text-[11px] text-neutral-400 font-semibold uppercase tracking-widest mb-1">Value</p>
                                <p className="text-[20px] font-bold text-zinc-900">{fmt$$(pricing.totalDue)}</p>
                            </div>
                            <div>
                                <p className="text-[11px] text-neutral-400 font-semibold uppercase tracking-widest mb-1">Ship Date</p>
                                <p className={`text-[17px] font-bold ${isOverdue ? "text-red-600" : "text-zinc-900"}`}>{order.requestedShipDate}</p>
                                {isOverdue && <p className="text-[11px] text-red-500 font-semibold">{Math.abs(order.daysUntilShip)}d overdue</p>}
                            </div>
                            <div>
                                <p className="text-[11px] text-neutral-400 font-semibold uppercase tracking-widest mb-1">Status</p>
                                <p className="text-[14px] font-semibold text-zinc-700">{order.status}</p>
                            </div>
                        </div>
                    </div>
                    {order.comment && (
                        <p className="mt-4 text-[13px] text-neutral-500 bg-neutral-50 rounded-lg px-4 py-3 border border-neutral-100 italic">"{order.comment}"</p>
                    )}
                </section>

                {/* ── AI Summary ── */}
                {!risk.isHealthy && (
                    <section className="bg-white rounded-2xl border border-orange-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
                            <span className="text-orange-500 text-[16px]">⚠</span>
                            <h2 className="text-[14px] font-bold text-orange-900">Why this order needs attention</h2>
                        </div>
                        <div className="px-6 py-5 grid md:grid-cols-2 gap-6">
                            <div>
                                <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-widest mb-3">What we found</p>
                                <ul className="space-y-2">
                                    {aiSummary.bullets.map((b, i) => (
                                        <li key={i} className="flex items-start gap-2 text-[13px] text-zinc-700">
                                            <span className="text-red-400 mt-0.5 flex-shrink-0">•</span>
                                            {b}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="md:border-l md:border-neutral-100 md:pl-6">
                                <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-widest mb-3">Recommended actions</p>
                                <ul className="space-y-2">
                                    {aiSummary.actions.map((a, i) => (
                                        <li key={i} className="flex items-start gap-2 text-[13px] text-zinc-800 font-medium">
                                            <span className="text-emerald-500 mt-0.5 flex-shrink-0">→</span>
                                            {a}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </section>
                )}

                <div className="grid md:grid-cols-[1fr_320px] gap-6">
                    <div className="space-y-6">

                        {/* ── Timeline ── */}
                        <section className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6">
                            <h2 className="text-[14px] font-bold text-zinc-900 mb-5">Order Timeline</h2>
                            <div className="relative">
                                {/* Vertical line */}
                                <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-neutral-100" />
                                <div className="space-y-4">
                                    {timeline.map((event, i) => {
                                        const dotColor = {
                                            done: "bg-emerald-500 border-emerald-500",
                                            late: "bg-red-500 border-red-500",
                                            warning: "bg-orange-400 border-orange-400",
                                            pending: "bg-white border-neutral-300",
                                        }[event.status];
                                        const labelColor = {
                                            done: "text-zinc-700",
                                            late: "text-red-600 font-semibold",
                                            warning: "text-orange-600 font-semibold",
                                            pending: "text-neutral-400",
                                        }[event.status];
                                        const dateColor = {
                                            done: "text-neutral-400",
                                            late: "text-red-400",
                                            warning: "text-orange-500",
                                            pending: "text-neutral-300",
                                        }[event.status];
                                        return (
                                            <div key={i} className="flex items-start gap-4 relative">
                                                <div className={`w-5.5 h-5.5 rounded-full border-2 flex-shrink-0 z-10 mt-0.5 ${dotColor}`} style={{ width: 22, height: 22 }} />
                                                <div className="flex-1 flex items-start justify-between gap-4 pb-1">
                                                    <span className={`text-[13px] ${labelColor}`}>{event.label}</span>
                                                    <span className={`text-[12px] tabular-nums flex-shrink-0 ${dateColor}`}>{event.date}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>

                    </div>

                    {/* ── Right column ── */}
                    <div className="space-y-4">

                        {/* Risk Factors */}
                        <section className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5">
                            <h2 className="text-[13px] font-bold text-zinc-900 mb-3 uppercase tracking-widest">Risk Factors</h2>
                            <div className="space-y-0">
                                <CheckRow label="Job Files" value={workflow.hasJobFiles} />
                                <CheckRow label="Proof Approved" value={workflow.hasProof} />
                                <CheckRow label="Rush Order" value={workflow.isRush} />
                                <div className="flex items-center justify-between py-2 border-b border-neutral-100">
                                    <span className="text-[13px] text-neutral-600">Days in Production</span>
                                    <span className={`text-[12px] font-semibold ${production.daysInProduction > 7 ? "text-red-500" : "text-zinc-700"}`}>
                                        {production.daysInProduction}d {production.daysInProduction > 7 ? "⚠ Stalled" : ""}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-b border-neutral-100">
                                    <span className="text-[13px] text-neutral-600">Complexity</span>
                                    <span className="text-[12px] font-semibold text-zinc-700 capitalize">{production.complexity ?? "—"}</span>
                                </div>
                                <div className="flex items-center justify-between py-2">
                                    <span className="text-[13px] text-neutral-600">Customer Priority</span>
                                    <span className={`text-[12px] font-bold ${customer.priority === "VIP" ? "text-amber-600" : "text-zinc-700"}`}>
                                        {customer.priority}
                                    </span>
                                </div>
                            </div>
                        </section>

                        {/* Quick facts */}
                        <section className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5">
                            <h2 className="text-[13px] font-bold text-zinc-900 mb-3 uppercase tracking-widest">Order Info</h2>
                            <div className="space-y-2 text-[13px]">
                                <div className="flex justify-between"><span className="text-neutral-400">Entered</span><span className="text-zinc-700">{order.dateEntered}</span></div>
                                <div className="flex justify-between"><span className="text-neutral-400">Order #</span><span className="font-mono text-zinc-700">{order.orderNumber}</span></div>
                                <div className="flex justify-between"><span className="text-neutral-400">Subtotal</span><span className="text-zinc-700">{fmt$$(pricing.subtotal)}</span></div>
                                <div className="flex justify-between"><span className="text-neutral-400">Total Due</span><span className="font-semibold text-zinc-900">{fmt$$(pricing.totalDue)}</span></div>
                                {production.estimatedCompletionDate && (
                                    <div className="flex justify-between"><span className="text-neutral-400">Est. Completion</span><span className="text-zinc-700">{production.estimatedCompletionDate}</span></div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>

                {/* ── Line Items (collapsed) ── */}
                <section className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                    <button
                        onClick={() => setDetailsOpen(o => !o)}
                        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-neutral-50 transition-colors"
                    >
                        <span className="text-[14px] font-semibold text-zinc-700">Order Details — {lineItems.length} line item{lineItems.length !== 1 ? "s" : ""}</span>
                        <span className="text-neutral-400 text-[18px]">{detailsOpen ? "−" : "+"}</span>
                    </button>
                    {detailsOpen && (
                        <div className="border-t border-neutral-100">
                            <div className="grid grid-cols-[2fr_0.5fr_0.8fr_0.8fr] gap-4 px-6 py-2 bg-neutral-50 text-[11px] text-neutral-400 font-semibold uppercase tracking-widest">
                                <span>Description</span><span>Qty</span><span>Unit Price</span><span>Total</span>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {lineItems.map((li, i) => (
                                    <div key={i} className="grid grid-cols-[2fr_0.5fr_0.8fr_0.8fr] gap-4 px-6 py-3">
                                        <div>
                                            <p className="text-[13px] text-zinc-800 font-medium">{li.description}</p>
                                            {li.comment && <p className="text-[11px] text-neutral-400 mt-0.5">{li.comment}</p>}
                                        </div>
                                        <span className="text-[13px] text-neutral-600">{li.quantity}</span>
                                        <span className="text-[13px] text-neutral-600 tabular-nums">{fmt$$(li.unitPrice)}</span>
                                        <span className="text-[13px] font-semibold text-zinc-900 tabular-nums">{fmt$$(li.totalPrice)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>

                <footer className="text-center text-[12px] text-neutral-300 pb-6">
                    OrderMind · Diagnostic view · {order.jobNumber}
                </footer>
            </main>

            {/* Context-aware chat — knows which order we're looking at */}
            <ChatPanel
                suggestions={[
                    `Why is ${order.jobNumber} flagged?`,
                    `List all orders for ${customer.company}`,
                    `What's the fastest ${order.jobNumber} could ship?`,
                    `Has ${customer.company} had delays before?`,
                ]}
            />
        </div>
    );
}
