"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
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
    aiSummary: string | null;
    results: SearchResult[];
}

interface SavedSearch {
    id: string;
    name: string;
    query: string;
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

// ─── Match Badge ─────────────────────────────────────────────────────────────

const MATCH_BADGE_META: Record<string, { label: string; dot: string }> = {
    late: { label: "Matched: Late", dot: "bg-red-400" },
    stalled_prod: { label: "Matched: Stalled in Production", dot: "bg-orange-400" },
    high_value: { label: "Matched: High Value", dot: "bg-blue-400" },
    vip_customer: { label: "Matched: VIP Customer", dot: "bg-amber-400" },
    rush_no_proof: { label: "Matched: Rush / No Proof", dot: "bg-red-400" },
};

function MatchBadge({ reason }: { reason: string }) {
    const base = reason.startsWith("stalled") ? "stalled_prod" : reason;
    const meta = MATCH_BADGE_META[base];
    const label = meta?.label ?? `Matched: ${reason.replace(/_/g, " ")}`;
    const dot = meta?.dot ?? "bg-neutral-300";
    return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-neutral-200 bg-white text-[10px] font-medium text-neutral-600">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
            {label}
        </span>
    );
}

function PriorityBadge({ p }: { p: RiskIssue["priority"] }) {
    const dot = {
        critical: "bg-red-400",
        high: "bg-orange-400",
        medium: "bg-neutral-400",
        low: "bg-neutral-300",
    }[p];
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium border border-neutral-200 bg-white text-neutral-600 uppercase tracking-wide">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
            {p}
        </span>
    );
}

function CustomerBadge({ priority }: { priority: string }) {
    if (priority === "VIP") return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white border border-neutral-200 text-neutral-600 uppercase tracking-wide">★ VIP</span>
    );
    if (priority === "high") return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-white text-neutral-500 border border-neutral-200 uppercase tracking-wide">KEY</span>
    );
    return null;
}

function StatCard({ label, value, sub, variant = "default" }: {
    label: string; value: string | number; sub?: string;
    variant?: "default" | "critical" | "warning" | "green";
}) {
    const valueColor = {
        default: "text-zinc-900",
        critical: "text-zinc-900",
        warning: "text-zinc-900",
        green: "text-zinc-900",
    }[variant];
    const dot = {
        default: "",
        critical: "bg-red-400",
        warning: "bg-orange-400",
        green: "bg-emerald-400",
    }[variant];
    return (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 flex flex-col gap-1.5 shadow-sm">
            <div className="flex items-center gap-1.5">
                {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />}
                <p className="text-[11px] text-neutral-400 font-semibold tracking-widest uppercase">{label}</p>
            </div>
            <p className={`text-3xl font-bold tabular-nums ${valueColor}`}>{value}</p>
            {sub && <p className="text-[12px] text-neutral-400 mt-0.5">{sub}</p>}
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
    needs_attention: { label: "Needs Attention", dot: "bg-red-400", text: "text-neutral-700" },
    at_risk: { label: "At Risk", dot: "bg-orange-400", text: "text-neutral-700" },
    on_track: { label: "On Track", dot: "bg-emerald-400", text: "text-neutral-600" },
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
                <div className="px-8 py-6 border-b border-neutral-200 flex items-start justify-between">
                    <div>
                        <h2 className="text-[20px] font-bold text-zinc-900">All Active Orders</h2>
                        <p className="text-[13px] text-neutral-400 mt-0.5">Monitoring overview — read only</p>
                    </div>
                    <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-[22px] leading-none transition-colors">&times;</button>
                </div>

                {/* Summary counts */}
                {data && (
                    <div className="px-8 py-4 border-b border-neutral-100 flex items-center gap-8">
                        <div className="text-[13px] text-neutral-500">Total: <span className="font-bold text-zinc-900">{data.summary.total}</span></div>
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
                        <div className="ml-auto flex items-center gap-1 bg-neutral-100 rounded-lg p-1">
                            {(["all", "on_track", "at_risk", "needs_attention"] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setHealthFilter(f)}
                                    className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${healthFilter === f ? "bg-white text-zinc-900 shadow-sm" : "text-neutral-500 hover:text-zinc-700"}`}
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
                    <div className="grid grid-cols-[1fr_1.6fr_1fr_1fr_0.9fr_1.1fr_1.3fr] gap-4 px-8 py-3 bg-neutral-50 border-b border-neutral-200 text-[11px] text-neutral-400 font-semibold uppercase tracking-widest sticky top-0">
                        <span>Job #</span><span>Customer</span><span>Status</span><span>Ship Date</span><span>Value</span><span>Health</span><span>Risk Reason</span>
                    </div>

                    {!data ? (
                        <div className="divide-y divide-neutral-100">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <div key={i} className="grid grid-cols-[1fr_1.6fr_1fr_1fr_0.9fr_1.1fr_1.3fr] gap-4 px-8 py-4 animate-pulse">
                                    {Array.from({ length: 7 }).map((_, j) => <div key={j} className="h-4 bg-neutral-100 rounded" />)}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="divide-y divide-neutral-100">
                            {filtered.map(order => {
                                const h = HEALTH_LABEL[order.health];
                                const isOverdue = new Date(order.requestedShipDate) < new Date("2026-02-22");
                                const tag = reasonTag(order.reasons);
                                return (
                                    <div
                                        key={order.id}
                                        onClick={() => window.location.href = `/orders/${order.id}`}
                                        className={`grid grid-cols-[1fr_1.6fr_1fr_1fr_0.9fr_1.1fr_1.3fr] gap-4 px-8 py-3.5 hover:bg-neutral-50 transition-colors cursor-pointer group ${order.health === "needs_attention" ? "bg-red-50/40" : ""
                                            }`}
                                    >
                                        <div className="text-[13px] font-mono font-semibold text-zinc-800 group-hover:text-blue-600 transition-colors">{order.jobNumber}</div>
                                        <div className="text-[13px] text-zinc-900 truncate font-medium">{order.customer}</div>
                                        <div className="text-[12px] text-neutral-500">{order.status}</div>
                                        <div>
                                            <span className="text-[12px] text-neutral-600">{order.requestedShipDate}</span>
                                            {isOverdue && <span className="ml-1.5 text-[11px] text-neutral-500 font-medium">Overdue</span>}
                                        </div>
                                        <div className="text-[13px] font-semibold text-zinc-900 tabular-nums">{fmt$$(order.value)}</div>
                                        <div className="flex items-center gap-1.5">
                                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${h.dot}`} />
                                            <span className={`text-[12px] font-semibold ${h.text}`}>{h.label}</span>
                                        </div>
                                        <div>
                                            {tag ? (
                                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-500 border border-neutral-200">{tag}</span>
                                            ) : (
                                                <span className="text-[12px] text-neutral-300">—</span>
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
    const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
    const [saveMode, setSaveMode] = useState(false);
    const [saveName, setSaveName] = useState("");
    const [chatOpen, setChatOpen] = useState(false);
    const [chatPrefill, setChatPrefill] = useState<string | undefined>(undefined);
    const saveInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    useEffect(() => {
        Promise.all([
            fetch("/api/summary").then(r => r.json()),
            fetch("/api/risk").then(r => r.json()),
            fetch("/api/saved-searches").then(r => r.json()).catch(() => []),
        ]).then(([s, r, ss]) => {
            setSummary(s);
            setRisk(r);
            setSavedSearches(Array.isArray(ss) ? ss : []);
            setLoading(false);
        });
    }, []);

    async function saveSearch() {
        const name = saveName.trim();
        if (!name || !searchData) return;
        const res = await fetch("/api/saved-searches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, query: searchData.query }),
        });
        if (res.ok) {
            const saved: SavedSearch = await res.json();
            setSavedSearches(prev => [...prev, saved]);
            setSaveMode(false);
            setSaveName("");
        }
    }

    async function deleteSavedSearch(id: string) {
        await fetch(`/api/saved-searches?id=${id}`, { method: "DELETE" });
        setSavedSearches(prev => prev.filter(s => s.id !== id));
    }

    async function runSavedSearch(query: string) {
        setSearchQuery(query);
        setSearchLoading(true);
        setSearchError(null);
        try {
            const res = await fetch("/api/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query }),
            });
            if (!res.ok) throw new Error();
            setSearchData(await res.json());
        } catch {
            setSearchError("Search is temporarily unavailable. Please try again.");
        } finally {
            setSearchLoading(false);
        }
    }

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
        <div className="min-h-screen bg-neutral-50 text-zinc-900 font-sans">

            {/* Header */}
            <header className="border-b border-neutral-200 bg-white sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-6 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <img src="/new-logo.svg" alt="OrderMind logo" className="h-6 w-auto mb-1" />
                            <div className="mb-1">
                                <span className="ml-2 text-[13px] text-neutral-400 font-medium">— Shop Overview</span>
                            </div>
                        </div>
                        <div className="text-[13px] text-neutral-400">{dateLabel}</div>
                    </div>

                    <form onSubmit={runSearch} className="flex items-center gap-2">
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search orders, customers, delays, risks…"
                            className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-[14px] text-zinc-700 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <button
                            type="submit"
                            disabled={searchLoading}
                            className="rounded-xl bg-blue-600 text-white text-[13px] font-semibold px-4 py-3 hover:bg-blue-500 transition-colors disabled:bg-blue-300"
                        >
                            {searchLoading ? "Searching..." : "Search"}
                        </button>
                    </form>

                    {/* Saved search chips */}
                    {savedSearches.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-neutral-400 font-semibold uppercase tracking-widest">Saved:</span>
                            {savedSearches.map(s => (
                                <div key={s.id} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1">
                                    <button
                                        onClick={() => runSavedSearch(s.query)}
                                        className="text-[12px] font-semibold text-blue-700 hover:text-blue-900 transition-colors"
                                    >
                                        {s.name}
                                    </button>
                                    <button
                                        onClick={() => deleteSavedSearch(s.id)}
                                        className="text-blue-400 hover:text-blue-700 text-[14px] leading-none ml-1 transition-colors"
                                        title="Remove saved search"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

                {/* Shop Health */}
                <section>
                    <div className="mb-5">
                        <h1 className="text-[22px] font-bold text-zinc-900 tracking-tight">Shop Health — Today</h1>
                        <p className="text-[13px] text-neutral-400 mt-1">
                            Updated automatically every morning at 7:00 AM
                            {!loading && summary?.mainBottleneck && (
                                <> &nbsp;·&nbsp; <span className="text-neutral-500 font-medium">Main issue: {summary.mainBottleneck}</span></>
                            )}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {loading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="rounded-xl border border-neutral-200 bg-white p-5 animate-pulse shadow-sm">
                                    <div className="h-3 bg-neutral-100 rounded w-20 mb-3" />
                                    <div className="h-8 bg-neutral-100 rounded w-14" />
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
                    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center gap-6 flex-wrap">
                            <div className="flex items-center gap-2">
                                <span className="text-[13px] text-neutral-500">Flagged orders:</span>
                                <span className="text-[15px] font-bold text-zinc-900">{risk.totalIssues}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-red-400" />
                                <span className="text-[13px] text-neutral-600">{risk.critical} Critical</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-orange-400" />
                                <span className="text-[13px] text-neutral-600">{risk.high} High</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-neutral-300" />
                                <span className="text-[13px] text-neutral-500">{risk.medium} Medium</span>
                            </div>
                        </div>
                    </section>
                )}

                {searchData && (
                    <section className="space-y-4">
                        {/* Results meta bar */}
                        <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3 shadow-sm">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-[15px] font-semibold text-zinc-900">Search Results</h2>
                                    <span className="text-[11px] text-neutral-400 font-medium uppercase tracking-wide bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">Parser: {searchData.parser}</span>
                                </div>
                                {/* Save search */}
                                {!saveMode ? (
                                    <button
                                        onClick={() => { setSaveMode(true); setTimeout(() => saveInputRef.current?.focus(), 50); }}
                                        className="text-[12px] font-medium text-neutral-600 hover:text-zinc-900 transition-colors border border-neutral-200 rounded-lg px-3 py-1.5 hover:bg-neutral-50"
                                    >
                                        + Save this search
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <input
                                            ref={saveInputRef}
                                            value={saveName}
                                            onChange={e => setSaveName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') saveSearch(); if (e.key === 'Escape') { setSaveMode(false); setSaveName(""); } }}
                                            placeholder="Name this search…"
                                            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-[12px] text-zinc-700 focus:outline-none focus:ring-2 focus:ring-neutral-300 w-44"
                                        />
                                        <button onClick={saveSearch} className="text-[12px] font-semibold text-white bg-zinc-900 hover:bg-zinc-700 transition-colors rounded-lg px-3 py-1.5">Save</button>
                                        <button onClick={() => { setSaveMode(false); setSaveName(""); }} className="text-[12px] text-neutral-400 hover:text-neutral-600 transition-colors">Cancel</button>
                                    </div>
                                )}
                            </div>
                            <p className="text-[13px] text-neutral-600">{searchData.explanation}</p>
                            <p className="text-[12px] text-neutral-400">
                                {searchData.summary.total} matches · {searchData.summary.critical} critical-score · {searchData.summary.highValue} high-value
                            </p>
                        </div>

                        {/* AI Insight Panel */}
                        {searchData.aiSummary && (
                            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-neutral-500 text-[13px]">✦</span>
                                        <h3 className="text-[13px] font-semibold text-zinc-900">AI Insight</h3>
                                        <span className="text-[10px] text-neutral-400 font-medium uppercase tracking-wide bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">top-10 results</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setChatPrefill(`I just searched for "${searchData.query}". Here's what came up — can you help me prioritize what to act on first?`);
                                            setChatOpen(true);
                                        }}
                                        className="text-[11px] font-medium text-neutral-500 hover:text-zinc-900 transition-colors border border-neutral-200 rounded-lg px-2.5 py-1 hover:bg-neutral-50"
                                    >
                                        Chat about these results →
                                    </button>
                                </div>
                                <div className="text-[13px] text-neutral-700 whitespace-pre-line leading-relaxed">
                                    {searchData.aiSummary}
                                </div>
                            </div>
                        )}

                        {/* Results table */}
                        <div className="rounded-xl border border-neutral-200 overflow-hidden bg-white shadow-sm">
                            <div className="grid grid-cols-[1fr_1.6fr_1fr_1fr_0.9fr_1.4fr_0.8fr] gap-4 px-5 py-3 bg-neutral-50 border-b border-neutral-200 text-[11px] text-neutral-400 font-semibold uppercase tracking-widest">
                                <span>Job #</span><span>Customer</span><span>Status</span><span>Ship Date</span><span>Value</span><span>Matched Signals</span><span>Score</span>
                            </div>

                            {searchData.results.length === 0 ? (
                                <div className="px-5 py-10 text-center text-[13px] text-neutral-400">
                                    No matches. Try: orders stuck in production or orders for Warner Bros.
                                </div>
                            ) : (
                                <div className="divide-y divide-neutral-100 max-h-[420px] overflow-y-auto">
                                    {searchData.results.map((order) => (
                                        <div
                                            key={order.id}
                                            onClick={() => router.push(`/orders/${order.id}`)}
                                            className="grid grid-cols-[1fr_1.6fr_1fr_1fr_0.9fr_1.4fr_0.8fr] gap-4 px-5 py-3.5 transition-colors hover:bg-neutral-50 cursor-pointer"
                                        >
                                            <span className="text-[13px] font-mono font-semibold text-zinc-800">{order.jobNumber}</span>
                                            <span className="text-[13px] text-zinc-900 truncate">{order.customer}</span>
                                            <span className="text-[12px] text-neutral-500">{order.status}</span>
                                            <span className="text-[12px] text-neutral-600">{order.requestedShipDate}</span>
                                            <span className="text-[13px] font-semibold text-zinc-900 tabular-nums">{fmt$$(order.value)}</span>
                                            <div className="flex flex-wrap gap-1 items-center">
                                                {order.reasons.length ? order.reasons.map((reason) => (
                                                    <MatchBadge key={reason} reason={reason} />
                                                )) : <span className="text-[12px] text-neutral-300">—</span>}
                                            </div>
                                            <span className="text-[13px] font-bold text-blue-700">{order.score.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {searchError && (
                    <section className="rounded-xl border border-neutral-200 bg-neutral-100 px-4 py-3 text-[13px] text-neutral-600">
                        {searchError}
                    </section>
                )}

                {/* Orders table */}
                <section>
                    {!loading && risk && summary && (
                        <div className="flex items-center justify-between text-[13px] mb-4">
                            <div className="flex items-center gap-4">
                                <span className="text-neutral-500">
                                    Showing <span className="font-semibold text-zinc-900">{risk.totalIssues}</span> of{" "}
                                    <span className="font-semibold text-zinc-900">{summary.totalActiveOrders}</span> active orders
                                </span>
                                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                    {summary.onTrackOrders} on track
                                </span>
                            </div>
                            <button
                                onClick={() => setAllOrdersOpen(true)}
                                className="text-neutral-400 hover:text-neutral-600 transition-colors underline underline-offset-2">
                                View all {summary.totalActiveOrders} orders →
                            </button>
                        </div>
                    )}

                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-[16px] font-bold text-zinc-900">Orders Needing Attention</h2>
                        <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-1">
                            {(["all", "critical", "high", "medium"] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all capitalize ${filter === f ? "bg-white text-zinc-900 shadow-sm" : "text-neutral-500 hover:text-zinc-700"}`}
                                >
                                    {f === "all" ? `All (${risk?.totalIssues ?? 0})` : f}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border border-neutral-200 overflow-hidden bg-white shadow-sm">
                        {/* Table header */}
                        <div className="grid grid-cols-[1fr_1.6fr_0.9fr_0.9fr_1.3fr_1.1fr] gap-4 px-5 py-3 bg-neutral-50 border-b border-neutral-200 text-[11px] text-neutral-400 font-semibold uppercase tracking-widest">
                            <span>Job #</span><span>Customer</span><span>Value</span><span>Ship Date</span><span>Flags</span><span>Priority</span>
                        </div>

                        {loading ? (
                            <div className="divide-y divide-neutral-100">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} className="grid grid-cols-[1fr_1.6fr_0.9fr_0.9fr_1.3fr_1.1fr] gap-4 px-5 py-4 animate-pulse">
                                        {Array.from({ length: 6 }).map((_, j) => <div key={j} className="h-4 bg-neutral-100 rounded" />)}
                                    </div>
                                ))}
                            </div>
                        ) : filteredIssues.length === 0 ? (
                            <div className="px-5 py-16 text-center text-neutral-400 text-[14px]">No issues at this level</div>
                        ) : (
                            <div className="divide-y divide-neutral-100 max-h-[600px] overflow-y-auto">
                                {filteredIssues.map((issue, idx) => (
                                    <div
                                        key={issue.orderId}
                                        onClick={() => router.push(`/orders/${issue.orderId}`)}
                                        className={`grid grid-cols-[1fr_1.6fr_0.9fr_0.9fr_1.3fr_1.1fr] gap-4 px-5 py-4 transition-colors hover:bg-neutral-50 cursor-pointer group ${idx === 0 && issue.priority === "critical" ? "bg-red-50/60" : ""}`}
                                    >
                                        <div>
                                            <p className="text-[13px] font-mono font-semibold text-zinc-800 group-hover:text-blue-600 transition-colors">{issue.jobNumber} <span className="text-neutral-300 group-hover:text-blue-300 text-[11px]">→</span></p>
                                            <p className="text-[11px] text-neutral-400 mt-0.5">{issue.status}</p>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <p className="text-[13px] font-semibold text-zinc-900 truncate">{issue.customer}</p>
                                                <CustomerBadge priority={issue.customerPriority} />
                                            </div>
                                            {issue.comment && (
                                                <p className="text-[11px] text-neutral-400 mt-0.5 truncate" title={issue.comment}>{issue.comment}</p>
                                            )}
                                        </div>
                                        <div className="flex items-center">
                                            <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">{fmt$$(issue.value)}</p>
                                        </div>
                                        <div className="flex flex-col justify-center">
                                            <p className="text-[12px] text-neutral-500 tabular-nums">{issue.requestedShipDate}</p>
                                            {new Date(issue.requestedShipDate) < new Date("2026-02-22") && (
                                                <p className="text-[11px] text-neutral-500 font-medium mt-0.5">Overdue</p>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-1 items-center">
                                            {issue.reasons.map(r => (
                                                <span key={r} className="text-[10px] bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded border border-neutral-200">{reasonLabel(r)}</span>
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
                            const barColor = ["bg-red-400", "bg-orange-400", "bg-neutral-300"][i];
                            return (
                                <div key={i} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                                    <p className="text-[11px] text-neutral-400 font-semibold uppercase tracking-widest mb-2">#{i + 1} Issue</p>
                                    <p className="text-[15px] font-semibold text-zinc-900 mb-4 leading-snug">{b.label}</p>
                                    <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </section>
                )}

                <footer className="text-center text-[12px] text-neutral-300 pb-6">
                    OrderMind · {dateLabel}
                </footer>
            </main>

            {/* Chat */}
            <ChatPanel open={chatOpen} onOpenChange={setChatOpen} prefillMessage={chatPrefill} onPrefillConsumed={() => setChatPrefill(undefined)} />

            {/* All Orders Confidence View */}
            <AllOrdersModal open={allOrdersOpen} onClose={() => setAllOrdersOpen(false)} />
        </div>
    );
}
