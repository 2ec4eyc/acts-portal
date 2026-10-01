// Local server: serves /api through the same dispatcher as the Vercel Function (api/index.ts), plus
// the app (Vite dev middleware, or dist/ when NODE_ENV=production). Vercel does not use this file.
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.all("/api/{*route}", async (req, res) => {
    const { dispatch } = await import("./server/routes/index.js");
    try {
      await dispatch(req.path.replace(/^\/api\/?/, ""), req as never, res as never);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*path}', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
