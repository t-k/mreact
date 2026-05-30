import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const DB_PATH = join(process.cwd(), ".data", "dashboard.db");

let _db: Database.Database | undefined;

function getDb(): Database.Database {
  if (_db !== undefined) return _db;
  mkdirSync(join(process.cwd(), ".data"), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      product TEXT NOT NULL,
      revenue REAL NOT NULL,
      units INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      value REAL NOT NULL,
      recorded_at INTEGER NOT NULL
    );
  `);

  // Seed sample data if empty
  const count = (_db.prepare("SELECT COUNT(*) as c FROM sales").get() as { c: number }).c;
  if (count === 0) {
    const insertSale = _db.prepare("INSERT INTO sales (month, product, revenue, units) VALUES (?, ?, ?, ?)");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const products = ["Widget A", "Widget B", "Widget C"];
    for (const month of months) {
      for (const product of products) {
        insertSale.run(month, product, Math.round(Math.random() * 10000 + 1000), Math.floor(Math.random() * 100 + 10));
      }
    }

    const insertMetric = _db.prepare("INSERT INTO metrics (name, value, recorded_at) VALUES (?, ?, ?)");
    const now = Date.now();
    for (let i = 0; i < 30; i++) {
      insertMetric.run("page_views", Math.floor(Math.random() * 5000 + 500), now - (29 - i) * 86400000);
      insertMetric.run("conversions", Math.floor(Math.random() * 200 + 20), now - (29 - i) * 86400000);
    }
  }

  return _db;
}

export interface SaleRow {
  id: number;
  month: string;
  product: string;
  revenue: number;
  units: number;
}

export interface MetricRow {
  id: number;
  name: string;
  value: number;
  recorded_at: number;
}

export function getSales(): SaleRow[] {
  return getDb().prepare("SELECT * FROM sales ORDER BY id").all() as SaleRow[];
}

export function getSalesByProduct(): Array<{ product: string; total_revenue: number; total_units: number }> {
  return getDb().prepare(
    "SELECT product, SUM(revenue) as total_revenue, SUM(units) as total_units FROM sales GROUP BY product"
  ).all() as Array<{ product: string; total_revenue: number; total_units: number }>;
}

export function getMonthlyRevenue(): Array<{ month: string; revenue: number }> {
  return getDb().prepare(
    "SELECT month, SUM(revenue) as revenue FROM sales GROUP BY month ORDER BY id"
  ).all() as Array<{ month: string; revenue: number }>;
}

export function getMetrics(name: string): MetricRow[] {
  return getDb().prepare("SELECT * FROM metrics WHERE name = ? ORDER BY recorded_at").all(name) as MetricRow[];
}

export function addSale(month: string, product: string, revenue: number, units: number): void {
  getDb().prepare("INSERT INTO sales (month, product, revenue, units) VALUES (?, ?, ?, ?)").run(month, product, revenue, units);
}
