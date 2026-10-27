import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { orderRoutes } from "./order-server.ts";



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

app.all("/api/leaves", (c) => c.json({ ok: false, error: "leave service retired" }, 410));
app.all("/api/leaves/*", (c) => c.json({ ok: false, error: "leave service retired" }, 410));
const inventoryRetired = (c: any) => c.json({ ok: false, error: "inventory service retired" }, 410);
app.all("/api/inventory", inventoryRetired);
app.all("/api/inventory/*", inventoryRetired);
app.all("/api/public/*", inventoryRetired);
app.all("/api/cleaning/*", inventoryRetired);
app.all("/api/inventory-date/*", inventoryRetired);
app.route("/api/order", orderRoutes);
app.get("/api/health", (c) => c.json({ ok: true, service: "kiroku-api" }));

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 8787);
console.log("[server] booting...");
// Keep the existing Node authentication bindings unchanged. Passing every
// process variable here also changes Leave's legacy signing-key selection.
serve({ fetch: app.fetch, port, hostname: host });
console.log(`[server] (local) http://${host}:${port}`);
