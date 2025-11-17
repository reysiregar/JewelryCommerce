import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('[enable_pgcrypto] DATABASE_URL not set; skipping.');
    return;
  }
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    console.log('[enable_pgcrypto] Ensured pgcrypto extension is available.');
  } catch (err) {
    console.error('[enable_pgcrypto] Failed to enable pgcrypto:', err);
    // Re-throw so CI/build surfaces the failure if needed
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  process.exitCode = 1;
});
