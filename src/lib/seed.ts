/**
 * Synapto Demo — Seed Script
 *
 * Generates ~200 dramatic orders across 50 customers with embedded
 * risk scenarios to power the risk engine and dashboard demo.
 *
 * Run: npx tsx src/lib/seed.ts
 */

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.resolve(process.cwd(), "ordermind.db");
const db = new Database(DB_PATH);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const today = new Date("2026-02-22");

function daysAgo(n: number): string {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d.toISOString();
}

function daysFromNow(n: number): string {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
}

function daysAgoDate(n: number): string {
    return daysAgo(n).split("T")[0];
}

function rand<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals = 2): number {
    return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

// ─── Customer Data ────────────────────────────────────────────────────────────

const VIP_CUSTOMERS = [
    { company: "Nike LA", contact: "Jordan Marsh", phone: "310-555-0101", email: "jmarsh@nike.com", ltv: 128000, priority: "VIP" },
    { company: "Adidas West", contact: "Sara Kim", phone: "323-555-0182", email: "skim@adidas.com", ltv: 94000, priority: "VIP" },
    { company: "UCLA Athletics", contact: "Marcus Bell", phone: "310-555-0247", email: "mbell@uclaathletics.edu", ltv: 76000, priority: "VIP" },
    { company: "Red Bull Racing", contact: "Ali Torres", phone: "818-555-0319", email: "atorres@redbull.com", ltv: 112000, priority: "VIP" },
    { company: "Spotify HQ", contact: "Devon Crane", phone: "424-555-0403", email: "dcrane@spotify.com", ltv: 61000, priority: "VIP" },
];

const HIGH_CUSTOMERS = [
    { company: "LA Clippers", contact: "Tina Wu", phone: "213-555-0521", email: "twu@clippers.com", ltv: 48000, priority: "high" },
    { company: "Puma West Coast", contact: "Greg Neal", phone: "310-555-0614", email: "gneal@puma.com", ltv: 39000, priority: "high" },
    { company: "Trader Joe's Corp", contact: "Maria Lopez", phone: "626-555-0728", email: "mlopez@traderjoes.com", ltv: 52000, priority: "high" },
    { company: "Riot Games", contact: "Kai Sterling", phone: "310-555-0815", email: "ksterling@riotgames.com", ltv: 44000, priority: "high" },
    { company: "Warner Bros", contact: "Casey Fiore", phone: "818-555-0933", email: "cfiore@wb.com", ltv: 37000, priority: "high" },
    { company: "Lyft West", contact: "Drew Park", phone: "415-555-0112", email: "dpark@lyft.com", ltv: 29000, priority: "high" },
    { company: "Snap Inc.", contact: "Riley Chang", phone: "310-555-0226", email: "rchang@snap.com", ltv: 33000, priority: "high" },
    { company: "SoFi Stadium Events", contact: "Brook Mason", phone: "424-555-0314", email: "bmason@sofistadium.com", ltv: 55000, priority: "high" },
    { company: "Universal Music", contact: "Alex Reyes", phone: "818-555-0418", email: "areyes@universalmusic.com", ltv: 28000, priority: "high" },
    { company: "Paramount Pictures", contact: "Sam Okafor", phone: "323-555-0502", email: "sokafor@paramount.com", ltv: 41000, priority: "high" },
];

const NORMAL_COMPANIES = [
    "SoCal Realty Group", "Pacific Dental", "Brentwood Yoga Co", "Harbor Freight Local",
    "Santa Monica Surf Shop", "Silver Lake Print Co", "Pasadena Med Spa", "Long Beach Marina Events",
    "Culver City Schools", "El Monte Auto Parts", "Burbank Theater Arts", "Glendale Coffee Roasters",
    "Torrance Soccer League", "Hawthorne Construction", "Norwalk Community Center",
    "Compton Youth Alliance", "Inglewood Sports Club", "Westwood Law Group",
    "Hermosa Beach Events", "Manhattan Beach Fitness", "Redondo Surf Club",
    "Sherman Oaks Wellness", "Studio City Arts", "Chatsworth Industrial",
    "Granada Hills Soccer", "Northridge Academy", "Van Nuys Auto Detail",
    "Encino Dentistry", "Tarzana Med Group", "Woodland Hills Tennis",
    "Calabasas Events", "Malibu Beach Club", "Pacific Palisades HOA",
    "Venice Arts Collective",
    "Playa Vista Tech",
];

const PRODUCT_DESCRIPTIONS = [
    "Custom Embroidered Jersey",
    "Vinyl Banner 4'x8'",
    "Corporate Polo Shirts",
    "Screen Print T-Shirts",
    "Event Wristbands (1000 ct)",
    "Retractable Banner Stand",
    "Trade Show Table Cover",
    "Embroidered Hats - Structured",
    "Mesh Safety Vests",
    "Promotional Tote Bags",
    "Window Cling Graphics",
    "Wall Decal Lettering",
    "Vehicle Magnetic Signs",
    "Corrugated Yard Signs (25 ct)",
    "Floor Standing A-Frame",
    "Custom Fleece Hoodies",
    "Dri-Fit Sport Polos",
    "Foam Board Displays",
    "Step & Repeat Banner 8'x8'",
    "Spiral Notebooks (Branded)",
];

const DEPARTMENTS = ["Embroidery", "Screen Print", "Wide Format", "Finishing", "Shipping"];
const SHIPPING_METHODS = ["UPS Ground", "FedEx 2-Day", "Customer Pickup", "USPS Priority", "Courier Same Day"];
const STATES = ["CA", "NV", "AZ"];

// ─── Insert Helpers ───────────────────────────────────────────────────────────

function insertCustomer(c: {
    company: string; contact: string; phone: string; email: string; ltv: number; priority: string;
}): number {
    const stmt = db.prepare(`
        INSERT INTO customers (company, contact_person, phone, email, lifetime_value, customer_priority)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(c.company, c.contact, c.phone, c.email, c.ltv, c.priority);
    return result.lastInsertRowid as number;
}

let orderCounter = 4800;
function nextJobNumber(): { job: string; order: string } {
    orderCounter++;
    return { job: `JB-${orderCounter}`, order: `ORD-${orderCounter}` };
}

interface OrderSpec {
    customerId: number;
    status: string;
    priority: "normal" | "rush";
    description: string;
    comment: string | null;
    dateEntered: string;   // ISO
    requestedShipDate: string; // YYYY-MM-DD
    approvedBy: string | null;
    approvedDate: string | null;
    isCompleted: boolean;
    isRush: boolean;
    hasProof: boolean;
    hasJobFiles: boolean;
    daysInProduction: number;
    isLate: boolean;
    complexity: "simple" | "moderate" | "complex";
    department: string;
    subtotal: number;
    lineItems: { description: string; qty: number; price: number }[];
    shippingMethod: string;
    city: string;
    state: string;
}

function insertOrder(spec: OrderSpec): number {
    const { job, order } = nextJobNumber();
    const subtotal = spec.subtotal;
    const tax = parseFloat((subtotal * 0.0925).toFixed(2));
    const total = parseFloat((subtotal + tax).toFixed(2));
    const lastUpdated = daysAgo(randInt(0, 3));

    // orders
    const orderStmt = db.prepare(`
        INSERT INTO orders (job_number, order_number, status, is_completed, priority, description, comment,
            date_entered, requested_ship_date, approved_by, approved_date, customer_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const orderResult = orderStmt.run(
        job, order, spec.status, spec.isCompleted ? 1 : 0, spec.priority,
        spec.description, spec.comment,
        spec.dateEntered, spec.requestedShipDate,
        spec.approvedBy, spec.approvedDate,
        spec.customerId
    );
    const orderId = orderResult.lastInsertRowid as number;

    // pricing
    db.prepare(`INSERT INTO order_pricing (order_id, subtotal, sales_tax, total_due, currency) VALUES (?, ?, ?, ?, 'USD')`)
        .run(orderId, subtotal, tax, total);

    // workflow
    db.prepare(`INSERT INTO order_workflow (order_id, has_job_files, has_proof, has_packing_slip, needs_panels, is_rush)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(orderId, spec.hasJobFiles ? 1 : 0, spec.hasProof ? 1 : 0, 0, 0, spec.isRush ? 1 : 0);

    // production
    const estComplete = spec.daysInProduction > 5
        ? daysFromNow(randInt(1, 4))
        : daysFromNow(randInt(2, 7));
    db.prepare(`INSERT INTO order_production (order_id, days_in_production, estimated_completion_date, production_notes)
        VALUES (?, ?, ?, ?)`)
        .run(orderId, spec.daysInProduction, estComplete, null);

    // metadata
    db.prepare(`INSERT INTO order_metadata (order_id, last_updated, department, complexity, is_late)
        VALUES (?, ?, ?, ?, ?)`)
        .run(orderId, lastUpdated, spec.department, spec.complexity, spec.isLate ? 1 : 0);

    // line items
    for (const li of spec.lineItems) {
        const liTotal = parseFloat((li.qty * li.price).toFixed(2));
        db.prepare(`INSERT INTO line_items (order_id, description, quantity, unit_price, total_price, has_image, has_pdf)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(orderId, li.description, li.qty, li.price, liTotal, 1, spec.hasProof ? 1 : 0);
    }

    // shipment
    db.prepare(`INSERT INTO shipments (order_id, shipment_number, status, shipping_method, ship_to_company,
            ship_to_city, ship_to_state, ship_to_country)
        VALUES (?, 1, ?, ?, ?, ?, ?, 'US')`)
        .run(orderId, spec.isCompleted ? "Delivered" : "Pending",
            spec.shippingMethod, spec.description.split(" ").slice(0, 2).join(" "),
            spec.city, spec.state);

    return orderId;
}

// ─── Wipe Existing Data ───────────────────────────────────────────────────────

function wipeData() {
    const tables = [
        "order_risk_flags", "order_tags", "order_metadata", "order_production",
        "order_workflow", "shipments", "line_items", "order_pricing", "orders", "customers"
    ];
    for (const t of tables) {
        db.prepare(`DELETE FROM ${t}`).run();
    }
    console.log("✓ Wiped existing data");
}

// ─── Main Seed ────────────────────────────────────────────────────────────────

function seed() {
    console.log("🌱 Seeding Synapto demo database...\n");

    db.prepare("PRAGMA foreign_keys = ON").run();
    wipeData();

    const customerIds: { id: number; priority: string }[] = [];

    // 5 VIP customers
    for (const c of VIP_CUSTOMERS) {
        const id = insertCustomer(c);
        customerIds.push({ id, priority: "VIP" });
    }

    // 10 high-value customers
    for (const c of HIGH_CUSTOMERS) {
        const id = insertCustomer(c);
        customerIds.push({ id, priority: "high" });
    }

    // 35 normal customers
    for (const comp of NORMAL_COMPANIES) {
        const id = insertCustomer({
            company: comp,
            contact: `${rand(["Tom", "Jane", "Carlos", "Priya", "Sam"])} ${rand(["Smith", "Johnson", "Garcia", "Lee", "Brown"])}`,
            phone: `${rand(["213", "310", "323", "424", "562"])}-555-${randInt(1000, 9999)}`,
            email: `orders@${comp.toLowerCase().replace(/\s+/g, "")}.com`,
            ltv: randFloat(3000, 22000, 0),
            priority: "normal",
        });
        customerIds.push({ id, priority: "normal" });
    }

    console.log(`✓ Inserted ${customerIds.length} customers`);

    // ── Helper to get customer IDs by priority ──
    const vipIds = customerIds.filter(c => c.priority === "VIP").map(c => c.id);
    const highIds = customerIds.filter(c => c.priority === "high").map(c => c.id);
    const normalIds = customerIds.filter(c => c.priority === "normal").map(c => c.id);

    let orderCount = 0;

    // ────────────────────────────────────────────────────────────
    // SCENARIO A: VIP + Late (Tier 1) — 5 orders
    // ────────────────────────────────────────────────────────────
    const vipLateComments = [
        "VIP customer — Nike trade show next week. DO NOT SLIP.",
        "VIP customer — Adidas rep will be on-site Friday to inspect.",
        "VIP customer account. Third revision requested by client.",
        "VIP customer — Rush added after approval. Sponsor event Thursday.",
        "VIP customer — Needs before annual event. Escalate immediately.",
    ];
    for (let i = 0; i < 5; i++) {
        insertOrder({
            customerId: vipIds[i],
            status: "In Production",
            priority: "rush",
            description: rand(PRODUCT_DESCRIPTIONS),
            comment: vipLateComments[i],
            dateEntered: daysAgo(randInt(12, 18)),
            requestedShipDate: daysAgoDate(randInt(2, 5)), // overdue
            approvedBy: "Sales Team",
            approvedDate: daysAgoDate(randInt(8, 12)),
            isCompleted: false,
            isRush: true,
            hasProof: false,
            hasJobFiles: true,
            daysInProduction: randInt(8, 14),
            isLate: true,
            complexity: "complex",
            department: rand(DEPARTMENTS),
            subtotal: randFloat(3200, 9800, 2),
            lineItems: [
                { description: rand(PRODUCT_DESCRIPTIONS), qty: randInt(50, 300), price: randFloat(12, 45, 2) },
                { description: "Setup Fee", qty: 1, price: randFloat(35, 85, 2) },
            ],
            shippingMethod: "FedEx 2-Day",
            city: "Los Angeles",
            state: "CA",
        });
        orderCount++;
    }
    console.log("  ✓ Scenario A: VIP + Late (5 orders)");

    // ────────────────────────────────────────────────────────────
    // SCENARIO B: Large Order + Late (Tier 2) — 5 orders
    // ────────────────────────────────────────────────────────────
    const largeOrderComments = [
        "Large order — client confirmed pickup Thursday. Already past due.",
        "Largest order this quarter. Production stalled, waiting on substrate.",
        "Big event order. Client called twice asking for status.",
        "Large order. Rush added after proof sign-off. Ship date missed.",
        "High-value account. Three line items still not started.",
    ];
    for (let i = 0; i < 5; i++) {
        const cid = rand([...vipIds, ...highIds]);
        insertOrder({
            customerId: cid,
            status: "In Production",
            priority: "normal",
            description: rand(PRODUCT_DESCRIPTIONS),
            comment: largeOrderComments[i],
            dateEntered: daysAgo(randInt(14, 20)),
            requestedShipDate: daysAgoDate(randInt(1, 4)),
            approvedBy: "Sales Team",
            approvedDate: daysAgoDate(randInt(10, 15)),
            isCompleted: false,
            isRush: false,
            hasProof: true,
            hasJobFiles: true,
            daysInProduction: randInt(6, 12),
            isLate: true,
            complexity: "complex",
            department: rand(DEPARTMENTS),
            subtotal: randFloat(5200, 12500, 2),
            lineItems: [
                { description: rand(PRODUCT_DESCRIPTIONS), qty: randInt(200, 500), price: randFloat(8, 22, 2) },
                { description: rand(PRODUCT_DESCRIPTIONS), qty: randInt(100, 200), price: randFloat(15, 35, 2) },
                { description: "Rush Setup", qty: 1, price: randFloat(75, 150, 2) },
            ],
            shippingMethod: "UPS Ground",
            city: rand(["Burbank", "Glendale", "Pasadena", "Long Beach"]),
            state: "CA",
        });
        orderCount++;
    }
    console.log("  ✓ Scenario B: Large Order + Late (5 orders)");

    // ────────────────────────────────────────────────────────────
    // SCENARIO C: Rush + No Proof (Tier 3) — 12 orders
    // ────────────────────────────────────────────────────────────
    const rushNoProofComments = [
        "Rush added after approval. Proof not yet sent to client.",
        "Client requested rush, artwork still pending approval.",
        "Rush order — no proof on file. Needs sign-off before production.",
        "Rushed in 3 days ago. No proof approved yet. Production waiting.",
        "Event deadline Friday. Rush status, but proof still in revision.",
        "Rush added after initial order. Client unresponsive to proof emails.",
        "No proof on file. Customer insists on ship date anyway.",
        "Third attempt at proof — client keeps revising. Rush flag active.",
        "Rush submitted without artwork. Using previous version — risky.",
        "Rush order, proof sent but no approval. Do not print until confirmed.",
        "Client verbal approval only. No signed proof. Proceeding at risk.",
        "Rush — needs before event. Proof email bounced, phone only.",
    ];
    for (let i = 0; i < 12; i++) {
        const cid = rand([...vipIds, ...highIds, ...normalIds]);
        const daysUntilDue = randInt(0, 3);
        insertOrder({
            customerId: cid,
            status: "Awaiting Proof",
            priority: "rush",
            description: rand(PRODUCT_DESCRIPTIONS),
            comment: rushNoProofComments[i],
            dateEntered: daysAgo(randInt(2, 6)),
            requestedShipDate: daysFromNow(daysUntilDue),
            approvedBy: null,
            approvedDate: null,
            isCompleted: false,
            isRush: true,
            hasProof: false,
            hasJobFiles: true,
            daysInProduction: randInt(0, 3),
            isLate: daysUntilDue === 0,
            complexity: rand(["simple", "moderate"]) as "simple" | "moderate",
            department: rand(DEPARTMENTS),
            subtotal: randFloat(380, 2400, 2),
            lineItems: [
                { description: rand(PRODUCT_DESCRIPTIONS), qty: randInt(12, 100), price: randFloat(10, 30, 2) },
            ],
            shippingMethod: rand(SHIPPING_METHODS),
            city: rand(["Santa Monica", "Culver City", "El Segundo", "Torrance", "Hawthorne"]),
            state: "CA",
        });
        orderCount++;
    }
    console.log("  ✓ Scenario C: Rush + No Proof (12 orders)");

    // ────────────────────────────────────────────────────────────
    // SCENARIO D: Due within 48h + Missing Requirements (Tier 4) — 8 orders
    // ────────────────────────────────────────────────────────────
    const missingReqComments = [
        "Due tomorrow — still missing PMS color spec from client.",
        "Ship date in 36h. Vector artwork not received.",
        "Client hasn't confirmed shirt sizes. Due in 2 days.",
        "Due tomorrow — packing slip address not confirmed.",
        "Missing embroidery file digitization — due in 48h.",
        "Client needs to confirm quantity split before we can print. Due soon.",
        "Shipping address unconfirmed. Due within 2 days.",
        "Color match approval pending. Delivering in 2 days.",
    ];
    for (let i = 0; i < 8; i++) {
        const cid = rand([...highIds, ...normalIds]);
        insertOrder({
            customerId: cid,
            status: "Awaiting Proof",
            priority: rand(["normal", "rush"]) as "normal" | "rush",
            description: rand(PRODUCT_DESCRIPTIONS),
            comment: missingReqComments[i],
            dateEntered: daysAgo(randInt(5, 10)),
            requestedShipDate: daysFromNow(randInt(1, 2)),
            approvedBy: null,
            approvedDate: null,
            isCompleted: false,
            isRush: false,
            hasProof: false,
            hasJobFiles: false,
            daysInProduction: randInt(1, 4),
            isLate: false,
            complexity: "moderate",
            department: rand(DEPARTMENTS),
            subtotal: randFloat(250, 1800, 2),
            lineItems: [
                { description: rand(PRODUCT_DESCRIPTIONS), qty: randInt(10, 80), price: randFloat(8, 28, 2) },
            ],
            shippingMethod: rand(SHIPPING_METHODS),
            city: rand(["Burbank", "Glendale", "Alhambra", "Monrovia"]),
            state: "CA",
        });
        orderCount++;
    }
    console.log("  ✓ Scenario D: Due 48h + Missing Req (8 orders)");

    // ────────────────────────────────────────────────────────────
    // SCENARIO E: Days in Production > 7 (Tier 5) — 7 orders
    // ────────────────────────────────────────────────────────────
    const stalledComments = [
        "In production for 9 days — substrate back-ordered.",
        "Stalled in embroidery queue — machine maintenance week.",
        "Wide format shifted to back of line twice. Now 11 days.",
        "Waiting on specialty ink restock. 8 days in production.",
        "Production note: fabric delayed from supplier. 10 days.",
        null,
        "Long run — complex multi-location embroidery. Day 8.",
    ];
    for (let i = 0; i < 7; i++) {
        const dip = randInt(8, 13);
        const cid = rand([...normalIds]);
        insertOrder({
            customerId: cid,
            status: "In Production",
            priority: "normal",
            description: rand(PRODUCT_DESCRIPTIONS),
            comment: stalledComments[i],
            dateEntered: daysAgo(dip + randInt(1, 3)),
            requestedShipDate: daysFromNow(randInt(0, 3)),
            approvedBy: "Sales Team",
            approvedDate: daysAgoDate(dip - 1),
            isCompleted: false,
            isRush: false,
            hasProof: true,
            hasJobFiles: true,
            daysInProduction: dip,
            isLate: randInt(0, 1) === 1,
            complexity: rand(["moderate", "complex"]) as "moderate" | "complex",
            department: rand(DEPARTMENTS),
            subtotal: randFloat(600, 3200, 2),
            lineItems: [
                { description: rand(PRODUCT_DESCRIPTIONS), qty: randInt(30, 150), price: randFloat(10, 25, 2) },
                { description: "Digitizing Fee", qty: 1, price: randFloat(40, 100, 2) },
            ],
            shippingMethod: rand(SHIPPING_METHODS),
            city: rand(["Torrance", "Hawthorne", "Compton", "Inglewood"]),
            state: "CA",
        });
        orderCount++;
    }
    console.log("  ✓ Scenario E: Days in Production > 7 (7 orders)");

    // ────────────────────────────────────────────────────────────
    // SCENARIO F: Late, normal-priority orders (non-VIP) — 8 orders
    // ────────────────────────────────────────────────────────────
    for (let i = 0; i < 8; i++) {
        const cid = rand(normalIds);
        insertOrder({
            customerId: cid,
            status: rand(["In Production", "Ready to Ship"]),
            priority: "normal",
            description: rand(PRODUCT_DESCRIPTIONS),
            comment: rand([
                "Client will pick up when ready.",
                null,
                "Store opening event — late is a problem.",
                "Waiting on client to schedule delivery.",
                null,
            ]),
            dateEntered: daysAgo(randInt(10, 16)),
            requestedShipDate: daysAgoDate(randInt(1, 5)),
            approvedBy: "Sales Team",
            approvedDate: daysAgoDate(randInt(8, 12)),
            isCompleted: false,
            isRush: false,
            hasProof: true,
            hasJobFiles: true,
            daysInProduction: randInt(5, 9),
            isLate: true,
            complexity: rand(["simple", "moderate"]) as "simple" | "moderate",
            department: rand(DEPARTMENTS),
            subtotal: randFloat(200, 1600, 2),
            lineItems: [
                { description: rand(PRODUCT_DESCRIPTIONS), qty: randInt(12, 100), price: randFloat(6, 20, 2) },
            ],
            shippingMethod: rand(SHIPPING_METHODS),
            city: rand(["Burbank", "Van Nuys", "Northridge", "Chatsworth"]),
            state: "CA",
        });
        orderCount++;
    }
    console.log("  ✓ Scenario F: Late Normal Orders (8 orders)");

    // ────────────────────────────────────────────────────────────
    // SCENARIO G: Rush orders WITH proof (healthy, no risk flag) — 10 orders
    // ────────────────────────────────────────────────────────────
    for (let i = 0; i < 10; i++) {
        const cid = rand([...highIds, ...normalIds]);
        insertOrder({
            customerId: cid,
            status: "In Production",
            priority: "rush",
            description: rand(PRODUCT_DESCRIPTIONS),
            comment: rand(["Rush — all files received.", "Tight deadline but everything in order.", null]),
            dateEntered: daysAgo(randInt(2, 5)),
            requestedShipDate: daysFromNow(randInt(1, 3)),
            approvedBy: "Sales Team",
            approvedDate: daysAgoDate(randInt(1, 3)),
            isCompleted: false,
            isRush: true,
            hasProof: true,
            hasJobFiles: true,
            daysInProduction: randInt(1, 4),
            isLate: false,
            complexity: rand(["simple", "moderate"]) as "simple" | "moderate",
            department: rand(DEPARTMENTS),
            subtotal: randFloat(300, 1800, 2),
            lineItems: [
                { description: rand(PRODUCT_DESCRIPTIONS), qty: randInt(12, 80), price: randFloat(8, 22, 2) },
            ],
            shippingMethod: rand(SHIPPING_METHODS),
            city: rand(["Culver City", "El Segundo", "Playa Vista"]),
            state: "CA",
        });
        orderCount++;
    }
    console.log("  ✓ Scenario G: Rush + Proof OK (10 orders)");

    // ────────────────────────────────────────────────────────────
    // FILLER: Normal healthy orders to reach ~200 total
    // ────────────────────────────────────────────────────────────
    const fillerTarget = 200 - orderCount;
    for (let i = 0; i < fillerTarget; i++) {
        const cid = rand([...normalIds, ...highIds]);
        const isComp = randInt(0, 3) === 0;
        const dip = randInt(1, 5);
        insertOrder({
            customerId: cid,
            status: isComp ? "Completed" : rand(["In Production", "Awaiting Proof", "Ready to Ship"]),
            priority: "normal",
            description: rand(PRODUCT_DESCRIPTIONS),
            comment: rand([null, null, null, "Standard job.", "Repeat customer job."]),
            dateEntered: daysAgo(randInt(1, 30)),
            requestedShipDate: isComp ? daysAgoDate(randInt(1, 20)) : daysFromNow(randInt(3, 14)),
            approvedBy: isComp ? "Sales Team" : rand(["Sales Team", null]),
            approvedDate: isComp ? daysAgoDate(randInt(3, 10)) : null,
            isCompleted: isComp,
            isRush: false,
            hasProof: randInt(0, 4) !== 0,
            hasJobFiles: true,
            daysInProduction: dip,
            isLate: false,
            complexity: rand(["simple", "moderate", "moderate", "complex"]) as "simple" | "moderate" | "complex",
            department: rand(DEPARTMENTS),
            subtotal: randFloat(100, 2200, 2),
            lineItems: [
                { description: rand(PRODUCT_DESCRIPTIONS), qty: randInt(6, 120), price: randFloat(5, 30, 2) },
            ],
            shippingMethod: rand(SHIPPING_METHODS),
            city: rand(["Los Angeles", "Burbank", "Pasadena", "Long Beach", "Torrance", "Glendale"]),
            state: rand(STATES),
        });
        orderCount++;
    }
    console.log(`  ✓ Filler: Normal/Healthy Orders (${fillerTarget} orders)`);

    console.log(`\n✅ Seed complete — ${orderCount} orders inserted across ${customerIds.length} customers`);
    console.log("   Risk scenario breakdown:");
    console.log("   • VIP + Late (Tier 1):            5");
    console.log("   • Large Order + Late (Tier 2):    5");
    console.log("   • Rush + No Proof (Tier 3):       12");
    console.log("   • Due 48h + Missing Req (Tier 4): 8");
    console.log("   • Days in Production > 7 (Tier 5): 7");
    console.log("   • Late Normal Orders:              8");
    console.log("   • Rush w/ Proof (healthy):        10");
    console.log(`   • Normal/filler:                  ${fillerTarget}\n`);

    db.close();
}

seed();
