// frontend/shiftflow/src/server.ts

import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createClient } from "@supabase/supabase-js";
//import { base64, base64url, z } from "zod";
import "dotenv/config";
import crypto from "crypto";
import { z } from "zod";
is_holiday: z.boolean().optional();




//const app = new Hono<{ Bindings: Env }>();
const app = new Hono<{ Bindings: Env; Variables: Variables }>();


const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

//管理者トークン　HMACでstore_idを発行、検証
function base64url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64: string) {
  const secret = (process.env.ADMIN_TOKEN_SECRET ?? "").trim();
  if (!secret) throw new Error("ADMIN_TOKEN_SECRET is missing");
  return crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

function issueAdminToken(payload: { store_id: string }) {
  const body = base64url(JSON.stringify(payload));
  const sig = sign(body);
  return `${body}.${sig}`;
}

function verifyAdminToken(token: string): { store_id: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig !== expected) return null;

  try {
    const json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return { store_id: String(json.store_id) };
  } catch {
    return null;
  }
}



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
    return c.json({ ok: true, mode: 'submitted' } as const);
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
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) return c.json({ ok: false, error: error.message }, 500);
  if (!data) return c.json({ ok: false, error: "not found " }, 404);

  return c.json({ ok: true, submission: data });
});

app.get('/api/shifts', async (c) => {
  const employeeId = c.req.query('employee_id')?.trim();
  const weekStart = c.req.query('week_start')?.trim();

  if (!employeeId || !weekStart) {
    return c.json({ ok: false, error: 'employee_name and week_start required' }, 400);
  }

  const { data, error } = await supabase
    .from('shift_submissions')
    .select('store_id, employee_id, employee_name, week_start, data')
    .eq('employee_id', employeeId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) return c.json({ ok: false, error: error.message }, 500);
  if (!data) return c.json({ ok: false, error: 'not found' }, 404);
  
  return c.json({ ok: true, submission: data });
});

//＝＝＝＝＝＝＝＝＝　管理者 (admin) ＝＝＝＝＝＝＝＝＝
app.use("/api/*", async (c, next) => {
  console.log("[API HIT]", c.req.method, c.req.path);
  await next();
});

import bcrypt from 'bcryptjs'
import type { MiddlewareHandler } from "hono";

type Variables = {
  admin_store_id: string;
};


const requireAdmin: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const auth = c.req.header("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  const payload = verifyAdminToken(token); // { store_id } or null
  if (!payload) return c.json({ ok: false, error: "Unauthorized" }, 401);

  c.set("admin_store_id", payload.store_id);
  await next();
};



// 　週✖️店舗の提出一覧
app.get('/api/admin/submissions', requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");
  const weekStart = c.req.query("week_start")?.trim();

  if (!weekStart) {
    return c.json({ ok: false, error: "week_start required" }, 400);
  }

  //employees (在籍者)
  const empRes = await supabase
    .from("employees")
    .select("employee_id, employee_name")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .order("employee_id", { ascending: true });

  if (empRes.error) { 
    return c.json ({ ok: false, error: empRes.error.message }, 500);
  }

  //submissions (その週だけ)
  const subRes = await supabase
    .from("shift_submissions")
    .select("employee_id, status, submitted_at, updated_at, created_at")
    .eq("store_id", storeId)
    .eq("week_start", weekStart);

  if (subRes.error) {
    return c.json({ ok: false, error: subRes.error.message }, 500);
  }

  const subMap = new Map((subRes.data ?? []).map((s) => [s.employee_id, s]));

  const rows = (empRes.data ?? []).map((e) => {
    const s = subMap.get(e.employee_id);
    return {
      employee_id: e.employee_id,
      employee_name: e.employee_name,
      status: s?.status ?? "not_submitted",
      submitted_at: s?.submitted_at ?? null,
      updated_at: s?.updated_at ?? null,
      created_at: s?.created_at ?? null,
    };
  });

  return c.json({ ok: true, rows});
});

//提出内容取得（１人）
app.get("/api/admin/submission", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id") as string;
  const employeeId = c.req.query("employee_id")?.trim();
  const weekStart = c.req.query("week_start")?.trim();

  if (!employeeId || !weekStart) {
    return c.json({ ok: false, error: "employee_id and week_start required" }, 400);
  }

  const { data, error } = await supabase
    .from("shift_submissions")
    .select("store_id, employee_id, employee_name, week_start, data, status, submitted_at, updated_at, created_at")
    .eq("store_id", storeId)
    .eq("employee_id", employeeId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) return c.json({ ok: false, error: error.message }, 500);
  if (!data) return c.json({ ok: false, error: "not found" }, 404);

  return c.json({ ok: true, submission: data });
});




//簡易トークン
function generateToken() {
  return crypto.randomUUID()
}

//メモリに保存
//本番にするならDBに sessions テーブルを作るのが理想
const sessionToken = new Map<string, { employee_id: string; store_id: string; employee_name: string }>()

app.post('/api/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z.object({
    employee_id: z.string().min(1),
    pin: z.string().regex(/^\d{4}$/),
  }).safeParse(body)

  if (!parsed.success) return c.json({ ok: false, error: 'invalid payload' }, 400)

  const { employee_id, pin } = parsed.data

  const { data: emp, error } = await supabase
    .from('employees')
    .select('employee_id, employee_name, store_id, pin_hash, is_active')
    .eq('empolyee_id', employee_id)
    .maybeSingle()

  if (error) return c.json({ ok: false, error: error.message }, 500)
  if (!emp || !emp.is_active) return c.json({ ok: false, error: 'not found' }, 404)
  if (!emp.pin_hash) return c.json({ ok: false, error: 'PIN未設定' }, 400)
 
    const ok = await bcrypt.compare(pin, emp.pin_hash)
  if (!ok) {
    return c.json ({ ok: false, error: 'PINが違います'}, 401)
  }

  const token = generateToken()
  sessionToken.set(token, {
    employee_id: emp.employee_id,
    employee_name: emp.employee_name,
    store_id: emp.store_id,
  })

  return c.json({ ok: true, token, employee: sessionToken.get(token) })
})

//server.ts (4) から　
type Env = {
  ADMIN_PASSWORD: string;
  ADMIN_TOKEN: string;
};

app.get("/api/public/stores", async (c) => {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name")
    .order("id", { ascending: true });

  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true, stores: data ?? [] });
});

/*function requireAdmin(c: any, next: any) {
  const auth = c.req.header("Authorization") ?? ""; // ← header()
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const verified = token ? verifyAdminToken(token) : null;

  if (!verified) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  c.set("admin_store_id", verified.store_id);
  return next();


}*/

//店舗一覧API
app.get("/api/admin/stores", async (c) => {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name")
    .order("id", {ascending: true});
  
    if (error) return c.json({ ok: false, error: error.message }, 500);
    return c.json({ ok: true, stores: data ?? [] });
});



//ログイン
app.post("/api/admin/login", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { password?: string; store_id?: string }
    | null;
  
    const password = (body?.password ?? "").trim();
    const storeId = (body?.store_id ?? "").trim();
    const expectedPw = (process.env.ADMIN_PASSWORD ?? "").trim();

    if (!storeId) return c.json({ ok: false, error: "店舗を選択してください" }, 400);
    if (!password) return c.json({ ok: false, error: "パスワードが必要です" }, 400);
    if (password !== expectedPw) return c.json({ ok: false, error: "パスワードが違います" }, 401);

    console.log("[admin/login] expectedPw=", JSON.stringify(expectedPw), "len=", expectedPw.length);
    console.log("[admin/login] gotPw     =", JSON.stringify(password), "len=", password.length);

    //store_id　が実在するかチェック（不正store_idでトークン発酵させない）
    const { data: store, error } = await supabase
      .from("stores")
      .select("id")
      .eq("id", storeId)
      .maybeSingle();

    if (error) return c.json({ ok: false, error: error.message }, 500);
    if (!store) return c.json({ ok: false, error: "不正な店舗です" }, 400);

    const got = password.trim();
    const exp = expectedPw.trim();

    console.log("[admin/login] expTrimLen=", exp.length, "gotTrimLen=", got.length);


    const token = issueAdminToken({ store_id: storeId });
    return c.json({ ok: true, token});
});



// エラー確認
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal Server Error", detail: String(err) }, 500);
});




export default app;




serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) });
console.log("ShiftFlow API running on http://localhost:8787");

