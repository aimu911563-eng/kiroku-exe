import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { debug } from "console";

export const publicRoutes = new Hono();

console.log("SHIFT_SUPABASE_URL exists?", !!process.env.SHIFT_SUPABASE_URL);
console.log(
  "SHIFT_SUPABASE_SERVICE_ROLE_KEY exists?",
  !!process.env.SHIFT_SUPABASE_SERVICE_ROLE_KEY
);

const supabase = createClient(
  process.env.SHIFT_SUPABASE_URL!,
  process.env.SHIFT_SUPABASE_SERVICE_ROLE_KEY! 
);

publicRoutes.get("/employees", async (c) => {
  const store_id = String(c.req.query("store_id") ?? "").trim();
  if (!store_id) return c.json({ ok: false, error: "store_id required" }, 400);

  const storeKey = String(store_id).trim();

  const q = await supabase
    .from("employees")
    .select("employee_id, employee_name, store_id, is_active")
    .eq("store_id", storeKey)
    .eq("is_active", true)
    .order("employee_id", { ascending: true });

  if (q.error) {
    return c.json({ ok: false, error: q.error.message }, 500);
  }

  return c.json({
    ok: true,
    store_id,
    employees: (q.data ?? []).map((e: any) => ({
      employee_id: e.employee_id,
      employee_name: e.employee_name,
    })),
  });
});
