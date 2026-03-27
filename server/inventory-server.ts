import { Hono } from "hono";
import { createClient } from '@supabase/supabase-js'
import { required } from "zod/mini";
import { error } from "console";
import { fa } from "zod/v4/locales";
import { join } from "path";
import { allowedNodeEnvironmentFlags } from "process";
import { compare } from "bcryptjs";

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

function getWeekStartJst(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 -day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
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
  if (!store_id) {
    return c.json({ ok: false, error: "store_id required" }, 400);
  }

  const date = ymdJst();

  // 今日の割り当てがあるか
  const daily = await supabase
    .from("cleaning_daily")
    .select("task_code")
    .eq("store_id", store_id)
    .eq("date", date)
    .maybeSingle();

  if (daily.error) {
    return c.json({ ok: false, error: daily.error.message }, 500);
  }

  let task_code = daily.data?.task_code as string | undefined;

  // なければ「今週未使用」から選んで確定
  if (!task_code) {
    const weekStart = getWeekStartJst(date);

    const tasks = await supabase
      .from("cleaning_tasks")
      .select("task_code, task_name")
      .eq("store_id", store_id)
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (tasks.error) {
      return c.json({ ok: false, error: tasks.error.message }, 500);
    }

    const allTasks = tasks.data ?? [];
    if (allTasks.length === 0) {
      return c.json({ ok: false, error: "no active tasks" }, 400);
    }

    // 今週すでに使った task_code を取得
    const used = await supabase
      .from("cleaning_daily")
      .select("task_code")
      .eq("store_id", store_id)
      .gte("date", weekStart)
      .lte("date", date);

    if (used.error) {
      return c.json({ ok: false, error: used.error.message }, 500);
    }

    const usedSet = new Set(
      (used.data ?? [])
        .map((r) => String(r.task_code ?? "").trim())
        .filter(Boolean)
    );

    // 今週未使用だけに絞る
    let candidates = allTasks.filter((t) => !usedSet.has(t.task_code));

    // 候補ゼロなら全体から選ぶ
    // （タスク数 < 7 の場合や、例外時の保険）
    if (candidates.length === 0) {
      candidates = allTasks;
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    task_code = pick.task_code;

    // 同時アクセス競合しても primary key で弾く
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

  // task_name 取得
  const task = await supabase
    .from("cleaning_tasks")
    .select("task_code, task_name")
    .eq("store_id", store_id)
    .eq("task_code", task_code)
    .maybeSingle();

  if (task.error || !task.data) {
    return c.json(
      { ok: false, error: task.error?.message ?? "task not found" },
      500
    );
  }

  // 今日の完了ログ
  const logs = await supabase
    .from("cleaning_logs")
    .select("employee_name, submitted_at")
    .eq("store_id", store_id)
    .eq("date", date)
    .order("submitted_at", { ascending: true });

  if (logs.error) {
    return c.json({ ok: false, error: logs.error.message }, 500);
  }

  const rows = logs.data ?? [];

  const done_names = Array.from(
    new Set(
      rows
        .map((r) => String(r.employee_name ?? "").trim())
        .filter(Boolean)
    )
  );

  const done_at = rows.length ? rows[rows.length - 1].submitted_at : null;

  return c.json({
    ok: true,
    store_id,
    date,
    task_code: task.data.task_code,
    task_name: task.data.task_name ?? null,
    done_by: done_names.length ? done_names.join(" / ") : null,
    done_at,
    done_names,
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


// -------------- inventory 管理画面　--------------

function getMonthRangeJst() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const monthStart = `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const next = new Date(y, m + 1, 1);
  const nextMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;

  return { monthStart, nextMonth };
}

function monthKeyJst() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

inventoryRoutes.get("/admin/summary", async (c) => {
  try {
    const store_id = String(c.req.query("store_id") ?? "").trim();
    if (!store_id) {
      return c.json({ ok: false, error: "store_id required" }, 400);
    }

    const date = ymdJst();
    const { monthStart, nextMonth } = getMonthRangeJst()

    // 1. forecast
    const forecastRes = await supabase
      .from("sales_forecasts")
      .select("forecast_sales")
      .eq("store_id", store_id)
      .eq("date", date)
      .maybeSingle();

    if (forecastRes.error) {
      return c.json({ ok: false, error: `sales_forecasts: ${forecastRes.error.message}` }, 500);
    }

    const forecast_sales = Number(forecastRes.data?.forecast_sales ?? 0);

    // 2. cleaning_daily
    const cleaningDailyRes = await supabase
      .from("cleaning_daily")
      .select("task_code, done_at, done_by, done_names")
      .eq("store_id", store_id)
      .eq("date", date)
      .maybeSingle();

    if (cleaningDailyRes.error) {
      return c.json({ ok: false, error: `cleaning_daily: ${cleaningDailyRes.error.message}` }, 500);
    }

    const daily = cleaningDailyRes.data;

    // 3. task name
    let task_name: string | null = null;
    if (daily?.task_code) {
      const taskRes = await supabase
        .from("cleaning_tasks")
        .select("task_name")
        .eq("store_id", store_id)
        .eq("task_code", daily.task_code)
        .maybeSingle();

      if (taskRes.error) {
        return c.json({ ok: false, error: `cleaning_tasks: ${taskRes.error.message}` }, 500);
      }

      task_name = taskRes.data?.task_name ?? null;
    }

    const rankingRes = await supabase
      .from("cleaning_logs")
      .select("employee_name, points")
      .eq("store_id", store_id)
      .gte("date", monthStart)
      .lt("date", nextMonth);

    if (rankingRes.error) {
      return c.json({ ok: false, error: `cleaning_logs: ${rankingRes.error.message}` }, 500);
    }

    const rankingMap = new Map<string, { employee_name: string; count: number; points: number }>();

    for (const row of rankingRes.data ?? []) {
      const name = row.employee_name ?? "不明";
      const prev = rankingMap.get(name);

      if (prev) {
        prev.count += 1;
        prev.points += Number(row.points ?? 0);
      } else {
        rankingMap.set(name, {
          employee_name: name,
          count: 1,
          points: Number(row.points ?? 0),
        });
      }
    }

    const ranking_top5 = Array.from(rankingMap.values())
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.count - a.count;
      })
      .slice(0, 5);

    // 5. items
    const itemsRes = await supabase
      .from("inventory_items")
      .select("item_code, name, category, unit, pack_qty, display_order")
      .eq("store_id", store_id)
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (itemsRes.error) {
      return c.json({ ok: false, error: `inventory_items: ${itemsRes.error.message}` }, 500);
    }

    const yieldsRes = await supabase
      .from("yield_rates")
      .select("item_code, per_100k")
      .eq("store_id", store_id);

    if (yieldsRes.error) {
      return c.json({ ok: false, error: `yield_rates: ${yieldsRes.error.message}` }, 500);
    }

    const yieldMap = new Map(
      (yieldsRes.data ?? []).map((x) => [x.item_code, Number(x.per_100k ?? 0)])
    );

    const items = (itemsRes.data ?? []).map((item) => {
      const per100k = yieldMap.get(item.item_code) ?? 0;
      const required_unit = Math.ceil((forecast_sales / 100000) * per100k);
      const pack_qty = Number(item.pack_qty ?? 1) || 1;
      const required_qty = Math.ceil(required_unit / pack_qty);

      return {
        item_code: item.item_code,
        name: item.name,
        category: item.category,
        required_unit,
        pack_qty,
        required_qty,
        unit: item.unit ?? "個",
      };
    });

    return c.json({
      ok: true,
      store_id,
      date,
      forecast_sales,
      weather: {
        label: "取得準備中",
        temp_max: null,
        rain_hours: [],
      },
      cleaning: {
        task_code: daily?.task_code ?? null,
        task_name,
        done: !!daily?.done_at,
        completed_by: daily?.done_by ?? null,
        completed_at: daily?.done_at ?? null,
        done_names: daily?.done_names ?? [],
      },
      ranking_top5,
      items,
    });
  } catch (err) {
    console.error("/admin/summary error", err);
    return c.json({ ok: false, error: "internal server error" }, 500);
  }
});
