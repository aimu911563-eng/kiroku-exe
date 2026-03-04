import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { leaveRoutes } from "./leave-server";
import { inventoryRoutes } from "./inventory-server";
import { cors } from "hono/cors";
import { publicRoutes } from "./public-server.ts";
import { cleaningRoutes } from "./cleaning-server";
import dotenv from "dotenv";
dotenv.config({ path: "shiftflow/.env" }); // ←実際のパスに合わせて

const app = new Hono();

app.use(
    "*",
    cors({
        origin: [
            "http://localhost:5173",
            "https://<inventory>.pages.dev",
            "http://127.0.0.1:5173",
            "http://192.168.101.184:5173",
        ],
        allowHeaders: ["Content-Type", "x-public-key"],
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    })
)

app.route("/api/leaves", leaveRoutes);
app.route("/api/inventory", inventoryRoutes);
app.route("/api/public", publicRoutes);
app.route("/api/cleaning", cleaningRoutes);

const host = "0.0.0.0"
const port = 8787;
console.log("[server] booting...");
serve({ fetch: app.fetch, port, hostname: host });
console.log(`[server] (local) http://${host}:${port}`);
