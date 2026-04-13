import { Hono } from "hono";
import { cors } from "hono/cors";
import { inventoryRoutes } from "./inventory-server";
import { leaveRoutes } from "./leave-server";
import { publicRoutes } from "./public-server"; 
import { orderRoutes } from "./order-server";


const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "https://<your-pages>.pages.dev"],
    allowHeaders: ["Content-Type", "x-public-key"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.route("/api/leaves", leaveRoutes);
app.route("/api/inventory", inventoryRoutes);
app.route("/api/public", publicRoutes);
app.route("/api/order", orderRoutes);

export default app;