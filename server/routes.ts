import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProductSchema, insertOrderSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { createHash } from "crypto";
import path from "path";

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

  const setSessionCookie = (res: any, sid: string) => {
    const cookie = `sid=${encodeURIComponent(sid)}; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`;
    res.setHeader("Set-Cookie", cookie);
  };

  const getUserFromRequest = async (req: any) => {
    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies["sid"];
    if (!sid) return undefined;
    const userId = await storage.getUserIdBySession(sid);
    if (!userId) return undefined;
    return await storage.getUser(userId);
  };

  const getSessionId = (req: any) => {
    const cookies = parseCookies(req.headers.cookie);
    return cookies["sid"];
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
      const parsed = insertUserSchema.extend({ password: z.string() }).parse(body as any);
      const existing = await storage.findUserByEmail(parsed.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }
      const user = await storage.createUser(parsed as any);
      const sid = await storage.createSession(user.id);
      setSessionCookie(res, sid);
      const { passwordHash, ...safe } = user as any;
      res.status(201).json(safe);
    } catch (error: any) {
      res.status(400).json({ message: "Invalid user data", error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    const user = await storage.findUserByEmail(email);
    if (!user) return res.status(404).json({ message: "Account not found" });
    const hash = createHash("sha256").update(password).digest("hex");
    if (user.passwordHash !== hash) return res.status(401).json({ message: "Incorrect password" });
    const sid = await storage.createSession(user.id);
    setSessionCookie(res, sid);
    const { passwordHash, ...safe } = user as any;
    res.json(safe);
  });

  app.post("/api/auth/logout", async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies["sid"];
    if (sid) await storage.deleteSession(sid);
    res.setHeader("Set-Cookie", "sid=; Path=/; Max-Age=0; SameSite=Lax");
    res.json({ success: true });
  });

  // Cart endpoints (require authenticated user; cart persisted per user)
  app.get("/api/cart", async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const items = await storage.getCart(user.id);
    // Hydrate with product data
    const hydrated = await Promise.all(
      items.map(async (i) => ({
        id: i.id,
        quantity: i.quantity,
        size: i.size ?? null,
        product: await storage.getProduct(i.productId),
      }))
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
      items.map(async (i) => ({ id: i.id, quantity: i.quantity, size: i.size ?? null, product: await storage.getProduct(i.productId) }))
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
      items.map(async (i) => ({ id: i.id, quantity: i.quantity, size: i.size ?? null, product: await storage.getProduct(i.productId) }))
    );
    res.json(hydrated.filter((x) => x.product));
  });

  app.delete("/api/cart/:id", async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    await storage.removeCartItem(user.id, req.params.id);
    const items = await storage.getCart(user.id);
    const hydrated = await Promise.all(
      items.map(async (i) => ({ id: i.id, quantity: i.quantity, size: i.size ?? null, product: await storage.getProduct(i.productId) }))
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
      res.status(500).json({ message: "Error fetching products", error: error.message });
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
      const validated = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(validated);
      res.status(201).json(product);
    } catch (error: any) {
      res.status(400).json({ message: "Invalid product data", error: error.message });
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
      const validated = insertOrderSchema.parse(req.body);
      const order = await storage.createOrder(validated);
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

  const httpServer = createServer(app);
  return httpServer;
}
