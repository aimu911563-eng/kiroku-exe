// frontend/shiftflow/src/server.ts

import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const app = new Hono();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 受信データの最低限スキーマ
const shiftSchema = z.object({
  store_id: z.string().min(1),
  employee_id: z.string().min(1),
  employee_name: z.string().min(1),
  week_start: z.string().min(1), // 後で YYYY-MM-DD に縛ってもOK
  data: z.record(z.string(), z.string()),
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/shifts", async (c) => {
  const json = await c.req.json().catch(() => null);
  const parsed = shiftSchema.safeParse(json);

  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.flatten() }, 400);
  }

  const body = parsed.data;

  // 同週・同人・同店舗を確認
  const { data: existing, error: selErr } = await supabase
    .from("shift_submissions")
    .select("id")
    .eq("store_id", body.store_id)
    .eq("employee_id", body.employee_id)
    .eq("week_start", body.week_start)
    .maybeSingle();

  if (selErr) {
    return c.json({ ok: false, error: selErr.message }, 500);
  }

  // あれば更新、なければ新規
  if (existing?.id) {
    const { error: updErr } = await supabase
      .from("shift_submissions")
      .update({
        employee_name: body.employee_name,
        data: body.data,
        status: "updated",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updErr) return c.json({ ok: false, error: updErr.message }, 500);
    return c.json({ ok: true, mode: "updated" });
  } else {
    const { error: insErr } = await supabase.from("shift_submissions").insert({
      store_id: body.store_id,
      employee_id: body.employee_id,
      employee_name: body.employee_name,
      week_start: body.week_start,
      data: body.data,
      status: "submitted",
    });

    if (insErr) return c.json({ ok: false, error: insErr.message }, 500);
    return c.json({ ok: true, mode: "submitted" });
  }
});

app.get("/api/employee", async (c) => {
  const employeeId = c.req.query("employee_id")?.trim();
  if (!employeeId) {
    return c.json({ ok: false, error: "employee_id required" }, 400);
  }

  const { data, error } = await supabase
    .from("employees")
    .select("employee_id, employee_name, store_id")
    .eq("employee_id", employeeId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return c.json({ ok: false, error: error.message }, 500);
  }
  if (!data) {
    return c.json({ ok: false, error: "not found" }, 404);
  }

  return c.json({ ok: true, employee: data });
});

app.get("/api/shifts", async (c) => {
  const employeeId = c.req.query("employee_id")?.trim();
  const weekStart = c.req.query("week_start")?.trim();

  if (!employeeId || !weekStart) {
    return c.json(
      { ok: false, error: "employee_id and week_start required" },
      400
    );
  }

  const { data, error } = await supabase
    .from("shift_submissions")
    .select(
      "store_id, employee_id, employee_name, week_start, data, status, updated_at, created_at"
    )
    .eq("employee_id", employeeId)
    .eq("week_strat", weekStart)
    .maybeSingle();

  if (error) return c.json({ ok: false, error: error.message }, 500);
  if (!data) return c.json({ ok: false, error: "not found " }, 404);

  return c.json({ ok: true, submission: data });
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) });
console.log("ShiftFlow API running on http://localhost:8787");

