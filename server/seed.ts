import 'dotenv/config';
import { initDb } from './db';
import { products as productsTable, users as usersTable } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { MemStorage } from './storage';
import { hashPassword } from './jwt';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const db = initDb(url);

  const existing = await db.select().from(productsTable).limit(1).execute();
  const hasAny = (existing && existing.length > 0);

  if (!hasAny) {
    const mem = new MemStorage();
    const sample = await mem.getProducts();
    if (sample.length) {
      const inserts = sample.map((p) => ({
        name: p.name,
        description: p.description,
        price: p.price,
        category: p.category,
        imageUrl: p.imageUrl,
        images: p.images,
        material: p.material,
        isPreOrder: p.isPreOrder ?? false,
        inStock: p.inStock ?? true,
        sizes: p.sizes ?? null,
      }));
      const chunkSize = 50;
      for (let i = 0; i < inserts.length; i += chunkSize) {
        const chunk = inserts.slice(i, i + chunkSize);
        await db.insert(productsTable).values(chunk);
      }
      console.log(`Seeded ${inserts.length} products`);
    }
  } else {
    console.log('Products already exist; skipping product seed');
  }

  const adminEmail = 'admin@lumiere.test';
  const adminRows = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail)).limit(1).execute();
  if (!adminRows || adminRows.length === 0) {
    const passwordHash = hashPassword('admin123');
    await db.insert(usersTable).values({
      name: 'Administrator',
      email: adminEmail,
      passwordHash,
      role: 'admin',
    });
    console.log('Seeded admin user: admin@lumiere.test / admin123');
  } else {
    console.log('Admin user exists; skipping admin seed');
  }

  console.log('Seeding complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
