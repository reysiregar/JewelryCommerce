import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { getStorage } from "./storage";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ limit: '50mb', extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await getStorage();
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.message?.includes('Connection pool')) {
      log(`[ERROR] Database connection issue: ${err.message}`);
      return res.status(503).json({ message: "Service temporarily unavailable. Please try again." });
    }

    res.status(status).json({ message });
    
    if (app.get("env") === "development") {
      throw err;
    } else {
      console.error('[ERROR]', err);
    }
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5173', 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    // Increase header size limits to handle large base64 images
    server.maxHeadersCount = 0;
    (server as any).maxRequestsPerSocket = 0;
    
    log(`serving on port ${port}`);
    log(`server running in ${app.get("env")} mode`);
    log(`Open http://localhost:${port} in your browser to view the app`);
    log(`Press CTRL-C to stop`);
  });
})();
