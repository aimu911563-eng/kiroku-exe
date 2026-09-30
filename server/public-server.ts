import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";

export const publicRoutes = new Hono();

const shiftSupabaseUrl = process.env.SHIFT_SUPABASE_URL;
const shiftSupabaseServiceRoleKey = process.env.SHIFT_SUPABASE_SERVICE_ROLE_KEY;

if (!shiftSupabaseUrl || !shiftSupabaseServiceRoleKey) {
  throw new Error(
    "SHIFT_SUPABASE_URL and SHIFT_SUPABASE_SERVICE_ROLE_KEY are required",
  );
}

// Employee master data belongs to ShiftFlow, even when this route is consumed
// by the Inventory UI.
const supabase = createClient(
  shiftSupabaseUrl,
  shiftSupabaseServiceRoleKey,
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
