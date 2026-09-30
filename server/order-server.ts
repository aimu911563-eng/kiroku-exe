import { Hono } from "hono";
import { inventorySupabase as supabase } from "./inventory-supabase";
import crypto from "node:crypto";

export const orderRoutes = new Hono();
export const inventoryRoutes = new Hono();

const ORDER_ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function orderAdminSecret() {
    return process.env.ORDER_ADMIN_TOKEN_SECRET ?? process.env.ADMIN_TOKEN_SECRET ?? "";
}

function signOrderAdminToken(storeId: string) {
    const body = Buffer.from(JSON.stringify({ store_id: storeId, exp: Date.now() + ORDER_ADMIN_TOKEN_TTL_MS })).toString("base64url");
    const signature = crypto.createHmac("sha256", orderAdminSecret()).update(body).digest("base64url");
    return `${body}.${signature}`;
}

function verifyOrderAdminToken(token: string) {
    const [body, signature] = token.split(".");
    if (!body || !signature || !orderAdminSecret()) return null;
    const expected = crypto.createHmac("sha256", orderAdminSecret()).update(body).digest("base64url");
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
        if (!payload?.store_id || Number(payload.exp) < Date.now()) return null;
        return String(payload.store_id);
    } catch {
        return null;
    }
}

function orderAdminStore(c: any) {
    const auth = c.req.header("Authorization") ?? "";
    return verifyOrderAdminToken(auth.startsWith("Bearer ") ? auth.slice(7).trim() : "");
}

orderRoutes.post("/admin/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const storeId = String(body?.store_id ?? "").trim();
    const password = String(body?.password ?? "");
    const expectedPassword = process.env.ORDER_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "";
    if (!expectedPassword || !orderAdminSecret()) {
        return c.json({ ok: false, error: "発注管理の認証設定がありません" }, 503);
    }
    if (!/^(7249|7539)$/.test(storeId) || password !== expectedPassword) {
        return c.json({ ok: false, error: "店舗またはパスワードが違います" }, 401);
    }
    return c.json({ ok: true, token: signOrderAdminToken(storeId), store_id: storeId });
});

orderRoutes.get("/admin/items", async (c) => {
    const storeId = orderAdminStore(c);
    if (!storeId) return c.json({ ok: false, error: "Unauthorized" }, 401);
    const [itemsResult, yieldsResult] = await Promise.all([
        supabase.from("inventory_items")
            .select("item_code,name,category,priority,display_order,is_active")
            .eq("store_id", storeId).eq("is_active", true)
            .order("display_order", { ascending: true }),
        supabase.from("yield_rates")
            .select("item_code,per_100k,budget_type")
            .eq("store_id", storeId),
    ]);
    const error = itemsResult.error || yieldsResult.error;
    if (error) return c.json({ ok: false, error: error.message }, 500);
    const yieldMap = new Map((yieldsResult.data ?? []).map((row) => [row.item_code, row]));
    const items = (itemsResult.data ?? []).map((item) => ({
        ...item,
        per_100k: Number(yieldMap.get(item.item_code)?.per_100k ?? 0),
        budget_type: String(yieldMap.get(item.item_code)?.budget_type ?? "base"),
    }));
    return c.json({ ok: true, store_id: storeId, items });
});

orderRoutes.put("/admin/items", async (c) => {
    const storeId = orderAdminStore(c);
    if (!storeId) return c.json({ ok: false, error: "Unauthorized" }, 401);
    const body = await c.req.json().catch(() => null);
    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0 || items.length > 200) return c.json({ ok: false, error: "items required" }, 400);
    const normalized = items.map((item: any, index: number) => ({
        item_code: String(item?.item_code ?? "").trim(),
        name: String(item?.name ?? "").trim(),
        per_100k: Number(item?.per_100k),
        budget_type: String(item?.budget_type ?? "base"),
        display_order: index + 1,
    }));
    if (normalized.some((item: any) => !item.item_code || !item.name || !Number.isFinite(item.per_100k) || item.per_100k < 0 || !["base", "onion", "mushroom"].includes(item.budget_type))) {
        return c.json({ ok: false, error: "食材名またはイールド数を確認してください" }, 400);
    }
    const [itemResult, yieldResult] = await Promise.all([
        supabase.from("inventory_items").upsert(
            normalized.map((item: any) => ({ store_id: storeId, item_code: item.item_code, name: item.name, display_order: item.display_order, updated_at: new Date().toISOString() })),
            { onConflict: "store_id,item_code" },
        ),
        supabase.from("yield_rates").upsert(
            normalized.map((item: any) => ({ store_id: storeId, item_code: item.item_code, per_100k: item.per_100k, budget_type: item.budget_type, updated_at: new Date().toISOString() })),
            { onConflict: "store_id,item_code" },
        ),
    ]);
    const error = itemResult.error || yieldResult.error;
    if (error) return c.json({ ok: false, error: error.message }, 500);
    return c.json({ ok: true, updated: normalized.length });
});

orderRoutes.get("/admin/budgets", async (c) => {
    const storeId = orderAdminStore(c);
    if (!storeId) return c.json({ ok: false, error: "Unauthorized" }, 401);
    const month = String(c.req.query("month") ?? "");
    if (!/^\d{4}-\d{2}$/.test(month)) return c.json({ ok: false, error: "month must be YYYY-MM" }, 400);
    const [year, monthNumber] = month.split("-").map(Number);
    const start = `${month}-01`;
    const next = new Date(year, monthNumber, 1);
    const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
    const { data, error } = await supabase.from("order_budgets")
        .select("id,order_date,base_budget,onion_budget,mushroom_budget,note,updated_at")
        .eq("store_id", storeId).gte("order_date", start).lt("order_date", end)
        .order("order_date", { ascending: true });
    if (error) return c.json({ ok: false, error: error.message }, 500);
    return c.json({ ok: true, store_id: storeId, month, budgets: data ?? [] });
});

orderRoutes.put("/admin/budgets", async (c) => {
    const storeId = orderAdminStore(c);
    if (!storeId) return c.json({ ok: false, error: "Unauthorized" }, 401);
    const body = await c.req.json().catch(() => null);
    const budgets = Array.isArray(body?.budgets) ? body.budgets : [];
    if (budgets.length === 0 || budgets.length > 62) return c.json({ ok: false, error: "budgets required" }, 400);
    const normalized = budgets.map((row: any) => ({
        order_date: String(row?.order_date ?? ""),
        base_budget: Number(row?.base_budget),
        onion_budget: Number(row?.onion_budget),
        mushroom_budget: Number(row?.mushroom_budget),
    }));
    if (normalized.some((row: any) => !/^\d{4}-\d{2}-\d{2}$/.test(row.order_date) || [row.base_budget, row.onion_budget, row.mushroom_budget].some((value) => !Number.isFinite(value) || value < 0))) {
        return c.json({ ok: false, error: "日付または予算額を確認してください" }, 400);
    }
    const dates = normalized.map((row: any) => row.order_date);
    const existingResult = await supabase.from("order_budgets").select("id,order_date").eq("store_id", storeId).in("order_date", dates);
    if (existingResult.error) return c.json({ ok: false, error: existingResult.error.message }, 500);
    const existing = new Map((existingResult.data ?? []).map((row) => [row.order_date, row.id]));
    const results = await Promise.all(normalized.map((row: any) => {
        const payload = { ...row, store_id: storeId, updated_at: new Date().toISOString() };
        const id = existing.get(row.order_date);
        return id
            ? supabase.from("order_budgets").update(payload).eq("id", id)
            : supabase.from("order_budgets").insert(payload);
    }));
    const error = results.find((result) => result.error)?.error;
    if (error) return c.json({ ok: false, error: error.message }, 500);
    return c.json({ ok: true, updated: normalized.length });
});

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

