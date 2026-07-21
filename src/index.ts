import express from "express";
import { loadConfig } from "./config";
import { startMonitor, stopMonitor } from "./monitor";
import routes from "./routes";

function main(): void {
  let cfg = loadConfig();

  if (!cfg.enabled) {
    console.log("[M1] M1_ENABLED=false — exiting. Set M1_ENABLED=true to activate.");
    process.exit(0);
  }

  const app = express();
  app.use(routes);

  const server = app.listen(cfg.port, () => {
    console.log(`[M1] Immortal Core running on port ${cfg.port}`);
    console.log(`[M1] Monitoring core Maya at ${cfg.coreMayaUrl}`);
    startMonitor(cfg);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n[M1] shutting down...");
    stopMonitor();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

try {
  main();
} catch (err) {
  console.error("[M1] fatal error:", err);
  process.exit(1);
}
