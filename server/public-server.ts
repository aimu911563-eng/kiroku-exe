import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { debug } from "console";

export const publicRoutes = new Hono();

const supabase = createClient(
  process.env.SHIFT_SUPABASE_URL!,
  process.env.SHIFT_SUPABASE_SERVICE_ROLE_KEY! 
);

publicRoutes.get("/employees", async (c) => {
  const store_id = String(c.req.query("store_id") ?? "").trim();
  if (!store_id) return c.json({ ok: false, error: "store_id required" }, 400);

  /*const key = c.req.header("x-public-key") ?? "";
  if (key !== process.env.PUBLIC_EMPLOYEES_KEY) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }*/

  const keyHeader = c.req.header("x-public-key") ?? "";
  const keyQuery  = String(c.req.query("key") ?? "").trim();
  const key = keyHeader || keyQuery;

  if (key !== process.env.PUBLIC_EMPLOYEES_KEY) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }

  const prefix = `${store_id}%`;

  const { data, error } = await supabase
    .from("employees")
    .select("employee_id, employee_name, store_id, is_active")
    .eq("store_id", prefix)
    .eq("is_active", true)
    .order("employee_id", { ascending: true });

  if (error) return c.json({ ok: false, error: error.message }, 500);
  const storeKey = String(store_id).trim();

  const q = await supabase
    .from("employees")
    .select("employee_id, employee_name, store_id, is_active")
    .eq("store_id", storeKey)
    .eq("is_active", true)
    .order("employee_id", { ascending: true });

  return c.json({
    ok: true,
    store_id,
    employees: (q.data ?? []).map((e: any) => ({
      employee_id: e.employee_id,
      employee_name: e.employee_name,
    })),
  });

  return c.json({
    ok: true,
    store_id,
    employees: (data ?? []).map((e) => ({
      employee_id: e.employee_id,
      employee_name: e.employee_name,
    })),
  });
});

