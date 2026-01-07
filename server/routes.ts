import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProductSchema, insertOrderSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { createHash } from "crypto";
import path from "path";
import { signToken, verifyToken, hashPassword } from "./jwt";

const deleteAttempts: Map<string, { count: number; lockedUntil?: number }> = new Map();
const MAX_DELETE_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function registerRoutes(app: Express): Promise<Server> {
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

  app.get("/api/auth/me", async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const { passwordHash, ...safe } = user as any;
    res.json(safe);
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const body = req.body;
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
    res.setHeader("Set-Cookie", "token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
    res.json({ success: true });
  });

  app.get("/api/cart", async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const items = await storage.getCart(user.id);
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
          if (query.startsWith("ring")) score += hayCat === "rings" ? 5 : 0;
          if (query.startsWith("neck")) score += hayCat === "necklaces" ? 5 : 0;
          if (query.startsWith("brace")) score += hayCat === "bracelets" ? 5 : 0;
          if (query.startsWith("ear")) score += hayCat === "earrings" ? 5 : 0;

          if (hayName.startsWith(query)) score += 6;
          if (hayName.includes(query)) score += 4;

          if (hayMat.includes(query)) score += 2;
          if (hayDesc.includes(query)) score += 1;

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

  app.get("/api/orders", async (req, res) => {
    try {
      const orders = await storage.getOrders();
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching orders", error: error.message });
    }
  });

  app.get("/api/user/orders", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const orders = await storage.getUserOrders(user.id);
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching user orders", error: error.message });
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
      
      const { items, ...orderData } = req.body;
      
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Order must contain at least one item" });
      }
      
      const validated = insertOrderSchema.parse(orderData);
      
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

  app.get("/api/admin/sales", async (req, res) => {
    const user = await getUserFromRequest(req);
    if (!user || user.role !== "admin") return res.status(401).json({ message: "Unauthorized" });

    const period = (req.query.period as string | undefined) || "month";
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

  app.post("/api/payment/simulate", async (req, res) => {
    try {
      const { amount, orderId } = req.body;

      await new Promise((resolve) => setTimeout(resolve, 1500));

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

      if (attempt) deleteAttempts.delete(user.id);

      await storage.deleteUser(user.id);
      res.setHeader("Set-Cookie", "token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: "Failed to delete account", error: e.message });
    }
  });

  app.post("/api/receipt/generate", async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { orderId } = req.body;
      if (!orderId) return res.status(400).json({ message: "Order ID is required" });

      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });

      if (order.userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Generate HTML receipt
      const receiptHTML = generateReceiptHTML(order);

      // Set response headers for HTML file download
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="receipt-${order.id.substring(0, 8)}.html"`);
      res.send(receiptHTML);
    } catch (error: any) {
      res.status(500).json({ message: "Error generating receipt", error: error.message });
    }
  });

  const generateReceiptHTML = (order: any) => {
    const items = order.items || [];
    const subtotal = items.reduce((sum: number, item: any) => sum + (item.productPrice * item.quantity), 0);
    const tax = Math.round(subtotal * 0.1); // 10% tax
    const total = subtotal + tax;

    const itemsHTML = items
      .map(
        (item: any) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.productName}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${(item.productPrice / 100).toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${((item.productPrice * item.quantity) / 100).toFixed(2)}</td>
      </tr>
    `
      )
      .join("");

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Receipt - Order ${order.id}</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 20px;
          background: #f5f5f5;
        }
        .receipt {
          background: white;
          max-width: 800px;
          margin: 0 auto;
          padding: 40px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 40px;
          border-bottom: 2px solid #333;
          padding-bottom: 20px;
        }
        .header h1 {
          margin: 0;
          font-size: 28px;
          color: #333;
          font-weight: 300;
        }
        .header p {
          margin: 5px 0 0 0;
          color: #666;
          font-size: 14px;
        }
        .order-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-bottom: 40px;
          padding-bottom: 20px;
          border-bottom: 1px solid #eee;
        }
        .info-section h3 {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          color: #666;
          margin: 0 0 10px 0;
        }
        .info-section p {
          margin: 5px 0;
          color: #333;
          font-size: 14px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        table th {
          background: #f9f9f9;
          padding: 12px 10px;
          text-align: left;
          font-weight: 600;
          font-size: 13px;
          text-transform: uppercase;
          color: #666;
          border-bottom: 2px solid #ddd;
        }
        .totals {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 40px;
        }
        .totals-section {
          width: 300px;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          font-size: 14px;
          color: #333;
        }
        .total-row.subtotal {
          border-bottom: 1px solid #eee;
        }
        .total-row.tax {
          border-bottom: 1px solid #eee;
        }
        .total-row.final {
          border-top: 2px solid #333;
          padding-top: 15px;
          margin-top: 15px;
          font-size: 18px;
          font-weight: 600;
        }
        .footer {
          text-align: center;
          padding-top: 30px;
          border-top: 1px solid #eee;
          color: #666;
          font-size: 12px;
        }
        .status-badge {
          display: inline-block;
          padding: 5px 10px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          margin: 0 5px;
        }
        .status-paid {
          background: #d4edda;
          color: #155724;
        }
        .status-completed {
          background: #d1ecf1;
          color: #0c5460;
        }
        @media print {
          body {
            background: white;
            padding: 0;
          }
          .receipt {
            box-shadow: none;
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="receipt">
        <div class="header">
          <h1>RECEIPT</h1>
          <p>Order #${order.id.substring(0, 8).toUpperCase()}</p>
        </div>

        <div class="order-info">
          <div>
            <div class="info-section">
              <h3>Order Date</h3>
              <p>${new Date(order.createdAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <div class="info-section">
              <h3>Status</h3>
              <p>
                <span class="status-badge status-${order.paymentStatus}">${order.paymentStatus.toUpperCase()}</span>
                <span class="status-badge status-${order.status}">${order.status.toUpperCase()}</span>
              </p>
            </div>
          </div>
          <div>
            <div class="info-section">
              <h3>Bill To</h3>
              <p>${order.customerName}</p>
              <p>${order.customerEmail}</p>
              <p>${order.customerPhone}</p>
            </div>
            <div class="info-section">
              <h3>Ship To</h3>
              <p>${order.shippingAddress}</p>
              <p>${order.shippingCity}, ${order.shippingPostalCode}</p>
              <p>${order.shippingCountry}</p>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Unit Price</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="totals">
          <div class="totals-section">
            <div class="total-row subtotal">
              <span>Subtotal:</span>
              <span>$${(subtotal / 100).toFixed(2)}</span>
            </div>
            <div class="total-row tax">
              <span>Tax (10%):</span>
              <span>$${(tax / 100).toFixed(2)}</span>
            </div>
            <div class="total-row final">
              <span>Total:</span>
              <span>$${(total / 100).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div class="footer">
          <p>Thank you for your purchase!</p>
          <p>Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>

      <script>
        window.print();
      </script>
    </body>
    </html>
    `;
  };

  const httpServer = createServer(app);
  return httpServer;
}
