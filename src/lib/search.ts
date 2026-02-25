import OpenAI from "openai";
import { sqlite } from "@/lib/db";

export const DEMO_TODAY = "2026-02-22";

export type SearchDateRange = "none" | "today" | "this_week" | "overdue";
export type SearchSortBy = "risk" | "value" | "ship_date";

export interface SearchFilters {
    customer: string | null;
    statuses: string[];
    lateOnly: boolean;
    rushOnly: boolean;
    minValue: number | null;
    stalledProductionDays: number | null;
    dateRange: SearchDateRange;
    sortBy: SearchSortBy;
    limit: number;
}

export interface SearchRow {
    id: number;
    jobNumber: string;
    customer: string;
    customerPriority: string;
    status: string;
    requestedShipDate: string;
    value: number;
    daysInProduction: number;
    isLate: number;
    isRush: number;
    hasProof: number;
}

export interface SearchResult {
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

const DEFAULT_FILTERS: SearchFilters = {
    customer: null,
    statuses: [],
    lateOnly: false,
    rushOnly: false,
    minValue: null,
    stalledProductionDays: null,
    dateRange: "none",
    sortBy: "risk",
    limit: 100,
};

function normalizeStatuses(statuses: unknown): string[] {
    if (!Array.isArray(statuses)) return [];
    return statuses
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

function toBool(v: unknown, fallback = false): boolean {
    return typeof v === "boolean" ? v : fallback;
}

function toNum(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function validateFilters(input: unknown): SearchFilters {
    if (!input || typeof input !== "object") {
        return DEFAULT_FILTERS;
    }

    const data = input as Record<string, unknown>;
    const limit = Math.max(1, Math.min(200, Math.floor(toNum(data.limit) ?? DEFAULT_FILTERS.limit)));

    const dateRange = ["none", "today", "this_week", "overdue"].includes(String(data.dateRange))
        ? (data.dateRange as SearchDateRange)
        : "none";

    const sortBy = ["risk", "value", "ship_date"].includes(String(data.sortBy))
        ? (data.sortBy as SearchSortBy)
        : "risk";

    const customer = typeof data.customer === "string" && data.customer.trim() ? data.customer.trim() : null;

    return {
        customer,
        statuses: normalizeStatuses(data.statuses),
        lateOnly: toBool(data.lateOnly),
        rushOnly: toBool(data.rushOnly),
        minValue: toNum(data.minValue),
        stalledProductionDays: toNum(data.stalledProductionDays),
        dateRange,
        sortBy,
        limit,
    };
}

function parseJsonLoose(payload: string): unknown {
    const cleaned = payload
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/, "")
        .trim();

    return JSON.parse(cleaned);
}

function parseWithHeuristics(query: string): SearchFilters {
    const q = query.toLowerCase();
    const filters: SearchFilters = { ...DEFAULT_FILTERS };

    if (q.includes("late") || q.includes("overdue")) {
        filters.lateOnly = true;
        filters.dateRange = "overdue";
    }

    if (q.includes("rush")) {
        filters.rushOnly = true;
    }

    if (q.includes("high value") || q.includes("large order") || q.includes("large orders")) {
        filters.minValue = 5000;
    }

    if (q.includes("stuck in production") || q.includes("stalled") || q.includes("stuck")) {
        filters.statuses = ["production"];
        filters.stalledProductionDays = 7;
    }

    if (q.includes("this week")) {
        filters.dateRange = "this_week";
    }

    const customerMatch = query.match(/orders\s+for\s+([\w .&'-]+)/i);
    if (customerMatch?.[1]) {
        filters.customer = customerMatch[1].trim();
    }

    return filters;
}

export async function parseSearchQuery(query: string, openaiApiKey?: string): Promise<{ filters: SearchFilters; parser: "llm" | "heuristic" }> {
    if (!openaiApiKey) {
        return { filters: parseWithHeuristics(query), parser: "heuristic" };
    }

    try {
        const openai = new OpenAI({ apiKey: openaiApiKey });
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0,
            max_tokens: 280,
            messages: [
                {
                    role: "system",
                    content: `You convert shop-order search queries into strict JSON. Output ONLY JSON object with keys: customer, statuses, lateOnly, rushOnly, minValue, stalledProductionDays, dateRange, sortBy, limit.\nAllowed dateRange: none,today,this_week,overdue. Allowed sortBy: risk,value,ship_date. statuses should be lowercase text hints like production, proof, shipping.`,
                },
                { role: "user", content: query },
            ],
        });

        const payload = completion.choices[0]?.message?.content;
        if (!payload) {
            return { filters: parseWithHeuristics(query), parser: "heuristic" };
        }

        return { filters: validateFilters(parseJsonLoose(payload)), parser: "llm" };
    } catch {
        return { filters: parseWithHeuristics(query), parser: "heuristic" };
    }
}

function scoreRow(row: SearchRow, filters: SearchFilters): SearchResult {
    let score = 0;
    const reasons: string[] = [];

    if (row.isLate) {
        score += 0.4;
        reasons.push("late");
    }

    const stalledThreshold = filters.stalledProductionDays ?? 7;
    if (row.daysInProduction > stalledThreshold) {
        score += 0.25;
        reasons.push("stalled_prod");
    }

    if (row.value >= 5000 || (filters.minValue !== null && row.value >= filters.minValue)) {
        score += 0.2;
        reasons.push("high_value");
    }

    if (row.customerPriority === "VIP") {
        score += 0.15;
        reasons.push("vip_customer");
    }

    if (row.isRush && !row.hasProof) {
        score += 0.1;
        reasons.push("rush_no_proof");
    }

    return {
        id: row.id,
        jobNumber: row.jobNumber,
        customer: row.customer,
        status: row.status,
        requestedShipDate: row.requestedShipDate,
        value: row.value,
        daysInProduction: row.daysInProduction,
        isLate: Boolean(row.isLate),
        score: Math.min(0.99, Number(score.toFixed(2))),
        reasons,
    };
}

export function runDeterministicSearch(filters: SearchFilters): SearchResult[] {
    const where: string[] = ["o.is_completed = 0"];
    const params: Array<string | number> = [];

    if (filters.customer) {
        where.push("LOWER(c.company) LIKE LOWER(?)");
        params.push(`%${filters.customer}%`);
    }

    if (filters.statuses.length) {
        const clauses = filters.statuses.map(() => "LOWER(o.status) LIKE LOWER(?)");
        where.push(`(${clauses.join(" OR ")})`);
        params.push(...filters.statuses.map((s) => `%${s}%`));
    }

    if (filters.lateOnly) {
        where.push("COALESCE(m.is_late, 0) = 1");
    }

    if (filters.rushOnly) {
        where.push("COALESCE(w.is_rush, 0) = 1");
    }

    if (filters.minValue !== null) {
        where.push("COALESCE(pr.total_due, 0) >= ?");
        params.push(filters.minValue);
    }

    if (filters.stalledProductionDays !== null) {
        where.push("COALESCE(p.days_in_production, 0) >= ?");
        params.push(filters.stalledProductionDays);
    }

    if (filters.dateRange === "today") {
        where.push("o.requested_ship_date = ?");
        params.push(DEMO_TODAY);
    }

    if (filters.dateRange === "this_week") {
        where.push("o.requested_ship_date BETWEEN date(?, '-7 day') AND ?");
        params.push(DEMO_TODAY, DEMO_TODAY);
    }

    if (filters.dateRange === "overdue") {
        where.push("o.requested_ship_date < ?");
        params.push(DEMO_TODAY);
    }

    const rows = sqlite.prepare(
        `SELECT
            o.id,
            o.job_number AS jobNumber,
            c.company AS customer,
            c.customer_priority AS customerPriority,
            o.status,
            o.requested_ship_date AS requestedShipDate,
            COALESCE(pr.total_due, 0) AS value,
            COALESCE(p.days_in_production, 0) AS daysInProduction,
            COALESCE(m.is_late, 0) AS isLate,
            COALESCE(w.is_rush, 0) AS isRush,
            COALESCE(w.has_proof, 0) AS hasProof
        FROM orders o
        JOIN customers c ON c.id = o.customer_id
        LEFT JOIN order_pricing pr ON pr.order_id = o.id
        LEFT JOIN order_production p ON p.order_id = o.id
        LEFT JOIN order_metadata m ON m.order_id = o.id
        LEFT JOIN order_workflow w ON w.order_id = o.id
        WHERE ${where.join(" AND ")}`
    ).all(...params) as SearchRow[];

    const scored = rows.map((row) => scoreRow(row, filters));

    if (filters.sortBy === "value") {
        scored.sort((a, b) => b.value - a.value || b.score - a.score);
    } else if (filters.sortBy === "ship_date") {
        scored.sort((a, b) => a.requestedShipDate.localeCompare(b.requestedShipDate));
    } else {
        scored.sort((a, b) => b.score - a.score || b.value - a.value);
    }

    return scored.slice(0, filters.limit);
}
