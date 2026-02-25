"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatPanel } from "@/components/ChatPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
    date: string;
    totalActiveOrders: number;
    onTrackOrders: number;
    lateOrders: number;
    atRisk: number;
    rushOrdersRecent: number;
    vipOrdersActive: number;
    revenueThisWeek: number;
    dueToday: number;
    mainBottleneck: string;
    bottlenecks: { label: string; count: number }[];
}

interface RiskIssue {
    orderId: number;
    jobNumber: string;
    orderNumber: string;
    customer: string;
    customerPriority: string;
    value: number;
    status: string;
    requestedShipDate: string;
    daysInProduction: number;
    comment: string | null;
    reasons: string[];
    priority: "critical" | "high" | "medium" | "low";
}

interface RiskSummary {
    totalIssues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    issues: RiskIssue[];
}

interface SearchResult {
    id: number;
    jobNumber: string;
    customer: string;
    status: string;
    requestedShipDate: string;
    value: number;
    daysInProduction: number;
    isLate: boolean;
    score: number;
    reasons: string[];
}

interface SearchResponse {
    query: string;
    parser: "llm" | "heuristic";
    parsed: {
        customer: string | null;
        statuses: string[];
        lateOnly: boolean;
        rushOnly: boolean;
        minValue: number | null;
        stalledProductionDays: number | null;
        dateRange: "none" | "today" | "this_week" | "overdue";
        sortBy: "risk" | "value" | "ship_date";
        limit: number;
    };
    summary: {
        total: number;
        critical: number;
        highValue: number;
    };
    explanation: string;
    results: SearchResult[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$$(n: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function reasonLabel(r: string): string {
    if (r === "vip_late") return "VIP Late";
    if (r === "large_order_late") return "Large Order Late";
    if (r === "rush_no_proof") return "Rush / No Proof";
    if (r === "due_soon_no_proof") return "Due Soon, No Proof";
    if (r === "due_soon_no_files") return "Due Soon, No Files";
    if (r.startsWith("stalled_")) return `${r.split("_")[1]}d in Production`;
    return r;
}

function PriorityBadge({ p }: { p: RiskIssue["priority"] }) {
    const styles = {
        critical: "bg-red-50 text-red-700 border-red-200",
        high: "bg-orange-50 text-orange-700 border-orange-200",
        medium: "bg-gray-100 text-gray-600 border-gray-200",
        low: "bg-gray-50 text-gray-500 border-gray-200",
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border uppercase tracking-wide ${styles[p]}`}>
            {p}
        </span>
    );
}

function CustomerBadge({ priority }: { priority: string }) {
    if (priority === "VIP") return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wide">★ VIP</span>
    );
    if (priority === "high") return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 uppercase tracking-wide">KEY</span>
    );
    return null;
}

function StatCard({ label, value, sub, variant = "default" }: {
    label: string; value: string | number; sub?: string;
    variant?: "default" | "critical" | "warning" | "green";
}) {
    const border = {
        default: "border-gray-200",
        critical: "border-red-200",
        warning: "border-orange-200",
        green: "border-emerald-200",
    }[variant];
    const valueColor = {
        default: "text-gray-900",
        critical: "text-red-600",
        warning: "text-orange-600",
        green: "text-emerald-700",
    }[variant];
    return (
        <div className={`rounded-xl border bg-white p-5 flex flex-col gap-1.5 shadow-sm ${border}`}>
            <p className="text-[11px] text-gray-400 font-semibold tracking-widest uppercase">{label}</p>
            <p className={`text-3xl font-bold tabular-nums ${valueColor}`}>{value}</p>
            {sub && <p className="text-[12px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
    );
}

// ─── All Orders Modal ────────────────────────────────────────────────────────

interface OrderEntry {
    id: number;
    jobNumber: string;
    customer: string;
    status: string;
    requestedShipDate: string;
    value: number;
    health: "needs_attention" | "at_risk" | "on_track";
    reasons: string[];
}

interface OrdersData {
    summary: { total: number; onTrack: number; atRisk: number; needsAttention: number };
    orders: OrderEntry[];
}

const HEALTH_LABEL: Record<OrderEntry["health"], { label: string; dot: string; text: string }> = {
    needs_attention: { label: "Needs Attention", dot: "bg-red-500", text: "text-red-600" },
    at_risk: { label: "At Risk", dot: "bg-orange-400", text: "text-orange-600" },
    on_track: { label: "On Track", dot: "bg-emerald-500", text: "text-emerald-700" },
};

const REASON_TAG: Record<string, string> = {
    vip_late: "VIP Late",
    large_order_late: "Overdue",
    rush_no_proof: "Rush No Proof",
    due_soon_no_proof: "Proof Pending",
    due_soon_no_files: "Files Missing",
    stalled_prod: "Stalled >7d",
    stalled_production: "Stalled >7d",
};

function reasonTag(reasons: string[]): string | null {
    if (!reasons.length) return null;
    // return the most severe / first recognizable reason
    for (const r of reasons) {
        const key = Object.keys(REASON_TAG).find(k => r.startsWith(k));
        if (key) return REASON_TAG[key];
    }
    return reasons[0].replace(/_/g, " ");
}

function AllOrdersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [data, setData] = useState<OrdersData | null>(null);
    const [healthFilter, setHealthFilter] = useState<"all" | OrderEntry["health"]>("needs_attention");

    useEffect(() => {
        if (!open || data) return;
        fetch("/api/orders")
            .then(r => r.json())
            .then(d => setData(d))
            .catch(() => undefined);
    }, [open, data]);

    if (!open) return null;

    const filtered = data?.orders.filter(o => healthFilter === "all" || o.health === healthFilter) ?? [];

    return (
        <div className="fixed inset-0 z-50 flex" aria-modal="true">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

            {/* Panel — slides in from right */}
            <div className="relative ml-auto h-full w-full max-w-5xl bg-white shadow-2xl flex flex-col">

                {/* Header */}
                <div className="px-8 py-6 border-b border-gray-200 flex items-start justify-between">
                    <div>
                        <h2 className="text-[20px] font-bold text-gray-900">All Active Orders</h2>
                        <p className="text-[13px] text-gray-400 mt-0.5">Monitoring overview — read only</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-[22px] leading-none transition-colors">&times;</button>
                </div>

                {/* Summary counts */}
                {data && (
                    <div className="px-8 py-4 border-b border-gray-100 flex items-center gap-8">
                        <div className="text-[13px] text-gray-500">Total: <span className="font-bold text-gray-900">{data.summary.total}</span></div>
                        <div className="flex items-center gap-1.5 text-[13px]">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-emerald-700 font-semibold">{data.summary.onTrack} On Track</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[13px]">
                            <span className="w-2 h-2 rounded-full bg-orange-400" />
                            <span className="text-orange-600 font-semibold">{data.summary.atRisk} At Risk</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[13px]">
                            <span className="w-2 h-2 rounded-full bg-red-500" />
                            <span className="text-red-600 font-semibold">{data.summary.needsAttention} Needs Attention</span>
                        </div>

                        {/* Filter tabs */}
                        <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                            {(["all", "on_track", "at_risk", "needs_attention"] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setHealthFilter(f)}
                                    className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${healthFilter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                                >
                                    {f === "all" ? "All" : HEALTH_LABEL[f].label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="flex-1 overflow-y-auto">
                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_1.6fr_1fr_1fr_0.9fr_1.1fr_1.3fr] gap-4 px-8 py-3 bg-gray-50 border-b border-gray-200 text-[11px] text-gray-400 font-semibold uppercase tracking-widest sticky top-0">
                        <span>Job #</span><span>Customer</span><span>Status</span><span>Ship Date</span><span>Value</span><span>Health</span><span>Risk Reason</span>
                    </div>

                    {!data ? (
                        <div className="divide-y divide-gray-100">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <div key={i} className="grid grid-cols-[1fr_1.6fr_1fr_1fr_0.9fr_1.1fr_1.3fr] gap-4 px-8 py-4 animate-pulse">
                                    {Array.from({ length: 7 }).map((_, j) => <div key={j} className="h-4 bg-gray-100 rounded" />)}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {filtered.map(order => {
                                const h = HEALTH_LABEL[order.health];
                                const isOverdue = new Date(order.requestedShipDate) < new Date("2026-02-22");
                                const tag = reasonTag(order.reasons);
                                return (
                                    <div
                                        key={order.id}
                                        onClick={() => window.location.href = `/orders/${order.id}`}
                                        className={`grid grid-cols-[1fr_1.6fr_1fr_1fr_0.9fr_1.1fr_1.3fr] gap-4 px-8 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer group ${order.health === "needs_attention" ? "bg-red-50/40" : ""
                                            }`}
                                    >
                                        <div className="text-[13px] font-mono font-semibold text-gray-800 group-hover:text-indigo-600 transition-colors">{order.jobNumber}</div>
                                        <div className="text-[13px] text-gray-900 truncate font-medium">{order.customer}</div>
                                        <div className="text-[12px] text-gray-500">{order.status}</div>
                                        <div>
                                            <span className="text-[12px] text-gray-600">{order.requestedShipDate}</span>
                                            {isOverdue && <span className="ml-1.5 text-[11px] text-red-500 font-semibold">Overdue</span>}
                                        </div>
                                        <div className="text-[13px] font-semibold text-gray-900 tabular-nums">{fmt$$(order.value)}</div>
                                        <div className="flex items-center gap-1.5">
                                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${h.dot}`} />
                                            <span className={`text-[12px] font-semibold ${h.text}`}>{h.label}</span>
                                        </div>
                                        <div>
                                            {tag ? (
                                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 border border-gray-200">{tag}</span>
                                            ) : (
                                                <span className="text-[12px] text-gray-300">—</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [risk, setRisk] = useState<RiskSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "critical" | "high" | "medium">("all");
    const [allOrdersOpen, setAllOrdersOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchData, setSearchData] = useState<SearchResponse | null>(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        Promise.all([
            fetch("/api/summary").then(r => r.json()),
            fetch("/api/risk").then(r => r.json()),
        ]).then(([s, r]) => {
            setSummary(s);
            setRisk(r);
            setLoading(false);
        });
    }, []);

    async function runSearch(e: FormEvent) {
        e.preventDefault();
        const query = searchQuery.trim();
        if (!query) return;

        setSearchLoading(true);
        setSearchError(null);

        try {
            const res = await fetch("/api/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query }),
            });

            if (!res.ok) {
                throw new Error("Search request failed.");
            }

            const data = await res.json() as SearchResponse;
            setSearchData(data);
        } catch {
            setSearchError("Search is temporarily unavailable. Please try again.");
        } finally {
            setSearchLoading(false);
        }
    }

    const filteredIssues = risk?.issues.filter(i => filter === "all" || i.priority === filter) ?? [];

    const today = new Date("2026-02-22");
    const dateLabel = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">

            {/* Header */}
            <header className="border-b border-gray-200 bg-white sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-6 py-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <img src="/logo.svg" alt="OrderMind logo" className="w-8 h-8" />
                            <div>
                                <span className="font-bold text-[15px] tracking-tight" style={{ color: '#3D2C61' }}>OrderMind</span>
                                <span className="ml-2 text-[13px] text-gray-400 font-medium">— Shop Overview</span>
                            </div>
                        </div>
                        <div className="text-[13px] text-gray-400">{dateLabel}</div>
                    </div>

                    <form onSubmit={runSearch} className="flex items-center gap-2">
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search orders, customers, delays, risks…"
                            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-[14px] text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                        <button
                            type="submit"
                            disabled={searchLoading}
                            className="rounded-xl bg-indigo-600 text-white text-[13px] font-semibold px-4 py-3 hover:bg-indigo-500 transition-colors disabled:bg-indigo-300"
                        >
                            {searchLoading ? "Searching..." : "Search"}
                        </button>
                    </form>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

                {/* Shop Health */}
                <section>
                    <div className="mb-5">
                        <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Shop Health — Today</h1>
                        <p className="text-[13px] text-gray-400 mt-1">
                            Updated automatically every morning at 7:00 AM
                            {!loading && summary?.mainBottleneck && (
                                <> &nbsp;·&nbsp; <span className="text-orange-600 font-medium">Main issue: {summary.mainBottleneck}</span></>
                            )}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {loading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse shadow-sm">
                                    <div className="h-3 bg-gray-100 rounded w-20 mb-3" />
                                    <div className="h-8 bg-gray-100 rounded w-14" />
                                </div>
                            ))
                        ) : (
                            <>
                                <StatCard label="Late Orders" value={summary!.lateOrders} sub="past ship date" variant="critical" />
                                <StatCard label="At Risk" value={summary!.atRisk} sub="need attention" variant="warning" />
                                <StatCard label="VIP Active" value={summary!.vipOrdersActive} sub="accounts" />
                                <StatCard label="Rush (48h)" value={summary!.rushOrdersRecent} sub="recent entries" />
                                <StatCard label="Due Today" value={summary!.dueToday} sub="orders" />
                                <StatCard label="Revenue" value={fmt$$(summary!.revenueThisWeek)} sub="this week" variant="green" />
                            </>
                        )}
                    </div>
                </section>

                {/* Risk summary bar */}
                {!loading && risk && (
                    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center gap-6 flex-wrap">
                            <div className="flex items-center gap-2">
                                <span className="text-[13px] text-gray-500">Flagged orders:</span>
                                <span className="text-[15px] font-bold text-gray-900">{risk.totalIssues}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                <span className="text-[13px] text-red-600 font-semibold">{risk.critical} Critical</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
                                <span className="text-[13px] text-orange-600 font-semibold">{risk.high} High</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                                <span className="text-[13px] text-gray-500 font-semibold">{risk.medium} Medium</span>
                            </div>
                        </div>
                    </section>
                )}

                {searchData && (
                    <section className="space-y-4">
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <h2 className="text-[15px] font-bold text-indigo-900">Search Results</h2>
                                <span className="text-[12px] text-indigo-700 font-medium uppercase tracking-wide">Parser: {searchData.parser}</span>
                            </div>
                            <p className="text-[13px] text-indigo-900 mt-1">{searchData.explanation}</p>
                            <p className="text-[12px] text-indigo-700 mt-1">
                                {searchData.summary.total} matches · {searchData.summary.critical} critical-score · {searchData.summary.highValue} high-value
                            </p>
                        </div>

                        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
                            <div className="grid grid-cols-[1fr_1.6fr_1fr_1fr_0.9fr_1.2fr_1fr] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200 text-[11px] text-gray-400 font-semibold uppercase tracking-widest">
                                <span>Job #</span><span>Customer</span><span>Status</span><span>Ship Date</span><span>Value</span><span>Signals</span><span>Score</span>
                            </div>

                            {searchData.results.length === 0 ? (
                                <div className="px-5 py-10 text-center text-[13px] text-gray-400">
                                    No matches. Try: orders stuck in production or orders for Warner Bros.
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                                    {searchData.results.map((order) => (
                                        <div
                                            key={order.id}
                                            onClick={() => router.push(`/orders/${order.id}`)}
                                            className="grid grid-cols-[1fr_1.6fr_1fr_1fr_0.9fr_1.2fr_1fr] gap-4 px-5 py-3.5 transition-colors hover:bg-gray-50 cursor-pointer"
                                        >
                                            <span className="text-[13px] font-mono font-semibold text-gray-800">{order.jobNumber}</span>
                                            <span className="text-[13px] text-gray-900 truncate">{order.customer}</span>
                                            <span className="text-[12px] text-gray-500">{order.status}</span>
                                            <span className="text-[12px] text-gray-600">{order.requestedShipDate}</span>
                                            <span className="text-[13px] font-semibold text-gray-900 tabular-nums">{fmt$$(order.value)}</span>
                                            <div className="flex flex-wrap gap-1 items-center">
                                                {order.reasons.length ? order.reasons.map((reason) => (
                                                    <span key={reason} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded border border-gray-200">{reason.replace(/_/g, " ")}</span>
                                                )) : <span className="text-[12px] text-gray-300">—</span>}
                                            </div>
                                            <span className="text-[13px] font-semibold text-indigo-700">{order.score.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {searchError && (
                    <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                        {searchError}
                    </section>
                )}

                {/* Orders table */}
                <section>
                    {!loading && risk && summary && (
                        <div className="flex items-center justify-between text-[13px] mb-4">
                            <div className="flex items-center gap-4">
                                <span className="text-gray-500">
                                    Showing <span className="font-semibold text-gray-900">{risk.totalIssues}</span> of{" "}
                                    <span className="font-semibold text-gray-900">{summary.totalActiveOrders}</span> active orders
                                </span>
                                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                    {summary.onTrackOrders} on track
                                </span>
                            </div>
                            <button
                                onClick={() => setAllOrdersOpen(true)}
                                className="text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2">
                                View all {summary.totalActiveOrders} orders →
                            </button>
                        </div>
                    )}

                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-[16px] font-bold text-gray-900">Orders Needing Attention</h2>
                        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                            {(["all", "critical", "high", "medium"] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all capitalize ${filter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                                >
                                    {f === "all" ? `All (${risk?.totalIssues ?? 0})` : f}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
                        {/* Table header */}
                        <div className="grid grid-cols-[1fr_1.6fr_0.9fr_0.9fr_1.3fr_1.1fr] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200 text-[11px] text-gray-400 font-semibold uppercase tracking-widest">
                            <span>Job #</span><span>Customer</span><span>Value</span><span>Ship Date</span><span>Flags</span><span>Priority</span>
                        </div>

                        {loading ? (
                            <div className="divide-y divide-gray-100">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} className="grid grid-cols-[1fr_1.6fr_0.9fr_0.9fr_1.3fr_1.1fr] gap-4 px-5 py-4 animate-pulse">
                                        {Array.from({ length: 6 }).map((_, j) => <div key={j} className="h-4 bg-gray-100 rounded" />)}
                                    </div>
                                ))}
                            </div>
                        ) : filteredIssues.length === 0 ? (
                            <div className="px-5 py-16 text-center text-gray-400 text-[14px]">No issues at this level</div>
                        ) : (
                            <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                                {filteredIssues.map((issue, idx) => (
                                    <div
                                        key={issue.orderId}
                                        onClick={() => router.push(`/orders/${issue.orderId}`)}
                                        className={`grid grid-cols-[1fr_1.6fr_0.9fr_0.9fr_1.3fr_1.1fr] gap-4 px-5 py-4 transition-colors hover:bg-gray-50 cursor-pointer group ${idx === 0 && issue.priority === "critical" ? "bg-red-50/60" : ""}`}
                                    >
                                        <div>
                                            <p className="text-[13px] font-mono font-semibold text-gray-800 group-hover:text-indigo-600 transition-colors">{issue.jobNumber} <span className="text-gray-300 group-hover:text-indigo-300 text-[11px]">→</span></p>
                                            <p className="text-[11px] text-gray-400 mt-0.5">{issue.status}</p>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <p className="text-[13px] font-semibold text-gray-900 truncate">{issue.customer}</p>
                                                <CustomerBadge priority={issue.customerPriority} />
                                            </div>
                                            {issue.comment && (
                                                <p className="text-[11px] text-gray-400 mt-0.5 truncate" title={issue.comment}>{issue.comment}</p>
                                            )}
                                        </div>
                                        <div className="flex items-center">
                                            <p className="text-[13px] font-semibold text-gray-900 tabular-nums">{fmt$$(issue.value)}</p>
                                        </div>
                                        <div className="flex flex-col justify-center">
                                            <p className="text-[12px] text-gray-500 tabular-nums">{issue.requestedShipDate}</p>
                                            {new Date(issue.requestedShipDate) < new Date("2026-02-22") && (
                                                <p className="text-[11px] text-red-500 font-semibold mt-0.5">Overdue</p>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-1 items-center">
                                            {issue.reasons.map(r => (
                                                <span key={r} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded border border-gray-200">{reasonLabel(r)}</span>
                                            ))}
                                        </div>
                                        <div className="flex items-center"><PriorityBadge p={issue.priority} /></div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                {/* Bottleneck breakdown */}
                {!loading && summary && (
                    <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {summary.bottlenecks.map((b, i) => {
                            const pct = Math.round((b.count / summary.bottlenecks[0].count) * 100);
                            const barColor = ["bg-red-500", "bg-orange-400", "bg-gray-400"][i];
                            return (
                                <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                                    <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-widest mb-2">#{i + 1} Issue</p>
                                    <p className="text-[15px] font-semibold text-gray-900 mb-4 leading-snug">{b.label}</p>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </section>
                )}

                <footer className="text-center text-[12px] text-gray-300 pb-6">
                    OrderMind · {dateLabel}
                </footer>
            </main>

            {/* Chat */}
            <ChatPanel />

            {/* All Orders Confidence View */}
            <AllOrdersModal open={allOrdersOpen} onClose={() => setAllOrdersOpen(false)} />
        </div>
    );
}
