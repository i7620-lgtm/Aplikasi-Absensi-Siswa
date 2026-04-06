import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check for required environment variables
const requiredEnvVars = [
  "POSTGRES_URL",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "GOOGLE_CLIENT_ID",
];

requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    console.warn(`Warning: Environment variable ${varName} is not set. Some features may not work.`);
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Simple request logger
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log('Headers:', JSON.stringify(req.headers));
    next();
  });

  // Import handlers dynamically to avoid issues with missing dependencies during build
  let apiDataHandler: any;
  let apiIndexHandler: any;

  try {
    console.log("Importing API handlers...");
    apiDataHandler = (await import("./api/data.js")).default;
    apiIndexHandler = (await import("./api/index.js")).default;
    console.log("API handlers imported successfully.");
  } catch (err) {
    console.error("CRITICAL: Failed to import API handlers:", err);
    // Don't crash the server, but provide a fallback
    apiDataHandler = (req: any, res: any) => res.status(500).json({ error: "API Data Handler not available" });
    apiIndexHandler = (req: any, res: any) => res.status(500).send("<h1>500 - API Index Handler not available</h1>");
  }

  // API Routes
  app.post("/api/data", async (req: Request, res: Response) => {
    const action = req.body?.action;
    console.log(`[API] Received POST /api/data - Action: ${action}`);
    
    try {
      if (!apiDataHandler) {
        console.error("[API] apiDataHandler is missing!");
        return res.status(500).json({ error: "API Data Handler not available" });
      }
      
      if (typeof apiDataHandler !== 'function') {
        console.error("[API] apiDataHandler is not a function! Type:", typeof apiDataHandler);
        return res.status(500).json({ error: "API Data Handler configuration error" });
      }

      await apiDataHandler(req, res);
    } catch (error) {
      console.error(`[API] Error in /api/data (Action: ${action}):`, error);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: "Internal Server Error", 
          details: error instanceof Error ? error.message : String(error) 
        });
      }
    }
  });

  // Catch-all for any other /api routes to return JSON 404 instead of falling through to HTML
  app.all("/api/*", (req: Request, res: Response) => {
    console.warn(`[API] 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ 
      error: "API Route Not Found",
      method: req.method,
      path: req.url
    });
  });

  // Handle root with the api/index handler (which serves index.html)
  app.get("/", async (req: Request, res: Response, next) => {
    if (process.env.NODE_ENV !== "production") {
      return next();
    }
    try {
      await apiIndexHandler(req, res);
    } catch (error) {
      console.error("[Server] Error in root handler:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  // Handle POST to root (often used by Google OAuth redirect)
  app.post("/", async (req: Request, res: Response, next) => {
    console.log("[Server] Received POST to root (/). Likely OAuth redirect.");
    if (process.env.NODE_ENV !== "production") {
      // In dev, we might need to serve index.html manually if Vite doesn't handle POST to /
      try {
        await apiIndexHandler(req, res);
      } catch (e) {
        next();
      }
      return;
    }
    try {
      await apiIndexHandler(req, res);
    } catch (error) {
      next();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      console.log("Initializing Vite dev server...");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite dev server initialized.");
    } catch (viteError) {
      console.error("Failed to initialize Vite dev server:", viteError);
      // Fallback: serve static files if Vite fails
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.use(express.static(process.cwd()));
    }
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Fallback for other static files in root (js, css, etc.)
  app.use(express.static(process.cwd()));

  console.log(`Starting server on port ${PORT}...`);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
