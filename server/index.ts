import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { leaveRoutes } from "./leave-server";
import { inventoryRoutes } from "./inventory-server";
import { cors } from "hono/cors";

const app = new Hono();

app.use(
    "*",
    cors({
        origin: "http://localhost:5173",
        allowHeaders: ["Content-Type"],
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    })
)

app.route("/api/leaves", leaveRoutes);
app.route("/api/inventory", inventoryRoutes);

serve({ fetch: app.fetch, port: 8787 });
console.log("API on http://localhost:8787");

