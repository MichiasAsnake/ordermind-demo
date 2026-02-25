# Phase 1 Plan: Promote Search to First-Class

## Goal
Turn the current dashboard + chat experience into an **operations search surface** where natural language queries are translated into deterministic filters and scored results.

## Why this fits the current codebase
- The app already has deterministic order signals (`isLate`, `daysInProduction`, `isRush`, VIP priority, value, status) available in SQL-backed APIs.
- `/api/chat` already integrates an LLM and can be adapted to parse intent into JSON, rather than directly answering from prompt context.
- `/api/orders` already joins the core order/customer/metadata/workflow tables and computes risk-style health labels.

## Phase 1 architecture (lightweight, no full RAG)

### 1) Promote search to the header
- Add a top-level search input in the dashboard header.
- Placeholder: `Search orders, customers, delays, risks…`
- On submit, call a dedicated endpoint (`POST /api/search`) and render:
  - Optional summary strip (query interpretation + counts)
  - Deterministic results table (order rows)

### 2) Hybrid query flow
Implement this request path:

1. **Natural language query** (frontend)
2. **LLM parse** (backend) → constrained JSON filters
3. **Deterministic retrieval + scoring** (SQL + rules)
4. **Optional explanation** (small AI-generated text from retrieved rows only)

This gives NLP flexibility without introducing semantic retrieval or embeddings yet.

## API design for `POST /api/search`

### Request
```json
{ "query": "late high value orders" }
```

### Response
```json
{
  "parsed": {
    "customer": "",
    "statuses": ["production"],
    "lateOnly": true,
    "rushOnly": false,
    "minValue": 1000,
    "stalledProductionDays": 7,
    "dateRange": "this_week",
    "limit": 100
  },
  "summary": {
    "total": 14,
    "critical": 3,
    "highValue": 8,
    "queryLabel": "Late high-value orders in production"
  },
  "results": [
    {
      "id": 42,
      "jobNumber": "JB-5042",
      "customer": "Warner Bros",
      "status": "production",
      "requestedShipDate": "2026-02-24",
      "value": 8600,
      "daysInProduction": 11,
      "isLate": true,
      "score": 0.91,
      "reasons": ["late", "high_value", "stalled_prod"]
    }
  ],
  "explanation": "14 matching orders. Top risk cluster is late + stalled in production."
}
```

## LLM parser contract (strict JSON)
Use existing OpenAI setup to parse query text into a small schema:
- `customer` (string | null)
- `statuses` (enum array)
- `lateOnly` (boolean)
- `rushOnly` (boolean)
- `minValue` (number | null)
- `stalledProductionDays` (number | null)
- `dateRange` (`today|this_week|overdue|none`)
- `sortBy` (`risk|value|ship_date`)
- `limit` (number)

Guardrails:
- Validate with runtime schema (e.g., Zod) and defaults.
- If parse fails, fall back to deterministic keyword heuristics.
- Never let the LLM emit SQL.

## Deterministic retrieval + scoring

### Retrieval
Build SQL from validated filters only:
- Customer match (exact/ILIKE)
- Status inclusion
- Late/rush toggles
- Value threshold
- Stalled production threshold
- Date window clause

### Scoring
Rank in code with transparent additive rules (example):
- `+0.40` late
- `+0.25` days in production > threshold
- `+0.20` high value
- `+0.15` VIP customer
- `+0.10` rush with missing proof

Return a `reasons[]` array so UI can show why each order ranked high.

## Frontend behavior
- Header search is globally visible on dashboard.
- Press Enter or click search icon to execute.
- Show loading skeletons and empty state suggestions:
  - “Try: orders stuck in production”
  - “Try: orders for Warner Bros”
- Keep current dashboard widgets visible, but place search results as the primary pane.

## Acceptance criteria for Phase 1
1. Search input is top-level and visually primary.
2. Natural language queries return deterministic table results.
3. Parser output is inspectable (for debugging confidence).
4. Results include transparent score + reason tags.
5. Queries from sprint brief work:
   - `late high value orders`
   - `orders stuck in production`
   - `rush orders this week`
   - `orders for Warner Bros`

## Delivery sequence (2 focused days)

### Day 1
- Add `/api/search` endpoint skeleton.
- Implement parser schema + fallback heuristics.
- Implement SQL filter builder and ranking rules.
- Add endpoint tests for parser normalization + query assembly.

### Day 2
- Add header search UI and result table wiring.
- Add summary strip + explanation text.
- Add telemetry logs for query, parse confidence, result count.
- Polish empty/loading/error states.

## Out of scope (intentionally)
- Embeddings/vector search
- Full agentic workflow execution
- Cross-document RAG pipeline

This keeps Phase 1 focused on retrieval reliability and operator trust.
