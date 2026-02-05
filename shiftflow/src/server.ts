// frontend/shiftflow/src/server.ts

import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { email, z } from "zod";
is_holiday: z.boolean().optional();
import "dotenv/config";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const leaveSupabase = createClient(
  process.env.LEAVE_SUPABASE_URL!,
  process.env.LEAVE_SUPABASE_SERVICE_ROLE_KEY!,
);

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PUBLIC_DEMO?: string;
  ADMIN_STORE_ID: string;
  WORKTIME_ADMIN_STORE_ID: string;
  ADMIN_PASSWORD: string;
  ADMIN_TOKEN_SECRET: string;
  WORKTIME_ADMIN_PASSWORD: string;
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
    .select("employee_id, employee_name, store_id, pin_hash, is_active, monthly_target_minutes")
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
  return c.json({ ok: true, 
    token, 
    employee_id, 
    employee_name: empRes.data.employee_name, 
    store_id: empRes.data.store_id,
    monthly_target_minutes: empRes.data.monthly_target_minutes ?? null 
  });

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

//worktime用　API
app.get("/api/worktime", requireEmployee, async (c) => {
  const employee_id = c.get("employee_id") as string;
  const store_id = c.get("employee_store_id") as string;

  const week_start = c.req.query("week_start") || "";
  if (!week_start) {
    return c.json({ ok: false, error: "week_start is required" }, 400);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return c.json({ ok: false, error: "week_start must be YYYY-MM-DD" }, 400);
  }

  const { data, error } = await supabase
    .from("worktime_submissions")
    .select("week_start, data, status, total_minutes, updated_at")
    .eq("store_id", store_id)
    .eq("employee_id", employee_id)
    .eq("week_start", week_start)
    .maybeSingle();

  if (error) {
    return c.json( { ok: false, error: "not found" }, 404);
  }

  if (!data) {
    //未提出
    return c.json({ error: "not found" }, 404);
  }

  return c.json({
    week_start: data.week_start,
    data: data.data,
    status: data.status,
    total_minutes: data.total_minutes,
    updated_at: data.updated_at,
  })

})

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function sanitizeMinutesData(input: any): Record<DayKey, number> {
  const out = {} as Record<DAY_KEYS, number>;

  for (const k of DAY_KEYS) {
    const v = input?.[k];
    const n = typeof v === "number" ? v : Number(v ?? 0);

    if (!Number.isFinite(n) || n < 0 || n > 24 * 60) {
      //一日あたり　0〜1440　分の範囲に限定
      throw new Error(`Invalid minutes for ${k}`);
    }
    out[k] = Math.floor(n);
  }
  return out;
}

function calcTotalMinutes(data: Record<DayKey, number>): number {
  return DAY_KEYS.reduce(( sum, k) => sum + (data[k] ?? 0), 0);
}

app.post("/api/worktime", requireEmployee, async (c) => {
  const employee_id = c.get("employee_id") as string;
  const store_id = c.get("employee_store_id") as string;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: "Invalid JSON" }, 400);

  const week_start = String(body.week_start ?? "");
  if (!week_start) {
    return c.json({ ok: false, error: "week_start is required" }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return c.json ( { ok: false, error: "week_start must be YYYY-MM-DD" }, 400);
  }

  let data: Record<DayKey, number>;
  try {
    data = sanitizeMinutesData(body.data);
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 400);
  }

  const total_minutes = calcTotalMinutes(data)

  //既存確認
  const { data: existing, error: selErr } = await supabase
    .from("worktime_submissions")
    .select("status")
    .eq("store_id", store_id)
    .eq("employee_id", employee_id)
    .eq("week_start", week_start)
    .maybeSingle();

  if (selErr) {
    return c.json({ ok: false, error: selErr.message }, 500);
  }

  if (!existing) {
    // 新規insert
    const { data: inserted, error: insErr } = await supabase
      .from("worktime_submissions")
      .insert({
        store_id,
        employee_id,
        week_start,
        data,
        total_minutes,
        status: "submitted",
      })
      .select("week_start, status, total_minutes, updated_at")
      .single();

    if (insErr) {
      return c.json({ ok: false, error: insErr.message }, 500);
    }
    
    return c.json({ ok: true, ...inserted });
  }

  //既存あり：更新一回制限
  if (existing.status === "updated") {
    return c.json( {ok: false, error: "Already updated once (locked)" }, 409)
  }

  //submitted → updated に更新
  const { data: updated, error: updErr } = await supabase
    .from("worktime_submissions")
    .update({
      data,
      total_minutes,
      status: "updated",
    })
    .eq("store_id", store_id)
    .eq("employee_id", employee_id)
    .eq("week_start", week_start)
    .select("week_start, status, total_minutes, updated_at")
    .single();
  
    if (updErr) {
      return c.json({ ok: false, error: updErr.message }, 500);
    }

    return c.json({ ok: true, ...updated });
})

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

// ===== worktime admin dashboard =====
app.get("/api/worktime/admin/dashboard", requireAdmin, async (c) => {
  const week_start = c.req.query("week_start") || "";
  if (!week_start) return c.json({ error: "week_start is required" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return c.json({ error: "week_start must be YYYY-MM-DD" }, 400);
  }

  //employee(管理対象の全員)　
  //worktimeは社員のみ適応。店舗で絞らない。　≠store_id　=is_staff
  const empRes = await supabase
    .from("employees")
    .select("employee_id, employee_name, is_active, worktime_group, store_id")
    .eq("is_active", true)
    .eq("is_staff", true)
    .order("employee_id");

  if (empRes.error) {
    return c.json({ error: `employees fetch failed: ${empRes.error.message}`}, 500);
  }
  
  const employees = (empRes.data ?? []).map((e) => ({
    employee_id: String(e.employee_id),
    name: String(e.employee_name ?? ""),
    is_active: Boolean(e.is_active),
  }));

  const nameById = new Map(employees.map((e) => [String(e.employee_id), String(e.name ?? "")]));

  //submissions (その週の提出分をまとめて取得)
  const subRes = await supabase
    .from("worktime_submissions")
    .select("employee_id, status, total_minutes, created_at, updated_at")
    .eq("week_start", week_start);

  if (subRes.error) {
    return c.json({ error: `worktime_submissions fetch failed: ${subRes.error.message}`}, 500);
  }

  /*const submissions = (subRes.data ?? []).map((s) => ({
    employee_id: String(s.employee_id),
    status: (s.status === "updated" ? "updated" : "submitted") as "submitted" | "updated",
    total_minutes: Number(s.total_minutes ?? 0),
    submitted_at: String(s.created_at ?? s.updated_at ?? ""),
    updated_at: String(s.updated_at ?? "")
  }));*/

  const submissions = (subRes.data ?? []).map((s) => {
    const employee_id = String(s.employee_id);
      return {
        employee_id,
        name: nameById.get(employee_id) ?? "",
        status: (s.status === "updated" ? "updated" : "submitted") as "submitted" | "updated",
        total_minutes: Number(s.total_minutes ?? 0),
        created_at: s.created_at,
        updated_at: s.updated_at,
      }
  })

  //summary (未提出・提出・更新)
  const subMap = new Map(submissions.map((s) => [s.employee_id, s]));
  const total = employees.length;

  let missing = 0;
  let submitted = 0;
  let updated = 0;

  for (const e of employees) {
    const s = subMap.get(e.employee_id);
    if (!s) missing++;
    else if (s.status === "updated") updated++;
    else submitted++;
  }

  //console.log("[dbg] employees:", employees.length);
  //console.log("[dbg] subs:", subRes.data?.length ?? 0);
  //console.log("[dbg] firstSub:", subRes.data?.[0]);
  console.log("[dbg] nameById keys sample:", [...nameById.keys()].slice(0, 3));
  console.log("[dbg] joined name:", String(subRes.data?.[0]?.employee_id), nameById.get(String(subRes.data?.[0]?.employee_id)));


  return c.json({
    week_start,
    summary: { total, missing, submitted, updated},
    employees,
    submissions,
  });

});


/*app.post("/api/worktime/admin/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const password = String(body?.password ?? "");

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
  const store_id = process.env.WORKTIME_ADMIN_STORE_ID ?? process.env.ADMIN_STORE_ID ?? "";

  if (!ADMIN_PASSWORD) {
    return c.json({ ok: false, error: "ADMIN_PASSWORD is not configured" }, 500);
  }
  if (!store_id) {
    return c.json({ ok: false, error: "WORKTIME_ADMIN_STORE_ID is not configured" }, 500);
  }

  if (password !== ADMIN_PASSWORD) {
    return c.json({ ok: false, error: "Invalid password" }, 401);
  }

  const token = issueAdminToken({ store_id }); 
  return c.json({ ok: true, token });
});*/

app.post("/api/worktime/admin/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const password = String(body?.password ?? "");

  const ADMIN_PASSWORD = c.env.ADMIN_PASSWORD ?? "";
  const store_id =
    c.env.WORKTIME_ADMIN_STORE_ID ??
    c.env.ADMIN_STORE_ID ??
    "";

  if (!ADMIN_PASSWORD) {
    return c.json({ ok: false, error: "ADMIN_PASSWORD is not configured" }, 500);
  }
  if (!store_id) {
    return c.json({ ok: false, error: "WORKTIME_ADMIN_STORE_ID is not configured" }, 500);
  }

  if (password !== ADMIN_PASSWORD) {
    return c.json({ ok: false, error: "Invalid password" }, 401);
  }

  const token = issueAdminToken({ store_id });
  return c.json({ ok: true, token });
});



app.get("/api/worktime/admin/monthly", requireAdmin, async (c) => {
  const store_id = c.get("admin_store_id") as string;

  const month = String(c.req.query("month") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ ok: false, error: "month must be YYYY-MM" }, 400);
  }

  // 月初・月末
  const monthStart = new Date(`${month}-01T00:00:00`);
  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

  const ymd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // 対象月に食い込む週を拾うため、月初の前6日〜月末まで
  const rangeStart = new Date(monthStart);
  rangeStart.setDate(rangeStart.getDate() - 6);

  const rangeStartYmd = ymd(rangeStart);
  const rangeEndYmd = ymd(nextMonthStart);

  // ★ その月の日数
  const daysInMonth = Math.round(
    (nextMonthStart.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  // ★ worktime_targets から A/B の target を引く
  const tRess =  await supabase
    .from("worktime_targets")
    .select("group_code, target_minutes")
    .eq("kind", "days")
    .eq("days_in_month", daysInMonth);
  
  if (tRess.error) {
    return c.json({ ok: false, error: tRess.error.message }, 500)
  };

  const targetByGroup = new Map<string, number>();
  for (const r of tRess.data ?? []) {
    targetByGroup.set(String(r.group_code), Number(r.target_minutes ?? 0) || 0);
  }

  // 社員一覧（is_staff / active）+ ★グループ列
  const empRes = await supabase
    .from("employees")
    .select("employee_id, employee_name, is_active, worktime_group") // ←列名合わせて
    .eq("is_staff", true)
    .eq("is_active", true);

  if (empRes.error) return c.json({ ok: false, error: empRes.error.message }, 500);

  const employees = (empRes.data ?? []).map((e: any) => {
    const group = String(e.worktime_group ?? ""); // ←列名合わせて
    const target = targetByGroup.get(group) ?? 0;
    return {
      employee_id: String(e.employee_id),
      name: String(e.employee_name ?? ""),
      group,
      target_minutes: target,
    };
  });

  // submissions（期間）
  const subRes = await supabase
    .from("worktime_submissions")
    .select("employee_id, week_start, data")
    .eq("store_id", store_id)
    .gte("week_start", rangeStartYmd)
    .lt("week_start", rangeEndYmd);

  if (subRes.error) return c.json({ ok: false, error: subRes.error.message }, 500);

  const keyOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

  // 集計箱
  const totalMap = new Map<string, { total_minutes: number; weeks: Set<string> }>();
  for (const e of employees) totalMap.set(e.employee_id, { total_minutes: 0, weeks: new Set() });

  for (const s of subRes.data ?? []) {
    const employee_id = String((s as any).employee_id);
    const box = totalMap.get(employee_id);
    if (!box) continue;

    const ws = String((s as any).week_start);
    const data = ((s as any).data ?? {}) as Record<string, number>;
    const weekStartDate = new Date(`${ws}T00:00:00`);

    let touched = false;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate);
      d.setDate(d.getDate() + i);
      if (d < monthStart || d >= nextMonthStart) continue;

      const k = keyOrder[i];
      const v = Number(data[k] ?? 0) || 0;
      if (v > 0) touched = true;
      box.total_minutes += v;
    }
    if (touched) box.weeks.add(ws);
  }

  const rows = employees
    .map((e) => {
      const box = totalMap.get(e.employee_id)!;
      return {
        employee_id: e.employee_id,
        name: e.name,
        total_minutes: box.total_minutes,
        submitted_weeks: box.weeks.size,
        target_minutes: e.target_minutes,
      };
    })
    .sort((a, b) => b.total_minutes - a.total_minutes);

  return c.json({ month, rows });
});

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function getMondayJST(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const day = jst.getUTCDate();
  const diffToMon = (day + 6) % 7;
  jst.setUTCDate(jst.getUTCDate() - diffToMon);

  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

app.get("/api/worktime/admin/unsubmitted", requireAdmin, async (c) => {
  const store_id = c.get("admin_store_id") as string;

  const qs = String(c.req.query("week_start") ?? "")?.trim();
  const week_start = qs ? ymdSchema.parse(qs) : getMondayJST();

  const { data: employees, error: empErr } = await supabase
    .from("employees")
    .select("employee_id, employee_name, email, is_active, email")
    .eq("store_id", store_id)
    .eq("is_active", true);

  if (empErr) return c.json({ ok: false, error: empErr.message }, 500);
  if (!employees) return c.json({ ok: true, week_start, rows: [], count: 0 });

  const { data: subs, error: subErr } = await supabase
    .from("worktime_submissions")
    .select("employee_id")
    .eq("store_id", store_id)
    .eq("week_start", week_start);

  if (subErr) return c.json({ ok: false, error: subErr.message }, 500);

  const submittedSet = new Set((subs ?? []).map((r) => r.employee_id));

  const rows = employees
    .filter((e) => !submittedSet.has(e.employee_id))
    .map((e) => ({
      employee_id: e.employee_id,
      name: e.employee_name,
      email: e.email ?? null,
    }));

  return c.json({
    ok: true,
    week_start,
    count: rows.length,
    rows,
  })
})

//worktime メール催促
/*async function sendResendEmail(params: { to: string; subject: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey) throw new Error("RESEND_API_KEY is missing");
  if (!from) throw new Error("MAIL_FROM is missing");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend failed: ${res.status} ${body}`);
  }
}*/

async function sendResendEmail(params: {
  to: string;          // 受け皿（ownerEmail）
  bcc?: string[];      // 未提出者たち
  subject: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey) throw new Error("RESEND_API_KEY is missing");
  if (!from) throw new Error("MAIL_FROM is missing");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.to,
      bcc: params.bcc,
      subject: params.subject,
      text: params.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend failed: ${res.status} ${body}`);
  }
}


app.post("/api/worktime/admin/remind", requireAdmin, async (c) => {
  const store_id = c.get("admin_store_id") as string | undefined;
  void store_id;

  const body = await c.req.json().catch(() => ({}));
  const week_start = String(body?.week_start ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return c.json({ ok: false, error: "week_start must be YYYY-MM-DD" }, 400);
  }

  // 社員（管理対象）
  const empRes = await supabase
    .from("employees")
    .select("employee_id, employee_name, email, is_active")
    .eq("is_staff", true)
    .eq("is_active", true)
    .order("employee_id");

  if (empRes.error) {
    return c.json({ ok: false, error: empRes.error.message }, 500);
  }

  const employees = (empRes.data ?? []).map((e: any) => ({
    employee_id: String(e.employee_id),
    name: String(e.employee_name ?? ""),
    email: String(e.email ?? "").trim(),
  }));

  //その週の提出一覧
  const subRes = await supabase
    .from("worktime_submissions")
    .select("employee_id")
    .eq("week_start", week_start);

  if (subRes.error) {
    return c.json({ ok: false, error: subRes.error.message }, 500);
  }

  const submittedIds = new Set((subRes.data ?? []).map((s: any) => String(s.employee_id)));

  // 未提出者
  const missing = employees.filter((e) => !submittedIds.has(e.employee_id));
  const missing_total = missing.length;

  // email ありだけ送る
  const bcc = missing
    .map((e) => e.email)
    .filter((v) => v.length > 0);

  const skipped_no_email = missing_total - bcc.length;

  // 未提出０ or 送信先０の時は送らない
  if (missing_total === 0 || bcc.length === 0) {
    return c.json({
      ok: true,
      week_start,
      missing_total,
      sent: 0,
      skipped_no_email,
      note: missing_total === 0 ? "no missing employees" : "no email to send",
    });
  }

  // 件名・本文 (2/4 URL未確定)
  const subject = `【勤務時間入力】未提出リマインド（週開始 ${week_start}）`;

  const lines: String[] = [];
  lines.push("勤務時間入力が未提出です。");
  lines.push("");
  lines.push(`対象週（週開始） :${week_start}`);
  lines.push("");
  lines.push("勤務時間入力フォームから入力を行ってください。ここにURLが来る予定");
  lines.push("※このメールは未提出の方へ自動送信されています。");
  lines.push("");
  lines.push("(未提出者一覧)")
  for(const e of missing) {
    const emailPart = e.email ? ` <${e.email}>` : " <email未登録>";
    lines.push(`- ${e.employee_id} ${e.name}${emailPart}`);
  }

  // To は受け皿（OWNER_EMAIL）にして、BCC に未提出者を入れる
  // ※ Resend は To なしが制限されるケースがあるので To は必須にしておくのが安全
  const ownerEmail = String(process.env.OWNER_EMAIL ?? "").trim();
  if (!ownerEmail) {
    return c.json({ ok: false, error: "OWNER_EMAIL is not set" }, 500);
  }

  try {
    await sendResendEmail({
      to: ownerEmail,
      bcc,
      subject,
      text: lines.join("\n")
    });

    return c.json({
      ok: true,
      week_start,
      missing_total,
      sent: bcc.length,
      skipped_no_email,
    });
  } catch (e: any) {
    return c.json({ ok: false, error: "Resend failed", detail: String(e?.message ?? e),}, 500)
  };

});

// 有給サマリを表示　worktime admin
app.get("/api/leave/admin/summary", requireAdmin, async (c) => {
  const { data, error } = await leaveSupabase
    .from("leave_admin_summary_v1")
    .select("*")
    .order("employee_id");

  if (error) {
    return c.json({ ok: false, error: "leave summary unavailable", detail: error.message, code: error.code }, 500);
  }

  const rows = (data ?? []).map((r: any) => ({
    employee_id: r.employee_id,
    name: r.name,
    remaining_days: Number(r.remaining_days ?? 0),
    base_grant_date: r.base_grant_date ?? null,
    last_updated_at: r.last_updated_at ?? null,
    last_request: r.last_date
      ? {
          date: r.last_date,
          days: Number(r.last_days ?? 1),
          status: r.last_status ?? "",
          submitted_at: r.last_submitted_at ?? null,
        }
      : null,
  }));

  return c.json({ ok: true, rows, as_of: new Date().toISOString() });
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