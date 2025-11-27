import {
  type Product,
  type InsertProduct,
  type Order,
  type InsertOrder,
  type User,
  type InsertUser,
  type CartItem,
  type InsertCartItem,
  type OrderItem,
  type InsertOrderItem,
  cartItems,
  products,
  users,
  orders,
  orderItems,
  sessions,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { initDb, getDb } from "./db";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "./jwt";

export interface IStorage {
  getProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<void>;

  getOrders(): Promise<(Order & { items: OrderItem[] })[]>;
  getOrder(id: string): Promise<(Order & { items: OrderItem[] }) | undefined>;
  createOrder(order: InsertOrder, userId: string, items: Omit<InsertOrderItem, 'orderId'>[]): Promise<Order & { items: OrderItem[] }>;
  updateOrderStatus(id: string, status: string): Promise<Order | undefined>;

  createUser(user: InsertUser): Promise<User>;
  findUserByEmail(email: string): Promise<User | undefined>;
  getUser(id: string): Promise<User | undefined>;

  createSession(userId: string): Promise<string>;
  getUserIdBySession(sessionId: string): Promise<string | undefined>;
  deleteSession(sessionId: string): Promise<void>;

  getCart(userId: string): Promise<CartItem[]>;
  addOrIncrementCartItem(userId: string, productId: string, size?: string, quantity?: number): Promise<CartItem>;
  updateCartItemQuantity(userId: string, cartItemId: string, quantity: number): Promise<CartItem | undefined>;
  removeCartItem(userId: string, cartItemId: string): Promise<void>;
  clearCart(userId: string): Promise<void>;
  deleteUser(id: string): Promise<void>;
  deleteSessionsForUser(userId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private products: Map<string, Product>;
  private orders: Map<string, Order>;
  private orderItems: Map<string, OrderItem[]>;
  private users: Map<string, User>;
  private sessions: Map<string, string>;
  private carts: Map<string, CartItem[]>;

  constructor() {
    this.products = new Map();
    this.orders = new Map();
    this.orderItems = new Map();
    this.users = new Map();
    this.sessions = new Map();
    this.carts = new Map();
    this.seedProducts();
    this.seedAdminUser();
  }

  private seedProducts() {
    const rand01 = (key: string) => {
      const crypto = require("crypto");
      const hex = crypto.createHash("sha256").update(key).digest("hex").slice(0, 8);
      const n = parseInt(hex, 16);
      return (n >>> 0) / 0xffffffff;
    };

    const categoryRange: Record<string, { min: number; max: number }> = {
      rings: { min: 1_500_000, max: 3_500_000 },
      necklaces: { min: 1_300_000, max: 2_000_000 },
      bracelets: { min: 750_000, max: 1_300_000 },
      earrings: { min: 680_000, max: 1_200_000 },
    };

    const computePriceCents = (name: string, category: string, material: string): number => {
      const range = categoryRange[category] ?? { min: 1_000_000, max: 2_000_000 };
      const r = rand01(`${name}|${category}|${material}`);
      let base = range.min + r * (range.max - range.min);
      const m = material.toLowerCase();
      let factor = 1;
      if (m.includes("diamond")) factor *= 1.5;
      if (m.includes("pearl")) factor *= 1.1;
      if (m.includes("cubic") || m.includes("zirconia")) factor *= 1.05;
      if (m.includes("onyx")) factor *= 1.05;
      if (m.includes("glass")) factor *= 0.85;
      if (m.includes("stainless")) factor *= 0.8;
      if (m.includes("silver")) factor *= 0.8;
      if (m.includes("vermeil")) factor *= 1.1;
      if (m.includes("18k")) factor *= 1.2;
      if (m.includes("14k")) factor *= 1.15;
      if (m.includes("gold plated")) factor *= 1.05;

      let priced = base * factor;
      priced = Math.min(range.max, Math.max(range.min, priced));
      const step = 50_000;
      priced = Math.round(priced / step) * step;
      return Math.round(priced * 100);
    };

    type SeedProduct = Omit<InsertProduct, "price">;
    const baseProducts: SeedProduct[] = [
      {
        name: "Rose Gold Diamond Ring",
        description:
          "Exquisite handcrafted rose gold ring featuring a brilliant-cut diamond. Perfect for engagements or special occasions. Each piece is carefully crafted by skilled artisans.",
        category: "rings",
        imageUrl: "/Rose_gold_diamond_ring_406b3b84.png",
        images: [
          "/Rose_gold_diamond_ring_406b3b84.png",
          "/Rose_gold_diamond_ring_406b3b84.png",
        ],
        material: "14K Rose Gold, Diamond",
        isPreOrder: false,
        inStock: true,
        sizes: ["5", "6", "7", "8", "9"],
      },
      {
        name: "Gold Pendant Necklace",
        description:
          "Delicate gold chain necklace with an elegant pendant. A timeless piece that complements any outfit. Crafted from premium materials.",
        category: "necklaces",
        imageUrl: "/Gold_pendant_necklace_84aa4494.png",
        images: [
          "/Gold_pendant_necklace_84aa4494.png",
          "/Gold_pendant_necklace_84aa4494.png",
        ],
        material: "18K Yellow Gold",
        isPreOrder: false,
        inStock: true,
      },
      {
        name: "Silver Charm Bracelet",
        description:
          "Elegant sterling silver bracelet with customizable charm options. A perfect gift for loved ones. Each charm tells a unique story.",
        category: "bracelets",
        imageUrl: "/Silver_charm_bracelet_db9c5a93.png",
        images: [
          "/Silver_charm_bracelet_db9c5a93.png",
          "/Silver_charm_bracelet_db9c5a93.png",
        ],
        material: "Sterling Silver",
        isPreOrder: false,
        inStock: true,
        sizes: ["S", "M", "L"],
      },
      {
        name: "Pearl Stud Earrings",
        description:
          "Classic pearl earrings set in premium metal. Timeless elegance for everyday wear. Perfect for both casual and formal occasions.",
        category: "earrings",
        imageUrl: "/Pearl_stud_earrings_00219806.png",
        images: [
          "/Pearl_stud_earrings_00219806.png",
          "/Pearl_stud_earrings_00219806.png",
        ],
        material: "Freshwater Pearl, Sterling Silver",
        isPreOrder: false,
        inStock: true,
      },
      {
        name: "Rose Gold Stackable Rings Set",
        description:
          "Set of three delicate stackable rings in rose gold. Mix and match for a personalized look. Each ring is designed to complement the others beautifully.",
        category: "rings",
        imageUrl: "/Rose_gold_stackable_rings_c4608c25.png",
        images: [
          "/Rose_gold_stackable_rings_c4608c25.png",
          "/Rose_gold_stackable_rings_c4608c25.png",
        ],
        material: "14K Rose Gold",
        isPreOrder: true,
        inStock: false,
        sizes: ["5", "6", "7", "8", "9"],
      },
      {
        name: "Gold Hoop Earrings",
        description:
          "Modern hoop earrings in polished gold. Versatile and sophisticated for any occasion. A must-have addition to your jewelry collection.",
        category: "earrings",
        imageUrl: "/Gold_hoop_earrings_86358172.png",
        images: [
          "/Gold_hoop_earrings_86358172.png",
          "/Gold_hoop_earrings_86358172.png",
        ],
        material: "18K Yellow Gold",
        isPreOrder: false,
        inStock: true,
      },
      {
        name: "Silver Infinity Necklace",
        description:
          "Symbolic infinity pendant on a delicate silver chain. Represents eternal love and friendship. A meaningful gift for someone special.",
        category: "necklaces",
        imageUrl: "/Silver_infinity_necklace_eb3fd355.png",
        images: [
          "/Silver_infinity_necklace_eb3fd355.png",
          "/Silver_infinity_necklace_eb3fd355.png",
        ],
        material: "Sterling Silver",
        isPreOrder: false,
        inStock: true,
      },

      {
        name: "Aurora Twist Bracelet",
        description:
          "A sleek twisted bracelet with a mirror polish finish. Designed for everyday elegance and comfortable wear.",
        category: "bracelets",
        imageUrl: "/bracelet_new_1.png",
        images: [
          "/bracelet_new_1.png",
        ],
        material: "Sterling Silver",
        isPreOrder: false,
        inStock: true,
        sizes: ["S", "M", "L"],
      },
      {
        name: "Serene Link Bracelet",
        description:
          "Delicate link bracelet that layers beautifully with other pieces. Hand-assembled for a fluid drape.",
        category: "bracelets",
        imageUrl: "/bracelet_new_2.png",
        images: [
          "/bracelet_new_2.png",
        ],
        material: "14K Gold Vermeil",
        isPreOrder: false,
        inStock: true,
        sizes: ["S", "M", "L"],
      },
      {
        name: "Opaline Bead Bracelet",
        description:
          "Soft opaline beads strung on a durable cord, finished with a refined clasp. A gentle pop of color.",
        category: "bracelets",
        imageUrl: "/bracelet_new_3.png",
        images: [
          "/bracelet_new_3.png",
        ],
        material: "Glass Beads, Stainless Clasp",
        isPreOrder: false,
        inStock: true,
        sizes: ["S", "M", "L"],
      },
      {
        name: "Linea Cuff Bracelet",
        description:
          "Minimalist cuff with a gentle oval profile. Adjustable fit and lightly brushed finish.",
        category: "bracelets",
        imageUrl: "/bracelet_new_4.png",
        images: [
          "/bracelet_new_4.png",
        ],
        material: "18K Gold Plated Brass",
        isPreOrder: true,
        inStock: false,
        sizes: ["S", "M", "L"],
      },
      {
        name: "Celeste Chain Bracelet",
        description:
          "Fine chain bracelet that catches the light with every move. Lightweight and enduring.",
        category: "bracelets",
        imageUrl: "/bracelet_new_5.png",
        images: [
          "/bracelet_new_5.png",
        ],
        material: "Stainless Steel, PVD Gold",
        isPreOrder: false,
        inStock: true,
        sizes: ["S", "M", "L"],
      },
      {
        name: "Noir Bar Bracelet",
        description:
          "A modern bar centerpiece on a refined chain. Understated and versatile for daily wear.",
        category: "bracelets",
        imageUrl: "/bracelet_new_6.png",
        images: [
          "/bracelet_new_6.png",
        ],
        material: "Black Onyx, Stainless Steel",
        isPreOrder: false,
        inStock: true,
        sizes: ["S", "M", "L"],
      },

      {
        name: "Luna Drop Earrings",
        description:
          "Graceful drop earrings with a gentle arc silhouette. Polished to a mirror sheen.",
        category: "earrings",
        imageUrl: "/earring_new_1.png",
        images: [
          "/earring_new_1.png",
        ],
        material: "Sterling Silver",
        isPreOrder: false,
        inStock: true,
      },
      {
        name: "Halo Stud Earrings",
        description:
          "Round studs framed by a subtle halo for added brilliance. A refined everyday pair.",
        category: "earrings",
        imageUrl: "/earring_new_2.png",
        images: [
          "/earring_new_2.png",
        ],
        material: "14K Gold Vermeil",
        isPreOrder: false,
        inStock: true,
      },
      {
        name: "Arc Hoop Earrings",
        description:
          "Sculpted hoops with a tapered profile. Lightweight for comfortable, all-day wear.",
        category: "earrings",
        imageUrl: "/earring_new_3.png",
        images: [
          "/earring_new_3.png",
        ],
        material: "18K Gold Plated Brass",
        isPreOrder: true,
        inStock: false,
      },

      {
        name: "Solitaire Pendant Necklace",
        description:
          "Refined solitaire pendant suspended on a fine chain. Effortlessly elegant.",
        category: "necklaces",
        imageUrl: "/necklace_new_1.jpg",
        images: [
          "/necklace_new_1.jpg",
        ],
        material: "18K Yellow Gold",
        isPreOrder: false,
        inStock: true,
      },
      {
        name: "Cascade Y Necklace",
        description:
          "Y-shaped necklace with a delicate vertical drop. Designed to elongate the neckline.",
        category: "necklaces",
        imageUrl: "/necklace_new_2.jpg",
        images: [
          "/necklace_new_2.jpg",
        ],
        material: "Sterling Silver",
        isPreOrder: false,
        inStock: true,
      },
      {
        name: "Nova Lariat Necklace",
        description:
          "Minimal lariat necklace featuring a slender bar accent. Perfect for layering.",
        category: "necklaces",
        imageUrl: "/necklace_new_3.jpg",
        images: [
          "/necklace_new_3.jpg",
        ],
        material: "14K Gold Vermeil",
        isPreOrder: true,
        inStock: false,
      },

      {
        name: "Mira Signet Ring",
        description:
          "A modern take on the classic signet ring with a smooth, bold face.",
        category: "rings",
        imageUrl: "/ring_new_1.png",
        images: [
          "/ring_new_1.png",
        ],
        material: "14K Gold Vermeil",
        isPreOrder: false,
        inStock: true,
        sizes: ["5", "6", "7", "8", "9"],
      },
      {
        name: "Astra Solitaire Ring",
        description:
          "A slender band crowned with a brilliant center stone. Romantic and timeless.",
        category: "rings",
        imageUrl: "/ring_new_2.png",
        images: [
          "/ring_new_2.png",
        ],
        material: "14K Rose Gold",
        isPreOrder: false,
        inStock: true,
        sizes: ["5", "6", "7", "8", "9"],
      },
      {
        name: "Vela Stack Ring",
        description:
          "Slim stacking ring designed to pair beautifully with your daily pieces.",
        category: "rings",
        imageUrl: "/ring_new_3.png",
        images: [
          "/ring_new_3.png",
        ],
        material: "Sterling Silver",
        isPreOrder: false,
        inStock: true,
        sizes: ["5", "6", "7", "8", "9"],
      },
      {
        name: "Orbit Duo Ring",
        description:
          "Two interlocking bands symbolizing balance and unity. A sculptural statement.",
        category: "rings",
        imageUrl: "/ring_new_4.png",
        images: [
          "/ring_new_4.png",
        ],
        material: "18K Gold Plated Brass",
        isPreOrder: true,
        inStock: false,
        sizes: ["5", "6", "7", "8", "9"],
      },
      {
        name: "Seraphine Pavé Ring",
        description:
          "Delicate pavé band that adds a touch of sparkle to any stack.",
        category: "rings",
        imageUrl: "/ring_new_5.png",
        images: [
          "/ring_new_5.png",
        ],
        material: "18K Yellow Gold, Cubic Zirconia",
        isPreOrder: false,
        inStock: true,
        sizes: ["5", "6", "7", "8", "9"],
      },
    ];

    const sampleProducts: InsertProduct[] = baseProducts.map((bp) => ({
      ...bp,
      price: computePriceCents(bp.name, bp.category, bp.material),
    }));

    sampleProducts.forEach((product) => {
      const id = randomUUID();
      const prod: Product = {
        id,
        name: product.name,
        description: product.description,
        price: product.price,
        category: product.category,
        imageUrl: product.imageUrl,
        images: product.images,
        material: product.material,
        isPreOrder: product.isPreOrder ?? false,
        inStock: product.inStock ?? true,
        sizes: (product as any).sizes ?? null,
        createdAt: new Date(),
      };
      this.products.set(id, prod);
    });
  }

  private seedAdminUser() {
    const id = randomUUID();
    const admin: User = {
      id,
      name: "Administrator",
      email: "admin@lumiere.test",
      passwordHash: hashPassword("admin123"),
      role: "admin",
      createdAt: new Date(),
    } as User;
    this.users.set(id, admin);
  }

  async getProducts(): Promise<Product[]> {
    return Array.from(this.products.values());
  }

  async getProduct(id: string): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const id = randomUUID();
    const product: Product = {
      id,
      name: insertProduct.name,
      description: insertProduct.description,
      price: insertProduct.price,
      category: insertProduct.category,
      imageUrl: insertProduct.imageUrl,
      images: insertProduct.images,
      material: insertProduct.material,
      isPreOrder: insertProduct.isPreOrder ?? false,
      inStock: insertProduct.inStock ?? true,
      sizes: (insertProduct as any).sizes ?? null,
      createdAt: new Date(),
    };
    this.products.set(id, product);
    return product;
  }

  async updateProduct(id: string, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    const existing = this.products.get(id);
    if (!existing) return undefined;
    const updated: Product = {
      ...existing,
      ...(updates as any),
    };
    this.products.set(id, updated);
    return updated;
  }

  async deleteProduct(id: string): Promise<void> {
    this.products.delete(id);
  }

  async getOrders(): Promise<(Order & { items: OrderItem[] })[]> {
    return Array.from(this.orders.values()).map((order) => ({
      ...order,
      items: this.orderItems.get(order.id) || [],
    }));
  }

  async getOrder(id: string): Promise<(Order & { items: OrderItem[] }) | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    return {
      ...order,
      items: this.orderItems.get(id) || [],
    };
  }

  async createOrder(insertOrder: InsertOrder, userId: string, items: Omit<InsertOrderItem, 'orderId'>[]): Promise<Order & { items: OrderItem[] }> {
    const id = randomUUID();
    const order: Order = {
      id,
      userId,
      customerName: insertOrder.customerName,
      customerEmail: insertOrder.customerEmail,
      customerPhone: insertOrder.customerPhone,
      shippingAddress: insertOrder.shippingAddress,
      shippingCity: insertOrder.shippingCity,
      shippingPostalCode: insertOrder.shippingPostalCode,
      shippingCountry: insertOrder.shippingCountry,
      totalAmount: insertOrder.totalAmount,
      status: (insertOrder as any).status ?? "pending",
      isPreOrder: (insertOrder as any).isPreOrder ?? false,
      paymentStatus: (insertOrder as any).paymentStatus ?? "pending",
      createdAt: new Date(),
    };
    this.orders.set(id, order);

    const orderItemsList: OrderItem[] = items.map((item) => ({
      id: randomUUID(),
      orderId: id,
      productId: item.productId,
      productName: item.productName,
      productPrice: item.productPrice,
      quantity: item.quantity ?? 1,
      size: item.size ?? null,
    }));
    this.orderItems.set(id, orderItemsList);

    return { ...order, items: orderItemsList };
  }

  async updateOrderStatus(
    id: string,
    status: string
  ): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;

    const updated = { ...order, status };
    this.orders.set(id, updated);
    return updated;
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = randomUUID();
    const u: User = {
      id,
      name: user.name,
      email: user.email.toLowerCase(),
      passwordHash: hashPassword(user.password),
      role: user.role ?? "user",
      createdAt: new Date(),
    } as User;
    this.users.set(id, u);
    return u;
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    email = email.toLowerCase();
    let found: User | undefined = undefined;
    this.users.forEach((u) => {
      if (!found && u.email === email) found = u;
    });
    return found;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async createSession(userId: string): Promise<string> {
    const sid = randomUUID();
    this.sessions.set(sid, userId);
    return sid;
  }

  async getUserIdBySession(sessionId: string): Promise<string | undefined> {
    return this.sessions.get(sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async getCart(userId: string): Promise<CartItem[]> {
    return [...(this.carts.get(userId) ?? [])];
  }

  async addOrIncrementCartItem(userId: string, productId: string, size?: string, quantity: number = 1): Promise<CartItem> {
    const list = this.carts.get(userId) ?? [];
    const existing = list.find((i) => i.productId === productId && i.size === (size ?? null));
    if (existing) {
      existing.quantity += quantity;
      this.carts.set(userId, list);
      return { ...existing };
    }
    const item: CartItem = {
      id: randomUUID(),
      productId,
      quantity: quantity ?? 1,
      size: size ?? null,
      userId,
    } as any;
    this.carts.set(userId, [...list, item]);
    return { ...item };
  }

  async updateCartItemQuantity(userId: string, cartItemId: string, quantity: number): Promise<CartItem | undefined> {
    const list = this.carts.get(userId) ?? [];
    const idx = list.findIndex((i) => i.id === cartItemId);
    if (idx === -1) return undefined;
    if (quantity <= 0) {
      list.splice(idx, 1);
      this.carts.set(userId, list);
      return undefined;
    }
    list[idx] = { ...list[idx], quantity } as CartItem;
    this.carts.set(userId, list);
    return { ...list[idx] };
  }

  async removeCartItem(userId: string, cartItemId: string): Promise<void> {
    const list = this.carts.get(userId) ?? [];
    this.carts.set(userId, list.filter((i) => i.id !== cartItemId));
  }

  async clearCart(userId: string): Promise<void> {
    this.carts.delete(userId);
  }

  async deleteUser(id: string): Promise<void> {
    this.users.delete(id);
    this.carts.delete(id);
    this.sessions.forEach((uid, sid) => {
      if (uid === id) this.sessions.delete(sid);
    });
  }

  async deleteSessionsForUser(userId: string): Promise<void> {
    this.sessions.forEach((uid, sid) => {
      if (uid === userId) this.sessions.delete(sid);
    });
  }
}

class PostgresStorage implements IStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  private mapProduct(row: any): Product {
    return {
      ...row,
      images: row.images || [],
      sizes: row.sizes || null,
    } as Product;
  }

  async getProducts(): Promise<Product[]> {
    const res = await this.db.select().from(products).execute();
    return res.map((r: any) => this.mapProduct(r));
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const rows = await this.db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1)
      .execute();
    if (!rows || rows.length === 0) return undefined;
    return this.mapProduct(rows[0]);
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const values = {
      name: insertProduct.name,
      description: insertProduct.description,
      price: insertProduct.price,
      category: insertProduct.category,
      imageUrl: insertProduct.imageUrl,
      images: insertProduct.images,
      material: insertProduct.material,
      isPreOrder: insertProduct.isPreOrder ?? false,
      inStock: insertProduct.inStock ?? true,
      sizes: (insertProduct as any).sizes ?? null,
    } as any;

    const inserted = await this.db.insert(products).values(values).returning().execute();
    return this.mapProduct(inserted[0]);
  }

  async updateProduct(id: string, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    const values: any = { ...updates };
    Object.keys(values).forEach((k) => values[k] === undefined && delete values[k]);
    if (Object.keys(values).length === 0) {
      return await this.getProduct(id);
    }
    const updated = await this.db
      .update(products)
      .set(values)
      .where(eq(products.id, id))
      .returning()
      .execute();
    if (!updated || updated.length === 0) return undefined;
    return this.mapProduct(updated[0]);
  }

  async deleteProduct(id: string): Promise<void> {
    await this.db.delete(products).where(eq(products.id, id)).execute();
  }

  async getOrders(): Promise<(Order & { items: OrderItem[] })[]> {
    const orderRows = await this.db.select().from(orders).execute();
    const result: (Order & { items: OrderItem[] })[] = [];
    
    for (const order of orderRows) {
      const items = await this.db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id))
        .execute();
      result.push({ ...order, items: items as OrderItem[] });
    }
    
    return result;
  }

  async getOrder(id: string): Promise<(Order & { items: OrderItem[] }) | undefined> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1)
      .execute();
    if (!rows || rows.length === 0) return undefined;
    
    const order = rows[0];
    const items = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id))
      .execute();
    
    return { ...order, items: items as OrderItem[] };
  }

  async createOrder(insertOrder: InsertOrder, userId: string, items: Omit<InsertOrderItem, 'orderId'>[]): Promise<Order & { items: OrderItem[] }> {
    const values = {
      userId,
      customerName: insertOrder.customerName,
      customerEmail: insertOrder.customerEmail,
      customerPhone: insertOrder.customerPhone,
      shippingAddress: insertOrder.shippingAddress,
      shippingCity: insertOrder.shippingCity,
      shippingPostalCode: insertOrder.shippingPostalCode,
      shippingCountry: insertOrder.shippingCountry,
      totalAmount: insertOrder.totalAmount,
      status: (insertOrder as any).status ?? "pending",
      isPreOrder: (insertOrder as any).isPreOrder ?? false,
      paymentStatus: (insertOrder as any).paymentStatus ?? "pending",
    } as any;

    const inserted = await this.db.insert(orders).values(values).returning().execute();
    const order = inserted[0] as Order;

    const itemsToInsert = items.map((item) => ({
      orderId: order.id,
      productId: item.productId,
      productName: item.productName,
      productPrice: item.productPrice,
      quantity: item.quantity,
      size: item.size ?? null,
    }));

    const insertedItems = await this.db
      .insert(orderItems)
      .values(itemsToInsert)
      .returning()
      .execute();

    return { ...order, items: insertedItems as OrderItem[] };
  }

  async updateOrderStatus(id: string, status: string): Promise<Order | undefined> {
    const updated = await this.db
      .update(orders)
      .set({ status })
      .where(eq(orders.id, id))
      .returning()
      .execute();
    if (!updated || updated.length === 0) return undefined;
    const row = updated[0];
    return row as Order;
  }

  async createUser(user: InsertUser): Promise<User> {
    const passwordHash = hashPassword(user.password);
    const values = {
      name: user.name,
      email: user.email.toLowerCase(),
      passwordHash,
      role: user.role ?? "user",
    } as any;
    const inserted = await this.db.insert(users).values(values).returning().execute();
    return inserted[0] as User;
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)
      .execute();
    return rows && rows[0] ? (rows[0] as User) : undefined;
  }

  async getUser(id: string): Promise<User | undefined> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .execute();
    return rows && rows[0] ? (rows[0] as User) : undefined;
  }

  async createSession(userId: string): Promise<string> {
    const sid = randomUUID();
    await this.db.insert(sessions).values({ id: sid, userId }).execute();
    return sid;
  }

  async getUserIdBySession(sessionId: string): Promise<string | undefined> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1)
      .execute();
    return rows && rows[0] ? rows[0].userId : undefined;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, sessionId)).execute();
  }

  async getCart(userId: string): Promise<CartItem[]> {
    const res = await this.db.select().from(cartItems).where(eq(cartItems.userId, userId)).execute();
    return res as CartItem[];
  }

  async addOrIncrementCartItem(userId: string, productId: string, size?: string, quantity: number = 1): Promise<CartItem> {
    const existing = await this.db
      .select()
      .from(cartItems)
      .where(eq(cartItems.userId, userId))
      .execute();
    const match = existing.find((i: CartItem) => i.productId === productId && (i.size ?? null) === (size ?? null));
    if (match) {
      const updated = await this.db
        .update(cartItems)
        .set({ quantity: match.quantity + (quantity ?? 1) })
        .where(eq(cartItems.id, match.id))
        .returning()
        .execute();
      return updated[0] as CartItem;
    }
    const inserted = await this.db
      .insert(cartItems)
      .values({ userId, productId, size: size ?? null, quantity: quantity ?? 1 })
      .returning()
      .execute();
    return inserted[0] as CartItem;
  }

  async updateCartItemQuantity(userId: string, cartItemId: string, quantity: number): Promise<CartItem | undefined> {
    if (quantity <= 0) {
      await this.removeCartItem(userId, cartItemId);
      return undefined;
    }
    const updated = await this.db
      .update(cartItems)
      .set({ quantity })
      .where(eq(cartItems.id, cartItemId))
      .returning()
      .execute();
    return updated && updated[0] ? (updated[0] as CartItem) : undefined;
  }

  async removeCartItem(_userId: string, cartItemId: string): Promise<void> {
    await this.db.delete(cartItems).where(eq(cartItems.id, cartItemId)).execute();
  }

  async clearCart(userId: string): Promise<void> {
    await this.db.delete(cartItems).where(eq(cartItems.userId, userId)).execute();
  }

  async deleteUser(id: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, id)).execute();
    await this.db.delete(cartItems).where(eq(cartItems.userId, id)).execute();
    await this.db.delete(users).where(eq(users.id, id)).execute();
  }

  async deleteSessionsForUser(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId)).execute();
  }
}

let storageInstance: IStorage;

if (process.env.DATABASE_URL) {
  try {
    const db = initDb(process.env.DATABASE_URL);
    if (typeof (db as any).execute === "function") {
      await (db as any).execute(sql`select 1`);
    }
    storageInstance = new PostgresStorage(db);
    console.log("[storage] Using PostgresStorage (DATABASE_URL detected)");
  } catch (e) {
    console.error("[storage] DB unreachable, falling back to MemStorage:", e);
    storageInstance = new MemStorage();
    console.warn("[storage] Using in-memory storage; data will not persist to DB.");
  }
} else {
  storageInstance = new MemStorage();
  console.warn("[storage] DATABASE_URL not set. Using in-memory storage; data will not persist to DB.");
}

export const storage = storageInstance;
