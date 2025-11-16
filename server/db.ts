import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

let pool: Pool | null = null;
let db: any = null;

export function initDb(connectionString?: string) {
  const conn = connectionString || process.env.DATABASE_URL;
  if (!conn) throw new Error("DATABASE_URL not provided");
  if (!pool) {
    pool = new Pool({ connectionString: conn });
    db = drizzle(pool);
  }
  return db;
}

export function getDb() {
  if (!db) throw new Error("DB not initialized. Call initDb() first.");
  return db;
}
