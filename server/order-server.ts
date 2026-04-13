import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";

export const orderRoutes = new Hono();
export const inventoryRoutes = new Hono();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

orderRoutes.get("/calc", async (c) => {
    try {
        const store_id = String(c.req.query("store_id") ?? "").trim();
        const date = String(c.req.query("date") ?? "").trim();

        if (!store_id || !date) {
            return c.json({ ok: false, error: "store_id and date required" }, 400);
        }

        const { data, error } = await supabase 
            .from("order_calc_view")
            .select("*")
            .eq("store_id", store_id)
            .eq("order_date", date)
            .order("display_order", { ascending: true });

        if (error) {
            return c.json({ ok: false, error: error.message }, 500);
        }

        return c.json({ ok: true, data: data });
    } catch (e: any) {
        return c.json({ ok: false, error: e.message }, 500);
    }
});



