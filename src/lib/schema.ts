import {
    sqliteTable,
    text,
    integer,
    real,
    index,
} from "drizzle-orm/sqlite-core";

// ─── Customers ───────────────────────────────────────────────────────────────

export const customers = sqliteTable(
    "customers",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        company: text("company").notNull(),
        contactPerson: text("contact_person").notNull(),
        phone: text("phone"),
        email: text("email"),
        lifetimeValue: real("lifetime_value").default(0),
        /** "normal" | "high" | "VIP" */
        customerPriority: text("customer_priority").notNull().default("normal"),
    },
    (t) => [index("idx_customers_priority").on(t.customerPriority)]
);

// ─── Orders ──────────────────────────────────────────────────────────────────

export const orders = sqliteTable(
    "orders",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        jobNumber: text("job_number").notNull().unique(),
        orderNumber: text("order_number").notNull(),
        /** e.g. "In Production", "Awaiting Proof", "Ready to Ship", "Completed" */
        status: text("status").notNull(),
        isCompleted: integer("is_completed", { mode: "boolean" })
            .notNull()
            .default(false),
        /** e.g. "normal" | "rush" */
        priority: text("priority").notNull().default("normal"),
        description: text("description"),
        comment: text("comment"),
        dateEntered: text("date_entered").notNull(), // ISO 8601
        requestedShipDate: text("requested_ship_date").notNull(), // YYYY-MM-DD
        approvedBy: text("approved_by"),
        approvedDate: text("approved_date"),
        customerId: integer("customer_id")
            .notNull()
            .references(() => customers.id),
    },
    (t) => [
        index("idx_orders_customer").on(t.customerId),
        index("idx_orders_status").on(t.status),
        index("idx_orders_ship_date").on(t.requestedShipDate),
        index("idx_orders_completed").on(t.isCompleted),
    ]
);

// ─── Pricing ─────────────────────────────────────────────────────────────────

export const orderPricing = sqliteTable("order_pricing", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
        .notNull()
        .unique()
        .references(() => orders.id),
    subtotal: real("subtotal").notNull().default(0),
    salesTax: real("sales_tax").notNull().default(0),
    totalDue: real("total_due").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
});

// ─── Shipments ───────────────────────────────────────────────────────────────

export const shipments = sqliteTable(
    "shipments",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        orderId: integer("order_id")
            .notNull()
            .references(() => orders.id),
        shipmentNumber: integer("shipment_number").notNull().default(1),
        status: text("status").notNull().default("Pending"),
        shippingMethod: text("shipping_method"),
        trackingNumber: text("tracking_number"),
        // Ship-to address
        shipToCompany: text("ship_to_company"),
        shipToStreet: text("ship_to_street"),
        shipToCity: text("ship_to_city"),
        shipToState: text("ship_to_state"),
        shipToZip: text("ship_to_zip"),
        shipToCountry: text("ship_to_country").default("US"),
        // Contact
        contactName: text("contact_name"),
        contactPhone: text("contact_phone"),
        contactEmail: text("contact_email"),
        specialInstructions: text("special_instructions"),
    },
    (t) => [index("idx_shipments_order").on(t.orderId)]
);

// ─── Line Items ───────────────────────────────────────────────────────────────

export const lineItems = sqliteTable(
    "line_items",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        orderId: integer("order_id")
            .notNull()
            .references(() => orders.id),
        assetSKU: text("asset_sku"),
        description: text("description").notNull(),
        category: text("category"),
        quantity: real("quantity").notNull().default(1),
        unitPrice: real("unit_price").notNull().default(0),
        totalPrice: real("total_price").notNull().default(0),
        comment: text("comment"),
        status: text("status"),
        hasImage: integer("has_image", { mode: "boolean" }).default(false),
        hasPDF: integer("has_pdf", { mode: "boolean" }).default(false),
    },
    (t) => [index("idx_line_items_order").on(t.orderId)]
);

// ─── Workflow ─────────────────────────────────────────────────────────────────

export const orderWorkflow = sqliteTable("order_workflow", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
        .notNull()
        .unique()
        .references(() => orders.id),
    hasJobFiles: integer("has_job_files", { mode: "boolean" }).default(false),
    hasProof: integer("has_proof", { mode: "boolean" }).default(false),
    hasPackingSlip: integer("has_packing_slip", { mode: "boolean" }).default(
        false
    ),
    needsPanels: integer("needs_panels", { mode: "boolean" }).default(false),
    isRush: integer("is_rush", { mode: "boolean" }).default(false),
});

// ─── Production ──────────────────────────────────────────────────────────────

export const orderProduction = sqliteTable("order_production", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
        .notNull()
        .unique()
        .references(() => orders.id),
    daysInProduction: integer("days_in_production").default(0),
    estimatedCompletionDate: text("estimated_completion_date"),
    productionNotes: text("production_notes"),
});

// ─── Metadata ────────────────────────────────────────────────────────────────

export const orderMetadata = sqliteTable(
    "order_metadata",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        orderId: integer("order_id")
            .notNull()
            .unique()
            .references(() => orders.id),
        lastUpdated: text("last_updated").notNull(), // ISO 8601
        department: text("department"),
        /** "simple" | "moderate" | "complex" */
        complexity: text("complexity").default("moderate"),
        isLate: integer("is_late", { mode: "boolean" }).default(false),
    },
    (t) => [index("idx_metadata_late").on(t.isLate)]
);

// ─── Tags (order_tags) ────────────────────────────────────────────────────────

export const orderTags = sqliteTable(
    "order_tags",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        orderId: integer("order_id")
            .notNull()
            .references(() => orders.id),
        tag: text("tag").notNull(),
    },
    (t) => [index("idx_tags_order").on(t.orderId)]
);

// ─── Risk Flags (order_risk_flags) ───────────────────────────────────────────

export const orderRiskFlags = sqliteTable(
    "order_risk_flags",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        orderId: integer("order_id")
            .notNull()
            .references(() => orders.id),
        flag: text("flag").notNull(),
    },
    (t) => [index("idx_risk_order").on(t.orderId)]
);

// ─── Type Exports ─────────────────────────────────────────────────────────────

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type OrderPricing = typeof orderPricing.$inferSelect;
export type Shipment = typeof shipments.$inferSelect;
export type LineItem = typeof lineItems.$inferSelect;
export type OrderWorkflow = typeof orderWorkflow.$inferSelect;
export type OrderProduction = typeof orderProduction.$inferSelect;
export type OrderMetadata = typeof orderMetadata.$inferSelect;
