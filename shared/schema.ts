import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  passwordHash: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema> & { password: string };
export type User = typeof users.$inferSelect;

export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(),
  category: text("category").notNull(),
  imageUrl: text("image_url").notNull(),
  images: text("images").array().notNull().default(sql`ARRAY[]::text[]`),
  material: text("material").notNull(),
  isPreOrder: boolean("is_pre_order").notNull().default(false),
  inStock: boolean("in_stock").notNull().default(true),
  stockQuantity: integer("stock_quantity").notNull().default(100),
  sizes: text("sizes").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  categoryIdx: sql`CREATE INDEX IF NOT EXISTS products_category_idx ON ${table} (category)`,
  inStockIdx: sql`CREATE INDEX IF NOT EXISTS products_in_stock_idx ON ${table} (in_stock)`,
}));

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const cartItems = pgTable("cart_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  size: text("size"),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (table) => ({
  userIdIdx: sql`CREATE INDEX IF NOT EXISTS cart_items_user_id_idx ON ${table} (user_id)`,
  productIdIdx: sql`CREATE INDEX IF NOT EXISTS cart_items_product_id_idx ON ${table} (product_id)`,
}));

export const insertCartItemSchema = createInsertSchema(cartItems).omit({
  id: true,
});

export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type CartItem = typeof cartItems.$inferSelect;

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  shippingAddress: text("shipping_address").notNull(),
  shippingCity: text("shipping_city").notNull(),
  shippingPostalCode: text("shipping_postal_code").notNull(),
  shippingCountry: text("shipping_country").notNull(),
  totalAmount: integer("total_amount").notNull(),
  status: text("status").notNull().default("pending"),
  isPreOrder: boolean("is_pre_order").notNull().default(false),
  paymentStatus: text("payment_status").notNull().default("pending"),
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: sql`CREATE INDEX IF NOT EXISTS orders_user_id_idx ON ${table} (user_id)`,
  createdAtIdx: sql`CREATE INDEX IF NOT EXISTS orders_created_at_idx ON ${table} (created_at)`,
  statusIdx: sql`CREATE INDEX IF NOT EXISTS orders_status_idx ON ${table} (status)`,
}));

export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id),
  productName: text("product_name").notNull(),
  productPrice: integer("product_price").notNull(),
  quantity: integer("quantity").notNull().default(1),
  size: text("size"),
}, (table) => ({
  orderIdIdx: sql`CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON ${table} (order_id)`,
  productIdIdx: sql`CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON ${table} (product_id)`,
}));

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: sql`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON ${table} (user_id)`,
}));

export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  userId: true,
  createdAt: true,
}).extend({
  customerEmail: z.string().email("Invalid email address"),
  customerPhone: z.string().min(10, "Phone number must be at least 10 characters"),
  shippingPostalCode: z.string().min(5, "Postal code must be at least 5 characters"),
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({
  id: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;
