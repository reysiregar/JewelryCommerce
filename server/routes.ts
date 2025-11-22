import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProductSchema, insertOrderSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { createHash } from "crypto";
import path from "path";
import { signToken, verifyToken, hashPassword } from "./jwt";

// Rate limiting for account deletion attempts (in-memory)
const deleteAttempts: Map<string, { count: number; lockedUntil?: number }> = new Map();
const MAX_DELETE_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15; // lockout duration after max failed attempts

export async function registerRoutes(app: Express): Promise<Server> {
  // Static assets are served from client/public by Vite in development
  // and from the built "public" directory in production (see server/vite.ts).

  // Util: parse cookies
  const normalizeAssetUrl = (url?: string) => {
    if (!url) return url as any;
    let u = url.replace(/^\/?assets\/generated_images\//, "/");
    if (!u.startsWith("/")) u = `/${u}`;
    return u;
  };

  const normalizeProduct = (p: any) => ({
    ...p,
    imageUrl: normalizeAssetUrl(p.imageUrl),
    images: Array.isArray(p.images) ? p.images.map((x: string) => normalizeAssetUrl(x)) : p.images,
  });
  const parseCookies = (cookieHeader?: string) => {
    const out: Record<string, string> = {};
    if (!cookieHeader) return out;
    cookieHeader.split(";").forEach((part) => {
      const [k, ...v] = part.trim().split("=");
      out[k] = decodeURIComponent(v.join("="));
    });
    return out;
  };

  const setSessionCookie = (res: any, token: string) => {
    // Session cookie: no Max-Age means it expires when browser closes
    const cookie = `token=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`;
    res.setHeader("Set-Cookie", cookie);
  };

  const getUserFromRequest = async (req: any) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies["token"];
    if (!token) return undefined;
    const payload = verifyToken(token);
    if (!payload) return undefined;
    return await storage.getUser(payload.userId);
  };

  const getSessionToken = (req: any) => {
    const cookies = parseCookies(req.headers.cookie);
    return cookies["token"];
  };

  // Auth endpoints
  app.get("/api/auth/me", async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const { passwordHash, ...safe } = user as any;
    res.json(safe);
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const body = req.body;
      // Stricter validation to prevent empty registrations
      const parsed = z
        .object({
          name: z.string().trim().min(1, "Name is required"),
          email: z.string().trim().email("Invalid email address"),
          password: z.string().min(6, "Password must be at least 6 characters"),
          role: z.string().optional(),
        })
        .parse(body as any);

      const existing = await storage.findUserByEmail(parsed.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }
      const user = await storage.createUser(parsed as any);
      const token = signToken(user.id);
      setSessionCookie(res, token);
      const { passwordHash, ...safe } = user as any;
      res.status(201).json(safe);
    } catch (error: any) {
      const friendly = error?.errors?.[0]?.message || error?.message || "Invalid user data";
      res.status(400).json({ message: friendly });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    const user = await storage.findUserByEmail(email);
    if (!user) return res.status(404).json({ message: "Account not found" });
    const hash = hashPassword(password);
    if (user.passwordHash !== hash) return res.status(401).json({ message: "Incorrect password" });
    const token = signToken(user.id);
    setSessionCookie(res, token);
    const { passwordHash, ...safe } = user as any;
    res.json(safe);
  });

  app.post("/api/auth/logout", async (req, res) => {
    // With JWT, we just clear the cookie - no database cleanup needed
    res.setHeader("Set-Cookie", "token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
    res.json({ success: true });
  });

  // Cart endpoints (require authenticated user; cart persisted per user)
  app.get("/api/cart", async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const items = await storage.getCart(user.id);
    // Hydrate with product data
    const hydrated = await Promise.all(
      items.map(async (i) => {
        const p = await storage.getProduct(i.productId);
        return {
          id: i.id,
          quantity: i.quantity,
          size: i.size ?? null,
          product: p ? normalizeProduct(p) : p,
        };
      })
    );
    // filter unknown products
    res.json(hydrated.filter((x) => x.product));
  });

  app.post("/api/cart", async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const { productId, size, quantity } = req.body as { productId?: string; size?: string | null; quantity?: number };
    if (!productId) return res.status(400).json({ message: "productId is required" });
    const product = await storage.getProduct(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });
    await storage.addOrIncrementCartItem(user.id, productId, size ?? undefined, quantity ?? 1);
    const items = await storage.getCart(user.id);
    const hydrated = await Promise.all(
      items.map(async (i) => {
        const p = await storage.getProduct(i.productId);
        return { id: i.id, quantity: i.quantity, size: i.size ?? null, product: p ? normalizeProduct(p) : p };
      })
    );
    res.status(201).json(hydrated.filter((x) => x.product));
  });

  app.patch("/api/cart/:id", async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const { quantity } = req.body as { quantity?: number };
    if (typeof quantity !== "number") return res.status(400).json({ message: "quantity is required" });
    await storage.updateCartItemQuantity(user.id, req.params.id, quantity);
    const items = await storage.getCart(user.id);
    const hydrated = await Promise.all(
      items.map(async (i) => {
        const p = await storage.getProduct(i.productId);
        return { id: i.id, quantity: i.quantity, size: i.size ?? null, product: p ? normalizeProduct(p) : p };
      })
    );
    res.json(hydrated.filter((x) => x.product));
  });

  app.delete("/api/cart/:id", async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    await storage.removeCartItem(user.id, req.params.id);
    const items = await storage.getCart(user.id);
    const hydrated = await Promise.all(
      items.map(async (i) => {
        const p = await storage.getProduct(i.productId);
        return { id: i.id, quantity: i.quantity, size: i.size ?? null, product: p ? normalizeProduct(p) : p };
      })
    );
    res.json(hydrated.filter((x) => x.product));
  });

  app.delete("/api/cart", async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    await storage.clearCart(user.id);
    res.json([]);
  });

  // Products endpoints
  app.get("/api/products", async (req, res) => {
    try {
      const products = await storage.getProducts();
      res.json(products.map(normalizeProduct));
    } catch (error: any) {
      const devInfo = process.env.NODE_ENV === "development" ? {
        stack: error?.stack,
        name: error?.name,
      } : {};
      res.status(500).json({ message: "Error fetching products", error: error.message, ...devInfo });
    }
  });

  // Search endpoint
  app.get("/api/search", async (req, res) => {
    try {
      const q = (req.query.q as string | undefined)?.trim() || "";
      if (!q) return res.json([]);
      const products = await storage.getProducts();
      const query = q.toLowerCase();

      const scored = products
        .map((p) => {
          const hayName = p.name.toLowerCase();
          const hayDesc = p.description.toLowerCase();
          const hayMat = p.material.toLowerCase();
          const hayCat = p.category.toLowerCase();

          let score = 0;
          // Category boost for common keywords
          if (query.startsWith("ring")) score += hayCat === "rings" ? 5 : 0;
          if (query.startsWith("neck")) score += hayCat === "necklaces" ? 5 : 0;
          if (query.startsWith("brace")) score += hayCat === "bracelets" ? 5 : 0;
          if (query.startsWith("ear")) score += hayCat === "earrings" ? 5 : 0;

          // Name prefix and inclusion boosts
          if (hayName.startsWith(query)) score += 6;
          if (hayName.includes(query)) score += 4;

          // Material and description light boosts
          if (hayMat.includes(query)) score += 2;
          if (hayDesc.includes(query)) score += 1;

          // Exact category keyword match
          if (["rings","ring","necklace","necklaces","bracelet","bracelets","earring","earrings"].includes(query)) {
            const norm = query.endsWith("s") ? query : `${query}s`;
            if (hayCat === norm) score += 8;
          }

          return { p, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((x) => normalizeProduct(x.p));

      res.json(scored);
    } catch (error: any) {
      res.status(500).json({ message: "Error searching products", error: error.message });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(normalizeProduct(product));
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching product", error: error.message });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user || user.role !== "admin") return res.status(401).json({ message: "Unauthorized" });
      const validated = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(validated);
      res.status(201).json(product);
    } catch (error: any) {
      res.status(400).json({ message: "Invalid product data", error: error.message });
    }
  });

  app.patch("/api/products/:id", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user || user.role !== "admin") return res.status(401).json({ message: "Unauthorized" });
      // Partial update: validate by narrowing to known fields and using zod partial
      const partial = insertProductSchema.partial().safeParse(req.body);
      if (!partial.success) {
        return res.status(400).json({ message: "Invalid product data" });
      }
      const updated = await storage.updateProduct(req.params.id, partial.data);
      if (!updated) return res.status(404).json({ message: "Product not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Error updating product", error: error.message });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user || user.role !== "admin") return res.status(401).json({ message: "Unauthorized" });
      const product = await storage.getProduct(req.params.id);
      if (!product) return res.status(404).json({ message: "Product not found" });
      await storage.deleteProduct(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: "Error deleting product", error: error.message });
    }
  });

  // Orders endpoints
  app.get("/api/orders", async (req, res) => {
    try {
      const orders = await storage.getOrders();
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching orders", error: error.message });
    }
  });

  app.get("/api/orders/:id", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json(order);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching order", error: error.message });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      
      // Expect items array in the request body along with customer/shipping details
      const { items, ...orderData } = req.body;
      
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Order must contain at least one item" });
      }
      
      // Validate order data (without items field)
      const validated = insertOrderSchema.parse(orderData);
      
      // Prepare order items (snapshot product data)
      const orderItemsData = items.map((item: any) => ({
        productId: item.productId,
        productName: item.name || item.productName,
        productPrice: item.price || item.productPrice,
        quantity: item.quantity || 1,
        size: item.size || null,
      }));
      
      const order = await storage.createOrder(validated, user.id, orderItemsData);
      res.status(201).json(order);
    } catch (error: any) {
      res.status(400).json({ message: "Invalid order data", error: error.message });
    }
  });

  // Admin summary
  app.get("/api/admin/summary", async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user || user.role !== "admin") return res.status(401).json({ message: "Unauthorized" });
    const products = await storage.getProducts();
    const orders = await storage.getOrders();
    const revenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    res.json({
      products: products.length,
      orders: orders.length,
      revenue,
    });
  });

  // Admin sales overview
  app.get("/api/admin/sales", async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user || user.role !== "admin") return res.status(401).json({ message: "Unauthorized" });

    const period = (req.query.period as string | undefined) || "month"; // week | month | quarter
    let days = 30;
    if (period === "week") days = 7;
    else if (period === "quarter") days = 90;

    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (days - 1));

    const orders = await storage.getOrders();
    const inRange = orders.filter((o: any) => {
      const d = new Date(o.createdAt);
      const di = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      return di >= +start && di <= +end;
    });

    const byDay: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      byDay[key] = 0;
    }
    inRange.forEach((o: any) => {
      const d = new Date(o.createdAt);
      const key = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
        .toISOString()
        .slice(0, 10);
      byDay[key] = (byDay[key] || 0) + o.totalAmount;
    });

    const points = Object.keys(byDay)
      .sort()
      .map((date) => ({ date, total: byDay[date] }));

    res.json({ period, from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), points });
  });

  app.patch("/api/orders/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      if (typeof status !== "string") {
        return res.status(400).json({ message: "Invalid status" });
      }

      const order = await storage.updateOrderStatus(req.params.id, status);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      res.json(order);
    } catch (error: any) {
      res.status(500).json({ message: "Error updating order status", error: error.message });
    }
  });

  // Simulated payment endpoint
  app.post("/api/payment/simulate", async (req, res) => {
    try {
      const { amount, orderId } = req.body;

      // Simulate payment processing delay
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Simulate 95% success rate
      const success = Math.random() > 0.05;

      if (success) {
        res.json({
          success: true,
          transactionId: `txn_${Date.now()}`,
          amount,
          status: "paid",
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Payment failed. Please try again.",
        });
      }
    } catch (error: any) {
      res.status(500).json({ message: "Payment processing error", error: error.message });
    }
  });

  // Delete own account (non-admin users only) with confirmation + rate limiting
  app.post("/api/account/delete", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role === "admin") return res.status(400).json({ message: "Admins cannot delete their account" });

      const attempt = deleteAttempts.get(user.id);
      if (attempt?.lockedUntil && attempt.lockedUntil > Date.now()) {
        const remainingMs = attempt.lockedUntil - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);
        return res.status(429).json({ message: `Too many failed attempts. Try again in ${remainingMin}m.` });
      }

      const { password, confirm } = req.body as { password?: string; confirm?: string };
      if (!password) return res.status(400).json({ message: "Password is required" });
      if (confirm !== "DELETE") return res.status(400).json({ message: "Confirmation text mismatch" });

      const hash = hashPassword(password);
      if ((user as any).passwordHash !== hash) {
        const prev = attempt?.count ?? 0;
        const next = prev + 1;
        const record: { count: number; lockedUntil?: number } = { count: next };
        if (next >= MAX_DELETE_ATTEMPTS) {
          record.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
        }
        deleteAttempts.set(user.id, record);
        return res.status(401).json({ message: "Incorrect password", attempts: next, locked: !!record.lockedUntil });
      }

      // Success: clear attempts record
      if (attempt) deleteAttempts.delete(user.id);

      await storage.deleteUser(user.id);
      res.setHeader("Set-Cookie", "token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: "Failed to delete account", error: e.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
