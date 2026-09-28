import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";

export const orderRoutes = new Hono();
export const inventoryDateRoutes = new Hono();

const supabase = createClient(
  process.env.LEAVE_SUPABASE_URL!,
  process.env.LEAVE_SUPABASE_SERVICE_ROLE_KEY!
);

inventoryDateRoutes.get("/items", async (c) => {
  const store_id = String(c.req.query("store_id") ?? "").trim();

  if (!store_id) {
    return c.json({ ok: false, error: "store_id required" }, 400);
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .select("item_code, name, shelf_life_days, display_order, store_id")
    .eq("store_id", store_id)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("inventory-date items error", error);
    return c.json({ ok: false, error: error.message }, 500);
  }

  return c.json({ ok: true, data });
});



