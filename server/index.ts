import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { inventoryRoutes } from "./inventory-server";
import { cors } from "hono/cors";
import { publicRoutes } from "./public-server.ts";
import { cleaningRoutes } from "./cleaning-server";
import { orderRoutes } from "./order-server.ts";
import { inventoryDateRoutes } from "./inventory-date-server.ts";



const app = new Hono();

app.use(
    "*",
    cors({
        origin: [
            "http://localhost:5173",
            "https://kiroku-exe.pages.dev",
            "http://127.0.0.1:5173",
        ],
        allowHeaders: ["Content-Type", "x-public-key"],
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    })
)

// Leave is an optional subsystem. Its Supabase project may be paused without
// preventing Inventory and Order from starting on Render.
if (process.env.LEAVE_SUPABASE_URL && process.env.LEAVE_SUPABASE_SERVICE_ROLE_KEY) {
    const { leaveRoutes } = await import("./leave-server");
    app.route("/api/leaves", leaveRoutes);
} else {
    app.all("/api/leaves", (c) => c.json({ ok: false, error: "leave service unavailable" }, 503));
    app.all("/api/leaves/*", (c) => c.json({ ok: false, error: "leave service unavailable" }, 503));
}
app.route("/api/inventory", inventoryRoutes);
app.route("/api/public", publicRoutes);
app.route("/api/cleaning", cleaningRoutes);
app.route("/api/order", orderRoutes);
app.route("/api/inventory-date", inventoryDateRoutes);
app.get("/api/health", (c) => c.json({ ok: true, service: "kiroku-api" }));

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 8787);
console.log("[server] booting...");
// Keep the existing Node authentication bindings unchanged. Passing every
// process variable here also changes Leave's legacy signing-key selection.
serve({ fetch: app.fetch, port, hostname: host });
console.log(`[server] (local) http://${host}:${port}`);
