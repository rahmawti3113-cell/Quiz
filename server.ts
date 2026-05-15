import express from "express";
import { createServer as createViteServer } from "vite";
import apiApp from "./api/index.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Mount the API backend
  app.use(apiApp);

  // Vite middleware for development or Static server for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = await import("path").then((p) => p.join(process.cwd(), "dist"));
    app.use(express.static(distPath));
    app.get("*", async (req, res) => {
      res.sendFile(await import("path").then((p) => p.join(distPath, "index.html")));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
