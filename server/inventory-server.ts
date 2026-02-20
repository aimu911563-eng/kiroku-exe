import { Hono } from "hono";
import { createClient } from '@supabase/supabase-js'
import { required } from "zod/mini";

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
    .select("item_code,name,unit,pack_qty,display_order,is_active,priority,category")
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
    const per100k = perMap.get(itemCode) ?? 0;
    const packQty = Number(it.pack_qty ?? 1) || 1;

    const requiredUnits = Math.ceil((forecastSales / 100000) * per100k);
    const requiredCases = Math.ceil(requiredUnits / packQty);

    return {
      item_code: itemCode,
      name: String(it.name ?? ""),
      unit: String(it.unit ?? ""),
      required_qty: requiredCases,
      category: String(it.category ?? ""),
      // デバック用↓
      required_unit: requiredUnits,
      pack_qty: packQty,
      per_100k: per100k,
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

