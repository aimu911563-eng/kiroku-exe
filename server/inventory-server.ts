import { Hono } from "hono";
import { createClient } from '@supabase/supabase-js'
import { required } from "zod/mini";
import { error } from "console";
import { fa } from "zod/v4/locales";

export const inventoryRoutes = new Hono();

// 疎通確認（ブラウザで開ける）
inventoryRoutes.get("/health", (c) => c.json({ ok: true }));

const supabase = createClient (
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

function ymdJst(d = new Date()) {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

inventoryRoutes.get("/view", async (c) => {
  const store_id = String(c.req.query("store_id") ?? "")?.trim();
  const range = String(c.req.query("range") ?? "day");

  const allowed = new Set(["7249", "7539", "7109"]);
  if (!allowed.has(store_id)) {
    return c.json({ ok: false, error: "invalid store_id",}, 400);
  }

  // day 
  let forecastSales = 0;
  if (range === "day") {
    const today = new Date().toISOString().slice(0, 10);

    const { data } = await supabase
      .from("sales_forecasts")
      .select("forecast_sales")
      .eq("store_id", store_id)
      .eq("date", today)
      .single();
    
    forecastSales = Number(data?.forecast_sales ?? 0);
  }

  // week
  if (range === "week") {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 -day; // 月曜開始

    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const from = ymdJst(monday);
    const to = ymdJst(sunday);

    const { data } = await supabase
      .from("sales_forecasts")
      .select("forecast_sales")
      .eq("store_id", store_id)
      .gte("date", from)
      .lte("date", to)

    forecastSales = (data ?? []).reduce(
      (sum, r) => sum + Number(r.forecast_sales ?? 0),
      0
    );
  }

  // DBから品目を取得
  const { data: items, error: itemsErr } = await supabase 
    .from("inventory_items")
    .select("item_code,name,unit,pack_qty,display_order,is_active,priority,category,shelf_life_days")
    .eq("store_id", store_id)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (itemsErr) {
    return c.json({ ok: false, error: itemsErr.message }, 500);
  }

  // yield一覧
  const { data: yields, error: yieldErr } = await supabase
    .from("yield_rates")
    .select("item_code, per_100k")
    .eq("store_id", store_id);
  
    if (yieldErr) return c.json({ ok: false, error: yieldErr.message }, 500);

  const perMap = new Map<string, number>();
  for (const y of yields ?? []) {
    perMap.set(String(y.item_code), Number(y.per_100k ?? 0));
  }

  // 中身→計算
  const rows = (items ?? []).map((it: any) => {
    const itemCode = String(it.item_code);
    const per100kCases = perMap.get(itemCode) ?? 0;
    const packQty = Number(it.pack_qty ?? 0) || 0;

    const rawCases = (forecastSales / 100000) * per100kCases;

    // ケース数
    const requiredCases = Math.ceil(rawCases);

    // pack_qtyにあるものだけ　
    const requiredUnits = packQty >= 2 ? Math.ceil(rawCases * packQty) : null;

    return {
      item_code: itemCode,
      name: String(it.name ?? ""),
      unit: String(it.unit ?? ""),
      category: String(it.category ?? ""),
      required_unit: requiredUnits,
      required_qty: requiredCases,
      pack_qty: packQty || null,
      per_100k: per100kCases,
      shelf_life_days: it.shelf_life_days,
    }
  });

  return c.json({ 
    ok: true,
    store_id,
    updated_at: new Date().toISOString(),
    forecast_sales: forecastSales,
    items: rows,
  })
});

inventoryRoutes.get("/cleaning/today", async (c) => {
  const store_id = String(c.req.query("store_id") ?? "").trim();
  if (!store_id) return c.json({ ok: false, error: "store_id required" }, 400);

  const date = ymdJst();

  // 今日の割り当てがあるか
  const daily = await supabase
    .from("cleaning_daily")
    .select("task_code")
    .eq("store_id", store_id)
    .eq("date", date)
    .maybeSingle();

  if (daily.error) return c.json({ ok: false, error: daily.error.message }, 500);

  let task_code = daily.data?.task_code as string | undefined;

  // なければ active からランダムで確定して insert
  if (!task_code) {
    const tasks = await supabase 
      .from("cleaning_tasks")
      .select("task_code, task_name")
      .eq("store_id", store_id)
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (tasks.error) return c.json({ ok: false, error: tasks.error.message }, 500);
      const list = tasks.data ?? [];
    if (list.length === 0) return c.json({ ok: false, error: "no active tasks" }, 400);

    const pick = list[Math.floor(Math.random() * list.length)];
    task_code = pick.task_code;
    
    // 同時アクセス競合しても,primary key で弾く
    const ins = await supabase.from("cleaning_daily").insert({
      store_id,
      date,
      task_code,
    });

    // 競合で失敗した可能性があるため、再取得
    if (ins.error) {
      const retry = await supabase 
        .from("cleaning_daily")
        .select("task_code")
        .eq("store_id", store_id)
        .eq("date", date)
        .maybeSingle();

      if (retry.error || !retry.data?.task_code) {
        return c.json({ ok: false, error: ins.error.message }, 500);
      }
      task_code = retry.data.task_code;
    }
  }

  // task_name　取得
  const task = await supabase
    .from("cleaning_tasks")
    .select("task_code, task_name")
    .eq("store_id", store_id)
    .eq("task_code", task_code)
    .maybeSingle();

  if (task.error || !task.data) return c.json({ ok: false, error: task.error?.message ?? "task not found" }, 500);

  // 今日の最新完了ログ
  const log = await supabase
    .from("cleaning_logs")
    .select("employee_name, submitted_at")
    .eq("store_id", store_id)
    .eq("date", date)
    .order("submitted_at", { ascending: false})
    .limit(1);

  if (log.error) return c.json({ ok: false, error: log.error.message }, 500);

  const last = (log.data ?? [])[0];

  return c.json({
    ok: true,
    store_id,
    date,
    task_code: task.data.task_code,
    task_name: task.data.task_name ?? null,
    done_by: last?.employee_name ?? null,
    done_at: last?.submitted_at ?? null,
  });
});

inventoryRoutes.post("/cleaning/done", async (c) => {
  const body = await c.req.json().catch(() => null);
  const store_id = String(body?.store_id ?? "").trim();
  const employee_name = String(body?.employee_name ?? "").trim();

  if (!store_id) return c.json({ ok: false, error: "store_id required "}, 400);
  if (!employee_name) return c.json({ ok: false, error: "employee_name required "}, 400);

  const date = ymdJst();

  // 今日のtask_codeを取得（なければtodayを踏む）
  const daily = await supabase
    .from("cleaning_daily")
    .select("task_code")
    .eq("store_id", store_id)
    .eq("date", date)
    .maybeSingle();

  if (daily.error) return c.json({ ok: false, error: daily.error.message }, 500)
  if (!daily.data?.task_code) {
    return c.json({ ok: false, error: "today task not chosen yet "}, 409);
  }

  const task_code = daily.data.task_code;

  const ins = await supabase.from("cleaning_logs").insert({
    store_id,
    date,
    task_code,
    employee_name,
  });

  if (ins.error) return c.json({ ok: false, error: ins.error.message }, 500);

  return c.json({
    ok: true,
    store_id,
    date,
    task_code,
    employee_name,
  });
});

