import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";

export const cleaningRoutes = new Hono();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function todayJST(): string {
  // JSTの「今日」をYYYY-MM-DDで返す（サーバーがUTCでもズレない）
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

cleaningRoutes.post("/submit", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { store_id?: string; task_code?: string; names?: string[] }
    | null;

  const store_id = String(body?.store_id ?? "").trim();
  const task_code = String(body?.task_code ?? "").trim();
  const names = Array.isArray(body?.names)
    ? body!.names.map((s) => String(s).trim()).filter(Boolean)
    : [];

  if (!store_id || !task_code || names.length === 0) {
    return c.json({ ok: false, error: "bad_request" }, 400);
  }

  const date = todayJST();
  const nowIso = new Date().toISOString();
  const per = Number((1 / names.length).toFixed(2));

  // 0) 今日の行が無ければ作る（未完了の土台）
  // ※ onConflict が効くには cleaning_daily に (store_id,date,task_code) の UNIQUE が必要
  // 無いなら作って（下にSQL書く）
  const { error: ensureErr } = await supabase
    .from("cleaning_daily")
    .upsert(
      { store_id, date, task_code, chosen_at: nowIso, done_at: null, done_by: null, done_names: null },
      { onConflict: "store_id,date,task_code" }
    );

  if (ensureErr) return c.json({ ok: false, error: ensureErr.message }, 500);

  // 1) 「未完了の行だけ」完了に更新（ここで1日1回制御）
  const { data: updated, error: updErr } = await supabase
    .from("cleaning_daily")
    .update({
      done_at: nowIso,
      done_names: names,
      done_by: names.join(" / "), // 互換用（表示は done_names 推奨）
    })
    .eq("store_id", store_id)
    .eq("date", date)
    .eq("task_code", task_code)
    .is("done_at", null)
    .select("store_id")
    .maybeSingle();

  if (updErr) return c.json({ ok: false, error: updErr.message }, 500);
  if (!updated) return c.json({ ok: false, error: "already_done" }, 409);

  // 2) ランキング用ログ（複数人）
  const rows = names.map((employee_name) => ({
    store_id,
    date,
    task_code,
    employee_name,
    points: per,
    submitted_at: nowIso,
  }));

  const { error: logErr } = await supabase.from("cleaning_logs").insert(rows);
  if (logErr) {
    // dailyは完了になってるので、ログ失敗は原因が分かるように返す（運用で再実行可）
    return c.json({ ok: false, error: logErr.message }, 500);
  }

  return c.json({ ok: true, date, task_code, done_names: names, points_per_person: per, count: names.length });
});