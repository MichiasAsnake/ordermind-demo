/**
 * Migration runner — creates all tables from schema.ts using raw SQL
 * via better-sqlite3. Run with: npx tsx src/lib/migrate.ts
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../ordermind.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const migrations = sqlite.transaction(() => {
    sqlite.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      contact_person TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      lifetime_value REAL DEFAULT 0,
      customer_priority TEXT NOT NULL DEFAULT 'normal'
    );
    CREATE INDEX IF NOT EXISTS idx_customers_priority ON customers(customer_priority);

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_number TEXT NOT NULL UNIQUE,
      order_number TEXT NOT NULL,
      status TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'normal',
      description TEXT,
      comment TEXT,
      date_entered TEXT NOT NULL,
      requested_ship_date TEXT NOT NULL,
      approved_by TEXT,
      approved_date TEXT,
      customer_id INTEGER NOT NULL REFERENCES customers(id)
    );
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_ship_date ON orders(requested_ship_date);
    CREATE INDEX IF NOT EXISTS idx_orders_completed ON orders(is_completed);

    CREATE TABLE IF NOT EXISTS order_pricing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
      subtotal REAL NOT NULL DEFAULT 0,
      sales_tax REAL NOT NULL DEFAULT 0,
      total_due REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD'
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      shipment_number INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'Pending',
      shipping_method TEXT,
      tracking_number TEXT,
      ship_to_company TEXT,
      ship_to_street TEXT,
      ship_to_city TEXT,
      ship_to_state TEXT,
      ship_to_zip TEXT,
      ship_to_country TEXT DEFAULT 'US',
      contact_name TEXT,
      contact_phone TEXT,
      contact_email TEXT,
      special_instructions TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);

    CREATE TABLE IF NOT EXISTS line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      asset_sku TEXT,
      description TEXT NOT NULL,
      category TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      comment TEXT,
      status TEXT,
      has_image INTEGER DEFAULT 0,
      has_pdf INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_line_items_order ON line_items(order_id);

    CREATE TABLE IF NOT EXISTS order_workflow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
      has_job_files INTEGER DEFAULT 0,
      has_proof INTEGER DEFAULT 0,
      has_packing_slip INTEGER DEFAULT 0,
      needs_panels INTEGER DEFAULT 0,
      is_rush INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS order_production (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
      days_in_production INTEGER DEFAULT 0,
      estimated_completion_date TEXT,
      production_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS order_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
      last_updated TEXT NOT NULL,
      department TEXT,
      complexity TEXT DEFAULT 'moderate',
      is_late INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_metadata_late ON order_metadata(is_late);

    CREATE TABLE IF NOT EXISTS order_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      tag TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tags_order ON order_tags(order_id);

    CREATE TABLE IF NOT EXISTS order_risk_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      flag TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_risk_order ON order_risk_flags(order_id);
  `);
});

migrations();
console.log("✅ Migration complete — all tables created at:", DB_PATH);
sqlite.close();
