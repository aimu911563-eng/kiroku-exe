// frontend/shiftflow/src/server.ts

import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { z } from "zod";
is_holiday: z.boolean().optional();

//const app = new Hono<{ Bindings: Env; Variables: Variables }>();



const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PUBLIC_DEMO?: string;
  DEMO_STORE_ID?: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("shiftflow-api ok"));
app.get("/api/health", (c) => c.json({ ok: true }));


const getSupabase = (c: any) => {
  return createClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

app.get("/api/example", async (c) => {
  const supabase = getSupabase(c);

  const { data, error } = await supabase
    .from("shift_submissions")
    .select("*");

  return c.json({ data, error });
});



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

function verifyToken<T>(token: string, secret: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (expected.length !== sig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;

  try {
    const json = Buffer.from(body, "base64url").toString("utf-8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

//従業員ログイン共通関数

function signToken(payload: any, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const  sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

// 受信データの最低限スキーマ
const shiftSchema = z.object({
  store_id: z.string().min(1),
  employee_id: z.string().min(1),
  employee_name: z.string().min(1),
  week_start: z.string().min(1), // 後で YYYY-MM-DD に縛ってもOK
  data: z.record(z.string(), z.string()),
  is_holiday: z.boolean(),
  comment: z.string().max(300).optional().nullable(),
});

app.get("/api/health", (c) => c.json({ ok: true }));


//＝＝＝＝＝＝＝＝＝　管理者 (admin) ＝＝＝＝＝＝＝＝＝
app.use("/api/*", async (c, next) => {
  console.log("[API HIT]", c.req.method, c.req.path);
  await next();
});

import bcrypt from 'bcryptjs'
import type { MiddlewareHandler } from "hono";

type Variables = {
  admin_store_id: string;
  employee_id?: string;
  employee_store_id?: string;
};


const requireAdmin: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const auth = c.req.header("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  const payload = verifyAdminToken(token); // { store_id } or null
  if (!payload) return c.json({ ok: false, error: "Unauthorized" }, 401);

  c.set("admin_store_id", payload.store_id);
  await next();
};

function parseYMDToLocalStart(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isPastDeadline(weekStartYMD: string, now = new Date()) {
  const weekStart = parseYMDToLocalStart(weekStartYMD);
  const deadline = addDays(weekStart, -4); // 前週木曜 0:00
  return now.getTime() >= deadline.getTime();
}




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
    .select("employee_id, status, submitted_at, updated_at, created_at, comment")
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
      comment: s?.comment ?? null,
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
    .select("store_id, employee_id, employee_name, week_start, data, status, submitted_at, updated_at, created_at, comment")
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

app.get("/api/public/stores", async (c) => {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name")
    .order("id", { ascending: true });

  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true, stores: data ?? [] });
});


//店舗一覧API
app.get("/api/admin/stores", async (c) => {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name")
    .order("id", {ascending: true});
  
    if (error) return c.json({ ok: false, error: error.message }, 500);
    return c.json({ ok: true, stores: data ?? [] });
});


function hashEmployeePin(pin: string, salt: string) {
  return crypto
    .createHash("sha256")
    .update(pin + salt)
    .digest("hex");
}

app.post("/api/admin/employees", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ ok: false, error: "invalid json" }, 400);
  }

  const { employee_id, employee_name, pin } = body as {
    employee_id?: string;
    employee_name?: string;
    pin?: string;
  };

  if (!employee_id || !/^\d{8}$/.test(employee_id)) {
    return c.json({ ok: false, error: "employee_id must be 8 digits" }, 400);
  }
  if (!employee_name || employee_name.trim().length === 0) {
    return c.json({ ok: false, error: "employee_name required" }, 400);
  }
  if (!pin || !/^\d{4}$/.test(pin)) {
    return c.json({ ok: false, error: "pin must be 4 digits" }, 400);
  }

  const salt = process.env.EMPLOYEE_PIN_SALT;
  if (!salt) {
    return c.json({ ok: false, error: "EMPLOYEE_PIN_SALT missing" }, 500);
  }

  const pin_hash = hashEmployeePin(pin, salt);

  const { error } = await supabase
    .from("employees")
    .upsert(
      {
        store_id: storeId,
        employee_id,
        employee_name,
        pin_hash,
        is_active: true,
      },
      { onConflict: "employee_id" }
    );

  if (error) {
    return c.json({ ok: false, error: error.message }, 500);
  }

  return c.json({ ok: true });
});

//従業員ログイン
type EmployeePayload = {
  employee_id: string;
  store_id: string;
  iat: number;
};

app.post("/api/employee/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: "invalid json" }, 400);

  const { employee_id, pin } = body as { employee_id?: string; pin?: string };

  if (!employee_id || !/\d{8}$/.test(employee_id)) {
    return c.json({ ok: false, error: "employee_id must be 8 digits" }, 400);
  }
  if (!pin || !/^\d{4}$/.test(pin)) {
    return c.json({ ok: false, error: "pin must be 4 digits" }, 400);
  }
  
  const salt = process.env.EMPLOYEE_PIN_SALT;
  if (!salt) return c.json({ ok: false, error: "EMPLOYEE_PIN_SALT missing" }, 500);

  const secret = process.env.EMPLOYEE_TOKEN_SECRET;
  if (!secret) return c.json({ ok: false, error: "EMPLOYEE_TOKEN_SECRET missing" }, 500);

  const empRes = await supabase 
    .from("employees")
    .select("employee_id, employee_name, store_id, pin_hash, is_active")
    .eq("employee_id", employee_id)
    .maybeSingle();

  if (empRes.error) return c.json({ ok: false, error: empRes.error.message }, 500);
  if (!empRes.data) return c.json({ ok: false, error: "not found" }, 401);
  if (!empRes.data.is_active) return c.json({ ok: false, error: "inactive" }, 403);
  if (!empRes.data.pin_hash) return c.json({ ok: false, error: "pin not set" }, 403);

  const inputHash = hashEmployeePin(pin, salt);

  console.log("LOGIN DEBUG", {
    employee_id,
    inputHash: inputHash.slice(0, 8),
    dbHash: empRes.data.pin_hash.slice(0, 8),
    saltHead: salt.slice(0, 4),
  });

  if (inputHash !== empRes.data.pin_hash) {
    return c.json({ ok: false, error: "invalid credentials" }, 401);
  }

  const payload: EmployeePayload = {
    employee_id,
    store_id: empRes.data.store_id,
    iat: Date.now(),
  }

  const token = signToken(payload, secret);
  return c.json({ ok: true, token, employee_id, employee_name: empRes.data.employee_name, store_id: empRes.data.store_id });
});

const requireEmployee: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const auth = c.req.header("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  const secret = process.env.EMPLOYEE_TOKEN_SECRET;
  if (!secret) return c.json({ ok: false, error: "EMPLOYEE_TOKEN_SECRET missing" }, 500);

  const payload = verifyToken<EmployeePayload>(token, secret);
  if (!payload) return c.json({ ok: false, error: "Unauthorized" }, 401);

  c.set("employee_id", payload.employee_id);
  c.set("employee_store_id", payload.store_id);
  await next();
}

app.get("/api/shifts", requireEmployee, async (c) => {
  const employeeId = c.get("employee_id");
  const storeId = c.get("employee_store_id");

  const weekStart = c.req.query("week_start")?.trim();
  if (!weekStart) return c.json({ ok: false, error: "week_start required" }, 400);

  console.log("SHIFTS DEBUG", { employeeId, storeId, weekStart });


  const { data, error } = await supabase
    .from("shift_submissions")
    .select("employee_id, store_id, week_start, data, status, comment, submitted_at, updated_at")
    .eq("store_id", storeId)
    .eq("employee_id", employeeId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true, submission: data ?? null });
})

app.post("/api/shifts", requireEmployee, async (c) => {
  const employeeId = c.get("employee_id");
  const storeId = c.get("employee_store_id");
  const json = await c.req.json().catch(() => null);
  const parsed = shiftSchema.safeParse(json);

  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.flatten() }, 400);
  }

  const body = parsed.data;

  if (isPastDeadline(body.week_start)) {
    return c.text("締め切りを過ぎています（木曜0:00以降は提出不可）", 403);
  }

  // 同週・同人・同店舗を確認
  const { data: existing, error: selErr } = await supabase
    .from("shift_submissions")
    .select("id, status")
    .eq("store_id", storeId)
    .eq("employee_id", employeeId)
    .eq("week_start", body.week_start)
    .maybeSingle();

  if (selErr) {
    return c.json({ ok: false, error: selErr.message }, 500);
  }

  // あれば更新、なければ新規
  if (existing?.id) {
    if (existing.status === "updated"){
      return c.json({ ok: false, error: "更新は一回までです。修正が必要なら店長に連絡してください "}, 409);
    }

    const { error: updErr } = await supabase
      .from("shift_submissions")
      .update({
        employee_name: body.employee_name,
        data: body.data,
        comment: (body.comment ?? "").trim() || null,
        status: "updated",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updErr) return c.json({ ok: false, error: updErr.message }, 500);
    return c.json({ ok: true, mode: "updated" });
  } else {
    const { error: insErr } = await supabase.from("shift_submissions").insert({
      store_id: storeId,
      employee_id: employeeId,
      employee_name: body.employee_name,
      week_start: body.week_start,
      data: body.data,
      comment: (body.comment ?? "").trim() || null,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    if (insErr) return c.json({ ok: false, error: insErr.message }, 500);
    return c.json({ ok: true, mode: 'submitted' } as const);
  }

});

//ログイン管理者
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

//serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) });
//console.log("ShiftFlow API running on http://localhost:8787");

if (process.env.NODE_ENV !== "production") {
  const { serve } = await import("@hono/node-server");
  serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) });
  console.log("ShiftFlow API running on http://localhost:8787");
}