import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProductSchema, insertOrderSchema, insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { createHash } from "crypto";
import path from "path";
import { signToken, verifyToken, hashPassword } from "./jwt";
import PDFDocument from "pdfkit";
import { authLimiter, loginLimiter, checkoutLimiter } from "./middleware";

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
    const maxAge = 12 * 60 * 60;
    const cookie = `token=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
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

  app.post("/api/auth/register", authLimiter, async (req, res) => {
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

      const user = await storage.createUser(parsed as any);
      res.status(201).json({ message: "Account created successfully", email: user.email });
    } catch (error: any) {
      if (error.message === 'EMAIL_ALREADY_EXISTS') {
        return res.status(400).json({ message: "Email already registered" });
      }
      const friendly = error?.errors?.[0]?.message || error?.message || "Invalid user data";
      res.status(400).json({ message: friendly });
    }
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
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

  const searchTermMappings: Record<string, string[]> = {
    // Categories - English
    "rings": ["ring", "rings"],
    "necklaces": ["necklace", "necklaces", "neck"],
    "bracelets": ["bracelet", "bracelets", "brace"],
    "earrings": ["earring", "earrings", "ear"],
    // Categories - Indonesian
    "cincin": ["ring", "rings"],
    "kalung": ["necklace", "necklaces"],
    "gelang": ["bracelet", "bracelets"],
    "anting": ["earring", "earrings"],
    // Categories - Spanish
    "anillos": ["ring", "rings"],
    "anillo": ["ring", "rings"],
    "collares": ["necklace", "necklaces"],
    "collar": ["necklace", "necklaces"],
    "pulseras": ["bracelet", "bracelets"],
    "pulsera": ["bracelet", "bracelets"],
    "aretes": ["earring", "earrings"],
    "arete": ["earring", "earrings"],
    // Categories - French
    "bagues": ["ring", "rings"],
    "bague": ["ring", "rings"],
    "colliers": ["necklace", "necklaces"],
    "collier": ["necklace", "necklaces"],
    "boucles": ["earring", "earrings"],
    // Materials - Indonesian
    "emas": ["gold"],
    "perak": ["silver"],
    "platinum": ["platinum"],
    "berlian": ["diamond"],
    "mutiara": ["pearl"],
    // Materials - Spanish
    "oro": ["gold"],
    "plata": ["silver"],
    "platino": ["platinum"],
    "diamante": ["diamond"],
    "perla": ["pearl"],
    // Materials - French
    "or": ["gold"],
    "argent": ["silver"],
    "platine": ["platinum"],
    "diamant": ["diamond"],
    "perle": ["pearl"],
  };

  app.get("/api/search", async (req, res) => {
    try {
      const q = (req.query.q as string | undefined)?.trim() || "";
      if (!q) return res.json([]);
      const products = await storage.getProducts();
      const query = q.toLowerCase();
      const searchTermsSet = new Set<string>([query]);
      
      for (const [key, values] of Object.entries(searchTermMappings)) {
        const queryWords = query.split(/\s+/);
        const keyWords = key.split(/\s+/);
        
        if (query === key || queryWords.some(qw => keyWords.includes(qw)) || keyWords.some(kw => queryWords.includes(kw))) {
          values.forEach(v => searchTermsSet.add(v));
        }
      }
      
      const searchTerms = Array.from(searchTermsSet);

      const scored = products
        .map((p) => {
          const hayName = p.name.toLowerCase();
          const hayDesc = p.description.toLowerCase();
          const hayMat = p.material.toLowerCase();
          const hayCat = p.category.toLowerCase();

          let score = 0;

          for (const term of searchTerms) {
            if (term === "ring" || term === "rings") {
              score += hayCat === "rings" ? 5 : 0;
            }
            if (term === "necklace" || term === "necklaces" || term === "neck") {
              score += hayCat === "necklaces" ? 5 : 0;
            }
            if (term === "bracelet" || term === "bracelets" || term === "brace") {
              score += hayCat === "bracelets" ? 5 : 0;
            }
            if (term === "earring" || term === "earrings" || term === "ear") {
              score += hayCat === "earrings" ? 5 : 0;
            }

            const wordBoundaryRegex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            
            if (wordBoundaryRegex.test(hayName)) {
              if (hayName.startsWith(term)) score += 6;
              else score += 4;
            } else if (hayName.includes(term)) {
              score += 2;
            }
            
            if (wordBoundaryRegex.test(hayMat)) score += 3;
            else if (hayMat.includes(term)) score += 1;
            
            if (wordBoundaryRegex.test(hayDesc)) score += 2;
            else if (hayDesc.includes(term)) score += 0.5;

            if (["rings","ring","necklace","necklaces","bracelet","bracelets","earring","earrings"].includes(term)) {
              const norm = term.endsWith("s") ? term : `${term}s`;
              if (hayCat === norm) score += 8;
            }
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
      const user = await getUserFromRequest(req);
      if (!user || user.role !== "admin") {
        return res.status(401).json({ message: "Unauthorized" });
      }
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
      const user = await getUserFromRequest(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      if (order.userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(order);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching order", error: error.message });
    }
  });

  app.post("/api/orders", checkoutLimiter, async (req, res) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      
      const { items, idempotencyKey, ...orderData } = req.body;
      
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
      
      const order = await storage.createOrder(validated, user.id, orderItemsData, idempotencyKey);
      res.status(201).json(order);
    } catch (error: any) {
      if (error.message?.includes('Insufficient stock')) {
        return res.status(409).json({ message: error.message });
      }
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

      const doc = new PDFDocument({ margin: 50 });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="receipt-${order.id.substring(0, 8)}.pdf"`);
      doc.pipe(res);      
      generateReceiptPDF(doc, order);
      doc.end();
    } catch (error: any) {
      res.status(500).json({ message: "Error generating receipt", error: error.message });
    }
  });

  const generateReceiptPDF = (doc: PDFKit.PDFDocument, order: any) => {
    const items = order.items || [];
    const subtotal = items.reduce((sum: number, item: any) => sum + (item.productPrice * item.quantity), 0);
    const tax = Math.round(subtotal * 0.1);
    const total = subtotal + tax;

    doc.fontSize(28).font('Helvetica-Bold').text('RECEIPT', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').text(`Order #${order.id.substring(0, 8).toUpperCase()}`, { align: 'center' });
    doc.moveDown(1);
    
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    const infoY = doc.y;
    
    doc.fontSize(10).font('Helvetica-Bold').text('ORDER DATE', 50, infoY);
    doc.fontSize(10).font('Helvetica').text(
      new Date(order.createdAt).toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      50,
      infoY + 15
    );
    
    doc.fontSize(10).font('Helvetica-Bold').text('STATUS', 50, infoY + 50);
    doc.fontSize(10).font('Helvetica')
      .text(`Payment: ${order.paymentStatus.toUpperCase()}`, 50, infoY + 65)
      .text(`Order: ${order.status.toUpperCase()}`, 50, infoY + 80);

    doc.fontSize(10).font('Helvetica-Bold').text('BILL TO', 320, infoY);
    doc.fontSize(10).font('Helvetica')
      .text(order.customerName, 320, infoY + 15)
      .text(order.customerEmail, 320, infoY + 30)
      .text(order.customerPhone, 320, infoY + 45);

    doc.fontSize(10).font('Helvetica-Bold').text('SHIP TO', 320, infoY + 70);
    doc.fontSize(10).font('Helvetica')
      .text(order.shippingAddress, 320, infoY + 85)
      .text(`${order.shippingCity}, ${order.shippingPostalCode}`, 320, infoY + 100)
      .text(order.shippingCountry, 320, infoY + 115);
    
    doc.y = infoY + 140;
    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    const tableTop = doc.y;
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Product', 50, tableTop);
    doc.text('Qty', 320, tableTop, { width: 50, align: 'center' });
    doc.text('Unit Price', 380, tableTop, { width: 80, align: 'right' });
    doc.text('Total', 470, tableTop, { width: 80, align: 'right' });

    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
    doc.moveDown(0.5);

    let itemY = tableTop + 25;
    doc.font('Helvetica').fontSize(10);
    
    items.forEach((item: any) => {
      if (itemY > 700) {
        doc.addPage();
        itemY = 50;
      }

      doc.text(item.productName, 50, itemY, { width: 250 });
      doc.text(item.quantity.toString(), 320, itemY, { width: 50, align: 'center' });
      doc.text(`$${(item.productPrice / 100).toFixed(2)}`, 380, itemY, { width: 80, align: 'right' });
      doc.text(`$${((item.productPrice * item.quantity) / 100).toFixed(2)}`, 470, itemY, { width: 80, align: 'right' });
      
      itemY += 25;
      
      doc.moveTo(50, itemY - 5).lineTo(550, itemY - 5).strokeOpacity(0.2).stroke().strokeOpacity(1);
    });

    doc.y = itemY + 10;
    const totalsX = 400;
    const totalsY = doc.y;

    doc.fontSize(10).font('Helvetica').text('Subtotal:', totalsX, totalsY, { width: 80, align: 'left' });
    doc.text(`$${(subtotal / 100).toFixed(2)}`, totalsX + 80, totalsY, { width: 70, align: 'right' });

    doc.text('Tax (10%):', totalsX, totalsY + 20, { width: 80, align: 'left' });
    doc.text(`$${(tax / 100).toFixed(2)}`, totalsX + 80, totalsY + 20, { width: 70, align: 'right' });

    doc.moveTo(totalsX, totalsY + 40).lineTo(550, totalsY + 40).stroke();

    doc.fontSize(14).font('Helvetica-Bold');
    doc.text('Total:', totalsX, totalsY + 50, { width: 80, align: 'left' });
    doc.text(`$${(total / 100).toFixed(2)}`, totalsX + 80, totalsY + 50, { width: 70, align: 'right' });

    doc.fontSize(10).font('Helvetica').fillColor('#666666');
    
    const footerY = 720;
    doc.moveTo(50, footerY).lineTo(550, footerY).stroke();
    doc.moveDown(0.5);
    
    doc.text('Thank you for your purchase!', 50, footerY + 10, { align: 'center' });
    doc.fontSize(8).text(
      `Generated on ${new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      })}`,
      50,
      footerY + 25,
      { align: 'center' }
    );
  };

  const httpServer = createServer(app);
  return httpServer;
}
