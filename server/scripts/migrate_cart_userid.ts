import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[migrate_cart_userid] DATABASE_URL not set');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check table exists
    const tRes = await client.query(
      `select 1 from information_schema.tables where table_name = 'cart_items' limit 1`
    );
    if (tRes.rowCount === 0) {
      console.log('[migrate_cart_userid] cart_items table not found — nothing to do');
      await client.query('ROLLBACK');
      return;
    }

    // Check columns
    const cRes = await client.query(
      `select column_name from information_schema.columns where table_name='cart_items'`
    );
    const cols = new Set(cRes.rows.map((r: any) => r.column_name));

    const hasSession = cols.has('session_id');
    const hasUser = cols.has('user_id');

    if (hasUser && !hasSession) {
      console.log('[migrate_cart_userid] user_id already present — nothing to do');
      await client.query('ROLLBACK');
      return;
    }

    if (!hasSession && !hasUser) {
      console.log('[migrate_cart_userid] Neither session_id nor user_id present — table may be empty schema; letting drizzle push handle it');
      await client.query('ROLLBACK');
      return;
    }

    if (hasSession && !hasUser) {
      console.log('[migrate_cart_userid] Renaming column session_id -> user_id');
      await client.query(`ALTER TABLE cart_items RENAME COLUMN session_id TO user_id;`);
      console.log('[migrate_cart_userid] Done');
      await client.query('COMMIT');
      return;
    }

    if (hasSession && hasUser) {
      console.log('[migrate_cart_userid] Both session_id and user_id exist; leaving as-is. You may want to drop session_id manually.');
      await client.query('ROLLBACK');
      return;
    }
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error('[migrate_cart_userid] Failed:', e?.message || e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
