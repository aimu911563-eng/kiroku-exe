import { Hono } from "hono";
import { orderRoutes } from "./order-server";

const app = new Hono();

app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  await next();
});

app.route("/api/order", orderRoutes);
app.get("/api/health", (c) => c.json({ ok: true, service: "kiroku-order-worker" }));

app.onError((error, c) => {
  console.error(error);
  return c.json({ ok: false, error: "Internal Server Error" }, 500);
});

export default app;
