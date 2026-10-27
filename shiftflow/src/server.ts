// frontend/shiftflow/src/server.ts

import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { z } from "zod";
import {
  BUSINESS_HOURS,
  timeToMinutes,
  validateShiftDataForStore,
  type BusinessHoursDefinition,
  type ShiftDayKey,
  type StoreId,
} from "./shift-time";
import { holidaysForWeek, japaneseHolidays } from "./japanese-holidays";
import { mascotLevelForXp } from "./mascot-levels";
import { MASCOT_ITEMS, mascotUnlockAvailable, type MascotStatKey } from "./mascot-unlocks";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
  DEMO_WORKTIME_ADMIN_PASSWORD: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_CHANNEL_SECRET?: string;
};

const app = new Hono<{ Bindings: Env }>();
const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const EMPLOYEE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function loginRateLimit(maxAttempts: number): MiddlewareHandler {
  return async (c, next) => {
    const now = Date.now();
    const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown";
    const key = `${c.req.path}:${ip}`;
    const previous = loginAttempts.get(key);
    const entry = !previous || previous.resetAt <= now
      ? { count: 0, resetAt: now + LOGIN_WINDOW_MS }
      : previous;
    if (entry.count >= maxAttempts) {
      c.header("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return c.json({ ok: false, error: "試行回数が多すぎます。しばらく待ってからお試しください" }, 429);
    }
    entry.count += 1;
    loginAttempts.set(key, entry);
    await next();
    if (c.res.status < 400) loginAttempts.delete(key);
    if (loginAttempts.size > 10_000) {
      for (const [candidate, value] of loginAttempts) if (value.resetAt <= now) loginAttempts.delete(candidate);
    }
  };
}

app.use("/api/admin/login", loginRateLimit(10));
app.use("/api/employee/login", loginRateLimit(20));

app.get("/", (c) => c.text("shiftflow-api ok"));
app.get("/api/health", (c) => c.json({ ok: true, service: "shiftflow-api" }));
const retiredFeature = (c: any) => c.json({ ok: false, error: "This feature has ended" }, 410);
app.all("/api/worktime", retiredFeature);
app.all("/api/worktime/*", retiredFeature);
// 勤務表の保存・公開は終了。希望人数の分析用GETだけは継続する。
app.put("/api/admin/planner", retiredFeature);
app.post("/api/admin/planner/*", retiredFeature);
app.all("/api/admin/line/*", retiredFeature);
app.all("/api/line/*", retiredFeature);
app.all("/api/login", retiredFeature);
app.all("/api/leave/*", retiredFeature);
app.all("/api/public/employees", retiredFeature);
app.all("/api/admin/stores", retiredFeature);


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
  const body = base64url(JSON.stringify({ ...payload, exp: Date.now() + ADMIN_TOKEN_TTL_MS }));
  const sig = sign(body);
  return `${body}.${sig}`;
}

function verifyAdminToken(token: string): { store_id: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  try {
    const json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!json.store_id || !Number.isFinite(json.exp) || json.exp <= Date.now()) return null;
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
  is_holiday: z.boolean().optional(),
  comment: z.string().max(300).optional().nullable(),
});




//＝＝＝＝＝＝＝＝＝　管理者 (admin) ＝＝＝＝＝＝＝＝＝
app.use("/api/*", async (c, next) => {
  console.log("[API HIT]", c.req.method, c.req.path);
  await next();
});

import bcrypt from 'bcryptjs'
import type { MiddlewareHandler } from "hono";
import { isEmployeeIdFormat, isEmployeeIdValidForExistingStore, isEmployeeIdValidForNewRegistration } from "./employee-id";

type Variables = {
  admin_store_id: string;
  employee_id?: string;
  employee_store_id?: string;
  employee_name?: string;
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
  // Cloudflare WorkersはUTCで動くため、提出期限は明示的に日本時間として扱う。
  return new Date(`${ymd}T00:00:00+09:00`);
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

const plannerAssignmentSchema = z.object({
  start: z.string(),
  end: z.string(),
});
const plannerSchema = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staffing_requirements: z.object({
    weekday: z.number().int().min(1).max(20),
    weekendHoliday: z.number().int().min(1).max(20),
  }),
  assignments: z.record(z.string(), z.record(z.string(), plannerAssignmentSchema)),
});

app.get("/api/admin/planner", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");
  const weekStart = c.req.query("week_start")?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return c.json({ ok: false, error: "week_start required" }, 400);
  }
  const [employeeResult, submissionResult] = await Promise.all([
    supabase.from("employees").select("employee_id, employee_name").eq("store_id", storeId).eq("is_active", true).order("employee_id"),
    supabase.from("shift_submissions").select("employee_id, employee_name, data").eq("store_id", storeId).eq("week_start", weekStart),
  ]);
  const error = employeeResult.error || submissionResult.error;
  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({
    ok: true,
    employees: employeeResult.data ?? [],
    submissions: submissionResult.data ?? [],
    schedule: null,
    holidays: [...holidaysForWeek(weekStart)].map(([date, name]) => ({ date, name })),
  });
});

app.put("/api/admin/planner", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");
  const parsed = plannerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, error: "勤務表の形式が正しくありません" }, 400);
  const { week_start, staffing_requirements, assignments } = parsed.data;
  const hours = await loadBusinessHours(storeId);
  const holidays = holidaysForWeek(week_start);
  const dayKeys: ShiftDayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const [year, month, day] = week_start.split("-").map(Number);
  const monday = new Date(year, month - 1, day);
  const holidayDays = new Set<ShiftDayKey>();
  dayKeys.forEach((dayKey, index) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + index);
    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    if (holidays.has(ymd)) holidayDays.add(dayKey);
  });
  const employeeIds = new Set<string>();
  for (const [dayKey, employees] of Object.entries(assignments)) {
    if (!dayKeys.includes(dayKey as ShiftDayKey)) return c.json({ ok: false, error: "曜日が正しくありません" }, 400);
    for (const [employeeId, assignment] of Object.entries(employees)) {
      employeeIds.add(employeeId);
      const error = validateShiftDataForStore(
        storeId,
        { [dayKey]: `${assignment.start}-${assignment.end}` },
        holidayDays,
        hours ?? undefined,
      );
      if (error) return c.json({ ok: false, error }, 400);
    }
  }
  if (employeeIds.size) {
    const employees = await supabase.from("employees").select("employee_id").eq("store_id", storeId).eq("is_active", true).in("employee_id", [...employeeIds]);
    if (employees.error) return c.json({ ok: false, error: employees.error.message }, 500);
    if ((employees.data ?? []).length !== employeeIds.size) return c.json({ ok: false, error: "無効な従業員が含まれています" }, 400);
  }
  const result = await supabase.from("shift_schedules").upsert({
    store_id: storeId,
    week_start,
    assignments,
    required_staff: staffing_requirements.weekday,
    required_staff_weekday: staffing_requirements.weekday,
    required_staff_weekend_holiday: staffing_requirements.weekendHoliday,
    updated_at: new Date().toISOString(),
    published_at: null,
  }, { onConflict: "store_id,week_start" }).select("updated_at").single();
  if (result.error) return c.json({ ok: false, error: result.error.message }, 500);
  return c.json({ ok: true, updated_at: result.data.updated_at });
});

app.post("/api/admin/planner/publish", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");
  const body = await c.req.json().catch(() => null) as { week_start?: string } | null;
  const weekStart = body?.week_start?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return c.json({ ok: false, error: "week_start required" }, 400);
  const publishedAt = new Date().toISOString();
  const result = await supabase.from("shift_schedules")
    .update({ published_at: publishedAt })
    .eq("store_id", storeId)
    .eq("week_start", weekStart)
    .select("week_start")
    .maybeSingle();
  if (result.error) return c.json({ ok: false, error: result.error.message }, 500);
  if (!result.data) return c.json({ ok: false, error: "先に勤務表を保存してください" }, 404);
  return c.json({ ok: true, published_at: publishedAt });
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

const businessHoursSchema = z.object({
  weekday: z.object({ open: z.string(), close: z.string() }),
  weekendHoliday: z.object({ open: z.string(), close: z.string() }),
});

function validBusinessHours(value: unknown): value is BusinessHoursDefinition {
  const parsed = businessHoursSchema.safeParse(value);
  if (!parsed.success) return false;
  return [parsed.data.weekday, parsed.data.weekendHoliday].every((period) => {
    const open = timeToMinutes(period.open);
    const close = timeToMinutes(period.close);
    return open !== null && close !== null && open % 15 === 0 && close % 15 === 0 && open < close && close <= 24 * 60;
  });
}

async function loadBusinessHours(storeId: string): Promise<BusinessHoursDefinition | null> {
  const fallback = BUSINESS_HOURS[storeId as StoreId] ?? null;
  const result = await supabase.from("stores").select("business_hours").eq("id", storeId).maybeSingle();
  if (result.error || !validBusinessHours(result.data?.business_hours)) return fallback;
  return result.data.business_hours;
}

app.get("/api/business-hours", async (c) => {
  const storeId = c.req.query("store_id")?.trim() ?? "";
  const weekStart = c.req.query("week_start")?.trim() ?? "";
  if (!storeId || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return c.json({ ok: false, error: "store_id and week_start required" }, 400);
  }
  const hours = await loadBusinessHours(storeId);
  if (!hours) return c.json({ ok: false, error: "営業時間設定が見つかりません" }, 404);
  const holidays = [...holidaysForWeek(weekStart)].map(([date, name]) => ({ date, name }));
  return c.json({ ok: true, hours, holidays });
});

app.get("/api/admin/business-hours", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");
  const hours = await loadBusinessHours(storeId);
  if (!hours) return c.json({ ok: false, error: "営業時間設定が見つかりません" }, 404);
  return c.json({ ok: true, store_id: storeId, hours });
});

app.get("/api/admin/announcement", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");
  const { data, error } = await supabase.from("store_announcements").select("message,is_active,updated_at").eq("store_id", storeId).maybeSingle();
  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true, announcement: data ?? { message: "", is_active: false, updated_at: null } });
});

app.put("/api/admin/announcement", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");
  const body = await c.req.json().catch(() => null) as { message?: string; is_active?: boolean } | null;
  const message = String(body?.message ?? "").trim();
  const isActive = body?.is_active === true;
  if (message.length > 300) return c.json({ ok: false, error: "お知らせは300文字以内です" }, 400);
  if (isActive && !message) return c.json({ ok: false, error: "公開するメッセージを入力してください" }, 400);
  const { error } = await supabase.from("store_announcements").upsert({ store_id: storeId, message, is_active: isActive, updated_at: new Date().toISOString() }, { onConflict: "store_id" });
  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true, announcement: { message, is_active: isActive } });
});

function lineConfig(c: any) {
  return {
    token: String(c.env?.LINE_CHANNEL_ACCESS_TOKEN ?? process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "").trim(),
    secret: String(c.env?.LINE_CHANNEL_SECRET ?? process.env.LINE_CHANNEL_SECRET ?? "").trim(),
  };
}

function lineCodeHash(code: string) {
  return crypto.createHash("sha256").update(`shiftflow-line:${code}`).digest("hex");
}

async function lineRequest(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.line.me${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String((data as any)?.message ?? `LINE API ${response.status}`));
  return data as any;
}

function jstDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function ymdUtc(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function nextMondayYmd(date = new Date()) {
  const { year, month, day } = jstDateParts(date);
  const current = new Date(Date.UTC(year, month - 1, day));
  const daysUntilMonday = ((8 - current.getUTCDay()) % 7) || 7;
  current.setUTCDate(current.getUTCDate() + daysUntilMonday);
  return ymdUtc(current);
}

function formatLineWeek(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const md = (date: Date) => `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  return `${md(start)}（月）〜${md(end)}（日）`;
}

async function sendWednesdayUnsubmittedNotifications(env: Env, now = new Date(), onlyStoreId = "", force = false) {
  const token = String(env.LINE_CHANNEL_ACCESS_TOKEN ?? "").trim();
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is missing");
  const weekStart = nextMondayYmd(now);
  const { data: channels, error: channelError } = await supabase.from("line_notification_channels")
    .select("store_id,target_id,notify_unsubmitted,last_unsubmitted_week_start")
    .eq("notify_unsubmitted", true);
  if (channelError) throw channelError;

  for (const channel of channels ?? []) {
    if (onlyStoreId && channel.store_id !== onlyStoreId) continue;
    if (!force && channel.last_unsubmitted_week_start === weekStart) continue;
    const [employeeResult, submissionResult] = await Promise.all([
      supabase.from("employees").select("employee_id,employee_name").eq("store_id", channel.store_id).eq("is_active", true).order("employee_id"),
      supabase.from("shift_submissions").select("employee_id").eq("store_id", channel.store_id).eq("week_start", weekStart),
    ]);
    const queryError = employeeResult.error || submissionResult.error;
    if (queryError) {
      console.error("[LINE scheduled] query failed", { storeId: channel.store_id, error: queryError.message });
      continue;
    }
    const submittedIds = new Set((submissionResult.data ?? []).map((row) => String(row.employee_id)));
    const names = (employeeResult.data ?? [])
      .filter((employee) => !submittedIds.has(String(employee.employee_id)))
      .map((employee) => String(employee.employee_name).trim())
      .filter(Boolean);
    const nameLines = names.length ? names.map((name) => `・${name}`).join("\n") : "全員提出済みです 🎉";
    const text = [
      "📣 シフト提出状況のお知らせ",
      `対象期間：${formatLineWeek(weekStart)}`,
      "",
      names.length ? `未提出：${names.length}名` : "未提出：0名",
      nameLines,
      "",
      names.length ? "本日23:59までに提出をお願いします。希望勤務がない場合も0時間で提出できます。" : "ご協力ありがとうございます！",
      "",
      "シフト提出はこちら",
      "https://shiftflow-e14.pages.dev/",
    ].join("\n");
    try {
      await lineRequest(token, "/v2/bot/message/push", {
        method: "POST",
        body: JSON.stringify({ to: channel.target_id, messages: [{ type: "text", text }] }),
      });
      await supabase.from("line_notification_channels").update({
        last_unsubmitted_week_start: weekStart,
        last_sent_at: new Date().toISOString(),
        last_result: "success",
        updated_at: new Date().toISOString(),
      }).eq("store_id", channel.store_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "LINE送信に失敗しました";
      console.error("[LINE scheduled] push failed", { storeId: channel.store_id, error: message });
      await supabase.from("line_notification_channels").update({
        last_sent_at: new Date().toISOString(),
        last_result: message,
        updated_at: new Date().toISOString(),
      }).eq("store_id", channel.store_id);
    }
  }
}

app.post("/api/admin/line/unsubmitted-test", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");
  try {
    await sendWednesdayUnsubmittedNotifications(c.env, new Date(), storeId, true);
    return c.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LINE送信に失敗しました";
    return c.json({ ok: false, error: message }, 502);
  }
});

app.get("/api/admin/line/status", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");
  const { token, secret } = lineConfig(c);
  const { data, error } = await supabase.from("line_notification_channels")
    .select("target_type,display_name,linked_at,last_sent_at,last_result,notify_submission_reminder,notify_unsubmitted,notify_schedule_published")
    .eq("store_id", storeId).maybeSingle();
  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true, configured: Boolean(token && secret), channel: data ?? null });
});

app.post("/api/admin/line/link-code", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");
  const { token, secret } = lineConfig(c);
  if (!token || !secret) return c.json({ ok: false, error: "LINEのChannel access tokenまたはChannel secretが未設定です" }, 503);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await supabase.from("line_link_codes").delete().eq("store_id", storeId).is("used_at", null);
  const { error } = await supabase.from("line_link_codes").insert({ store_id: storeId, code_hash: lineCodeHash(code), expires_at: expiresAt });
  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true, code, expires_at: expiresAt });
});

app.post("/api/admin/line/test", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");
  const { token } = lineConfig(c);
  if (!token) return c.json({ ok: false, error: "LINEのChannel access tokenが未設定です" }, 503);
  const { data, error } = await supabase.from("line_notification_channels").select("target_id").eq("store_id", storeId).maybeSingle();
  if (error) return c.json({ ok: false, error: error.message }, 500);
  if (!data?.target_id) return c.json({ ok: false, error: "LINE通知先が未連携です" }, 400);
  try {
    await lineRequest(token, "/v2/bot/message/push", { method: "POST", body: JSON.stringify({ to: data.target_id, messages: [{ type: "text", text: "ShiftFlowのLINE通知テストです。連携は正常です！" }] }) });
    await supabase.from("line_notification_channels").update({ last_sent_at: new Date().toISOString(), last_result: "success", updated_at: new Date().toISOString() }).eq("store_id", storeId);
    return c.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LINE送信に失敗しました";
    await supabase.from("line_notification_channels").update({ last_sent_at: new Date().toISOString(), last_result: message, updated_at: new Date().toISOString() }).eq("store_id", storeId);
    return c.json({ ok: false, error: message }, 502);
  }
});

app.delete("/api/admin/line/link", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");
  const { error } = await supabase.from("line_notification_channels").delete().eq("store_id", storeId);
  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true });
});

app.post("/api/line/webhook", async (c) => {
  const { token, secret } = lineConfig(c);
  if (!token || !secret) return c.json({ ok: false, error: "LINE is not configured" }, 503);
  const rawBody = await c.req.text();
  let payload: any;
  try { payload = JSON.parse(rawBody || "{}"); }
  catch { return c.json({ ok: false, error: "Invalid JSON" }, 400); }
  // LINE Developers sends an empty event list when the console's Verify button is used.
  // It cannot mutate state, so acknowledge it while keeping real webhook events signed.
  if (Array.isArray(payload.events) && payload.events.length === 0) return c.json({ ok: true });
  const received = c.req.header("x-line-signature") ?? "";
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  if (!received || received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    console.warn("[LINE webhook] signature rejected", {
      hasSignature: Boolean(received),
      eventCount: Array.isArray(payload.events) ? payload.events.length : null,
    });
    return c.json({ ok: false, error: "Invalid signature" }, 401);
  }
  for (const event of Array.isArray(payload.events) ? payload.events : []) {
    const text = event?.type === "message" && event?.message?.type === "text" ? String(event.message.text).trim() : "";
    const match = text.match(/^連携[\s　]+(\d{6})$/);
    if (!match || !event?.replyToken || !event?.source?.type) {
      console.log("[LINE webhook] event ignored", {
        eventType: String(event?.type ?? "unknown"),
        messageType: String(event?.message?.type ?? "none"),
        sourceType: String(event?.source?.type ?? "none"),
        matchedLinkCommand: Boolean(match),
      });
      continue;
    }
    const now = new Date().toISOString();
    const { data: link } = await supabase.from("line_link_codes").select("id,store_id,expires_at,used_at")
      .eq("code_hash", lineCodeHash(match[1])).is("used_at", null).gt("expires_at", now).maybeSingle();
    let reply = "連携コードが違うか、有効期限が切れています。管理画面で新しいコードを発行してください。";
    if (link) {
      const targetType = String(event.source.type);
      const targetId = String(event.source.groupId ?? event.source.roomId ?? event.source.userId ?? "");
      if (targetId && ["user", "group", "room"].includes(targetType)) {
        let displayName = targetType === "user" ? "個人LINE" : targetType === "group" ? "LINEグループ" : "複数人トーク";
        try {
          const profilePath = targetType === "group" ? `/v2/bot/group/${targetId}/summary` : targetType === "user" ? `/v2/bot/profile/${targetId}` : "";
          if (profilePath) {
            const profile = await lineRequest(token, profilePath);
            displayName = String(profile.groupName ?? profile.displayName ?? displayName);
          }
        } catch { /* Keep the safe fallback name. */ }
        const { error } = await supabase.from("line_notification_channels").upsert({ store_id: link.store_id, target_type: targetType, target_id: targetId, display_name: displayName, linked_at: now, updated_at: now }, { onConflict: "store_id" });
        if (!error) {
          await supabase.from("line_link_codes").update({ used_at: now }).eq("id", link.id);
          reply = `ShiftFlowと「${displayName}」を連携しました。`;
        } else reply = "連携の保存に失敗しました。管理者へ連絡してください。";
      }
    }
    console.log("[LINE webhook] link command handled", {
      codeAccepted: Boolean(link),
      sourceType: String(event.source.type),
    });
    await lineRequest(token, "/v2/bot/message/reply", { method: "POST", body: JSON.stringify({ replyToken: event.replyToken, messages: [{ type: "text", text: reply }] }) });
  }
  return c.json({ ok: true });
});

app.put("/api/admin/business-hours", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");
  const body = await c.req.json().catch(() => null);
  if (!validBusinessHours((body as { hours?: unknown } | null)?.hours)) {
    return c.json({ ok: false, error: "営業時間は15分単位で、開店より閉店を後にしてください" }, 400);
  }
  const hours = (body as { hours: BusinessHoursDefinition }).hours;
  const result = await supabase.from("stores").update({ business_hours: hours }).eq("id", storeId).select("id").maybeSingle();
  if (result.error) return c.json({ ok: false, error: result.error.message }, 500);
  if (!result.data) return c.json({ ok: false, error: "店舗が見つかりません" }, 404);
  return c.json({ ok: true, store_id: storeId, hours });
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

function secureStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
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

  if (!employee_id || !isEmployeeIdValidForNewRegistration(employee_id, storeId)) {
    return c.json({ ok: false, error: storeId === "kosai" ? "employee_id must be 9 digits" : "employee_id must be 8 digits" }, 400);
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

app.get("/api/admin/employees", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");
  const { data, error } = await supabase
    .from("employees")
    .select("employee_id, employee_name")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .order("employee_id", { ascending: true });

  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true, employees: data ?? [] });
});

app.delete("/api/admin/employees", requireAdmin, async (c) => {
  const storeId = c.get("admin_store_id");
  const body = await c.req.json().catch(() => null);
  const rawEmployeeIds = (body as { employee_ids?: unknown } | null)?.employee_ids;
  const employeeIds: string[] = Array.isArray(rawEmployeeIds)
    ? [...new Set(rawEmployeeIds.map((value: unknown) => String(value).trim()))]
    : [];

  if (employeeIds.length === 0 || employeeIds.length > 100) {
    return c.json({ ok: false, error: "employee_ids must contain 1 to 100 items" }, 400);
  }
  if (employeeIds.some((employeeId) => !isEmployeeIdValidForExistingStore(employeeId, storeId))) {
    return c.json({ ok: false, error: "invalid employee_id for store" }, 400);
  }

  const { data, error } = await supabase
    .from("employees")
    .update({ is_active: false })
    .eq("store_id", storeId)
    .eq("is_active", true)
    .in("employee_id", employeeIds)
    .select("employee_id");

  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({
    ok: true,
    deleted_employee_ids: (data ?? []).map((row) => String(row.employee_id)),
  });
});

//従業員ログイン
type EmployeePayload = {
  employee_id: string;
  store_id: string;
  iat: number;
  exp: number;
};

app.post("/api/employee/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: "invalid json" }, 400);

  const { employee_id, pin } = body as { employee_id?: string; pin?: string };

  if (!employee_id || !isEmployeeIdFormat(employee_id)) {
    return c.json({ ok: false, error: "employee_id must be 8 or 9 digits" }, 400);
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
    .select("employee_id, employee_name, store_id, pin_hash, is_active, worktime_group")
    .eq("employee_id", employee_id)
    .maybeSingle();

  if (empRes.error) return c.json({ ok: false, error: empRes.error.message }, 500);
  if (!empRes.data) return c.json({ ok: false, error: "not found" }, 401);
  if (!isEmployeeIdValidForExistingStore(employee_id, empRes.data.store_id)) {
    return c.json({ ok: false, error: "invalid employee_id for store" }, 401);
  }
  if (!empRes.data.is_active) return c.json({ ok: false, error: "inactive" }, 403);
  if (!empRes.data.pin_hash) return c.json({ ok: false, error: "pin not set" }, 403);

  const inputHash = hashEmployeePin(pin, salt);

  if (!secureStringEqual(inputHash, String(empRes.data.pin_hash))) {
    return c.json({ ok: false, error: "invalid credentials" }, 401);
  }

  let monthly_target_minutes: number | null = null;

  const submissionCountResult = await supabase
    .from("shift_submissions")
    .select("employee_id", { count: "exact", head: true })
    .eq("store_id", empRes.data.store_id)
    .eq("employee_id", employee_id);
  const submission_count = submissionCountResult.error ? 0 : Number(submissionCountResult.count ?? 0);

  const payload: EmployeePayload = {
    employee_id,
    store_id: empRes.data.store_id,
    iat: Date.now(),
    exp: Date.now() + EMPLOYEE_TOKEN_TTL_MS,
  }

  const token = signToken(payload, secret);
  return c.json({ ok: true, 
    token, 
    employee_id, 
    employee_name: empRes.data.employee_name, 
    store_id: empRes.data.store_id,
    monthly_target_minutes,
    submission_count,
  });

});

const requireEmployee: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const auth = c.req.header("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  const secret = process.env.EMPLOYEE_TOKEN_SECRET;
  if (!secret) return c.json({ ok: false, error: "EMPLOYEE_TOKEN_SECRET missing" }, 500);

  const payload = verifyToken<EmployeePayload>(token, secret);
  if (!payload || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  // 削除・無効化された従業員の既発行トークンを即時に失効させる。
  const employee = await supabase.from("employees")
    .select("employee_name")
    .eq("employee_id", payload.employee_id)
    .eq("store_id", payload.store_id)
    .eq("is_active", true)
    .maybeSingle();
  if (employee.error || !employee.data) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  c.set("employee_id", payload.employee_id);
  c.set("employee_store_id", payload.store_id);
  c.set("employee_name", String(employee.data.employee_name ?? ""));
  await next();
}

app.get("/api/employee/announcement", requireEmployee, async (c) => {
  const storeId = c.get("employee_store_id") as string;
  const { data, error } = await supabase.from("store_announcements").select("message,updated_at").eq("store_id", storeId).eq("is_active", true).maybeSingle();
  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true, announcement: data ?? null });
});

app.post("/api/employee/mascot-event", requireEmployee, async (c) => {
  const employeeId = c.get("employee_id") as string;
  const storeId = c.get("employee_store_id") as string;
  const body = await c.req.json().catch(() => null) as { event_type?: string } | null;
  const eventType = String(body?.event_type ?? "");
  if (!["view", "tap", "hint_view", "hint_tap", "status_open", "item_use", "emote_use"].includes(eventType)) return c.json({ ok: false, error: "invalid event" }, 400);
  const salt = String(process.env.EMPLOYEE_PIN_SALT ?? process.env.EMPLOYEE_TOKEN_SECRET ?? "shiftflow");
  const employeeHash = crypto.createHmac("sha256", salt).update(`${storeId}:${employeeId}`).digest("hex");
  const eventDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
  const { error } = await supabase.from("mascot_events").upsert({ store_id: storeId, employee_hash: employeeHash, event_type: eventType, event_date: eventDate }, { onConflict: "store_id,employee_hash,event_type,event_date", ignoreDuplicates: true });
  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true });
});

function mascotEmployeeHash(storeId: string, employeeId: string) {
  const salt = String(process.env.EMPLOYEE_PIN_SALT ?? process.env.EMPLOYEE_TOKEN_SECRET ?? "shiftflow");
  return crypto.createHmac("sha256", salt).update(`${storeId}:${employeeId}`).digest("hex");
}

function mascotGamePayload(row: any) {
  const xp = Math.max(0, Number(row?.xp) || 0);
  const levelRow = mascotLevelForXp(xp);
  const coolness = Math.max(0, Number(row?.coolness) || 0);
  const cuteness = Math.max(0, Number(row?.cuteness) || 0);
  const beauty = Math.max(0, Number(row?.beauty) || 0);
  const spent = coolness + cuteness + beauty;
  const nextTotalXp = levelRow.xpToNext === null ? null : levelRow.totalXp + levelRow.xpToNext;
  return {
    xp,
    level: levelRow.level,
    level_start_xp: levelRow.totalXp,
    next_level_xp: nextTotalXp,
    coolness,
    cuteness,
    beauty,
    equipped_item: String(row?.equipped_item ?? ""),
    unspent_points: Math.max(0, levelRow.level - 1 - spent),
    slime_available: !row?.slime_available_at || new Date(row.slime_available_at).getTime() <= Date.now(),
    slime_available_at: row?.slime_available_at ?? null,
  };
}

async function mascotGameIdentity(c: any) {
  const employeeId = c.get("employee_id") as string;
  const storeId = c.get("employee_store_id") as string;
  return { storeId, employeeHash: mascotEmployeeHash(storeId, employeeId) };
}

async function employeeSubmissionCount(storeId: string, employeeId: string) {
  const result = await supabase.from("shift_submissions").select("employee_id", { count: "exact", head: true })
    .eq("store_id", storeId).eq("employee_id", employeeId);
  return result.error ? 0 : Number(result.count ?? 0);
}

app.get("/api/employee/mascot-game", requireEmployee, async (c) => {
  const { storeId, employeeHash } = await mascotGameIdentity(c);
  const { error: insertError } = await supabase.from("mascot_game_states")
    .upsert({ store_id: storeId, employee_hash: employeeHash }, { onConflict: "store_id,employee_hash", ignoreDuplicates: true });
  if (insertError) return c.json({ ok: false, error: insertError.message }, 500);
  const { data, error } = await supabase.from("mascot_game_states").select("xp,coolness,cuteness,beauty,equipped_item,slime_available_at")
    .eq("store_id", storeId).eq("employee_hash", employeeHash).single();
  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true, game: mascotGamePayload(data) });
});

app.post("/api/employee/mascot-game/tap", requireEmployee, async (c) => {
  const { storeId, employeeHash } = await mascotGameIdentity(c);
  const body = await c.req.json().catch(() => null) as { count?: number } | null;
  const count = Number(body?.count);
  if (!Number.isInteger(count) || count < 1 || count > 20) return c.json({ ok: false, error: "invalid tap count" }, 400);
  const { data, error } = await supabase.rpc("add_mascot_tap_xp", { p_store_id: storeId, p_employee_hash: employeeHash, p_amount: count });
  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true, game: mascotGamePayload(data) });
});

app.post("/api/employee/mascot-game/slime", requireEmployee, async (c) => {
  const { storeId, employeeHash } = await mascotGameIdentity(c);
  const { data, error } = await supabase.rpc("claim_mascot_slime", { p_store_id: storeId, p_employee_hash: employeeHash });
  if (error) return c.json({ ok: false, error: error.message.includes("slime unavailable") ? "スライムは逃げてしまいました" : error.message }, error.message.includes("slime unavailable") ? 409 : 500);
  return c.json({ ok: true, reward: 100, game: mascotGamePayload(data) });
});

app.post("/api/employee/mascot-game/stat", requireEmployee, async (c) => {
  const { storeId, employeeHash } = await mascotGameIdentity(c);
  const body = await c.req.json().catch(() => null) as { stat?: string } | null;
  const stat = String(body?.stat ?? "");
  if (!["coolness", "cuteness", "beauty"].includes(stat)) return c.json({ ok: false, error: "invalid stat" }, 400);
  const { data, error } = await supabase.rpc("spend_mascot_stat", { p_store_id: storeId, p_employee_hash: employeeHash, p_stat: stat });
  if (error) return c.json({ ok: false, error: error.message.includes("no stat points") ? "振り分けられるポイントがありません" : error.message }, error.message.includes("no stat points") ? 409 : 500);
  return c.json({ ok: true, game: mascotGamePayload(data) });
});

app.post("/api/employee/mascot-game/equip", requireEmployee, async (c) => {
  const employeeId = c.get("employee_id") as string;
  const { storeId, employeeHash } = await mascotGameIdentity(c);
  const body = await c.req.json().catch(() => null) as { item_id?: string } | null;
  const itemId = String(body?.item_id ?? "");
  const { data: current, error: loadError } = await supabase.from("mascot_game_states")
    .select("xp,coolness,cuteness,beauty,equipped_item,slime_available_at")
    .eq("store_id", storeId).eq("employee_hash", employeeHash).single();
  if (loadError) return c.json({ ok: false, error: loadError.message }, 500);
  if (itemId) {
    const item = MASCOT_ITEMS.find((candidate) => candidate.id === itemId);
    const stats = { coolness: Number(current.coolness) || 0, cuteness: Number(current.cuteness) || 0, beauty: Number(current.beauty) || 0 } satisfies Record<MascotStatKey, number>;
    const submissions = await employeeSubmissionCount(storeId, employeeId);
    if (!item || !mascotUnlockAvailable(item, stats, submissions)) return c.json({ ok: false, error: "まだ解放されていないアイテムです" }, 403);
  }
  const { data, error } = await supabase.from("mascot_game_states").update({ equipped_item: itemId || null, updated_at: new Date().toISOString() })
    .eq("store_id", storeId).eq("employee_hash", employeeHash)
    .select("xp,coolness,cuteness,beauty,equipped_item,slime_available_at").single();
  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true, game: mascotGamePayload(data) });
});

app.post("/api/employee/mascot-game/event-reward", requireEmployee, async (c) => {
  const { storeId, employeeHash } = await mascotGameIdentity(c);
  const body = await c.req.json().catch(() => null) as { event_type?: string } | null;
  if (body?.event_type !== "slime_battle") return c.json({ ok: false, error: "invalid event" }, 400);
  const rewardDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
  const { data, error } = await supabase.rpc("claim_mascot_event_reward", { p_store_id: storeId, p_employee_hash: employeeHash, p_event_type: "slime_battle", p_reward_date: rewardDate });
  if (error?.message.includes("reward already claimed")) return c.json({ ok: true, awarded: false });
  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true, awarded: true, reward: 50, game: mascotGamePayload(data) });
});

app.get("/api/shifts", requireEmployee, async (c) => {
  const employeeId = c.get("employee_id") as string;
  const storeId = c.get("employee_store_id") as string;

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

app.get("/api/employee/submissions", requireEmployee, async (c) => {
  const employeeId = c.get("employee_id") as string;
  const storeId = c.get("employee_store_id") as string;
  const { data, error } = await supabase.from("shift_submissions")
    .select("week_start,data,status,comment,submitted_at,updated_at")
    .eq("store_id", storeId).eq("employee_id", employeeId)
    .order("week_start", { ascending: false }).limit(8);
  if (error) return c.json({ ok: false, error: error.message }, 500);
  return c.json({ ok: true, submissions: data ?? [] });
});

app.get("/api/employee/calendar", requireEmployee, async (c) => {
  const employeeId = c.get("employee_id") as string;
  const storeId = c.get("employee_store_id") as string;
  const month = c.req.query("month")?.trim() ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return c.json({ ok: false, error: "month must be YYYY-MM" }, 400);
  const [year, monthNumber] = month.split("-").map(Number);
  const calendarDayKeys: ShiftDayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const monthStart = new Date(year, monthNumber - 1, 1);
  const monthEnd = new Date(year, monthNumber, 0);
  const queryStart = new Date(monthStart);
  queryStart.setDate(queryStart.getDate() - 6);
  const dateISO = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const submissionResult = await supabase.from("shift_submissions")
    .select("week_start, data")
    .eq("store_id", storeId)
    .eq("employee_id", employeeId)
    .gte("week_start", dateISO(queryStart))
    .lte("week_start", dateISO(monthEnd));
  const error = submissionResult.error;
  if (error) return c.json({ ok: false, error: error.message }, 500);
  const entries = new Map<string, { requested?: string }>();
  const addWeek = (weekStart: string, values: Record<string, string>) => {
    const [y, m, d] = weekStart.split("-").map(Number);
    const monday = new Date(y, m - 1, d);
    calendarDayKeys.forEach((dayKey, index) => {
      const value = String(values?.[dayKey] ?? "").trim();
      if (!value) return;
      const date = new Date(monday);
      date.setDate(date.getDate() + index);
      const key = dateISO(date);
      entries.set(key, { requested: value });
    });
  };
  (submissionResult.data ?? []).forEach((row) => addWeek(String(row.week_start), row.data ?? {}));
  const holidays = japaneseHolidays(year)
    .filter((holiday) => holiday.date.startsWith(`${month}-`));
  return c.json({ ok: true, month, entries: Object.fromEntries(entries), holidays });
})

app.post("/api/shifts", requireEmployee, async (c) => {
  const employeeId = c.get("employee_id");
  const storeId = c.get("employee_store_id");
  const employeeName = c.get("employee_name");
  if (!employeeId || !storeId) return c.json({ ok: false, error: "Unauthorized" }, 401);
  const json = await c.req.json().catch(() => null);
  const parsed = shiftSchema.safeParse(json);

  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.flatten() }, 400);
  }

  const body = parsed.data;

  const holidayDates = holidaysForWeek(body.week_start);
  const dayKeys: ShiftDayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const [year, month, day] = body.week_start.split("-").map(Number);
  const weekStart = new Date(year, month - 1, day);
  const holidayDays = new Set<ShiftDayKey>();
  dayKeys.forEach((dayKey, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    if (holidayDates.has(ymd)) holidayDays.add(dayKey);
  });
  const hours = await loadBusinessHours(storeId);
  const shiftError = validateShiftDataForStore(storeId, body.data, holidayDays, hours ?? undefined);
  if (shiftError) return c.json({ ok: false, error: shiftError }, 400);

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
        employee_name: employeeName,
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
      employee_name: employeeName,
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
  const out = {} as Record<DayKey, number>;

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

type Breakdown = Record<DayKey, { normal: number; night: number }>;

function asInt(n: any, label: string): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) throw new Error(`${label} must be >= 0 number`);
  return Math.floor(v);
}

function sanitizeBreakdown(raw: any): Breakdown {
  if (!raw || typeof raw !== "object") throw new Error("breakdown is invalid");
  const out = {} as Breakdown;

  for (const k of DAY_KEYS) {
    const row = (raw as any)[k];
    if (!row || typeof row !== "object") throw new Error(`breakdown.${k} is invalid`);

    const normal = asInt(row.normal ?? 0, `breakdown.${k}.normal`);
    const night  = asInt(row.night  ?? 0, `breakdown.${k}.night`);

    // 1日上限チェック（必要なら）
    if (normal + night > 1440) throw new Error(`${k} total exceeds 24:00`);

    out[k] = { normal, night };
  }
  return out;
}

function totalsFromBreakdown(b: Breakdown): Record<DayKey, number> {
  const out = {} as Record<DayKey, number>;
  for (const k of DAY_KEYS) out[k] = b[k].normal + b[k].night;
  return out;
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

  // breakdown 普通と深夜　を受け取る
  let breakdown: Breakdown | null = null;
  try {
    const rawBreakdown = body.breakdown ?? body.data?.breakdown ?? null;
    if (rawBreakdown) breakdown = sanitizeBreakdown(rawBreakdown);
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 400);
  }

  // breakdown　がきてるなら　合算data を　breakdown から作り直す
  if (breakdown) {
    data = totalsFromBreakdown(breakdown);
  }

  // DBに入れるdata
  const dataToStore = breakdown ? ({ ...data, breakdown } as any) : (data as any);

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
        data: dataToStore,
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
      data: dataToStore,
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
    //const expectedPw = (process.env.ADMIN_PASSWORD ?? "").trim();
    //demo用パスワード追加
    const expectedPw = (
      (
        storeId === "demo"
          ? process.env.DEMO_ADMIN_PASSWORD
          : process.env.ADMIN_PASSWORD
      ) ?? ""
    ).trim();

    if (!storeId) return c.json({ ok: false, error: "店舗を選択してください" }, 400);
    if (!password) return c.json({ ok: false, error: "パスワードが必要です" }, 400);
    if (!expectedPw || !secureStringEqual(password, expectedPw)) {
      return c.json({ ok: false, error: "パスワードが違います" }, 401);
    }

    //store_id　が実在するかチェック（不正store_idでトークン発酵させない）
    const { data: store, error } = await supabase
      .from("stores")
      .select("id")
      .eq("id", storeId)
      .maybeSingle();

    if (error) return c.json({ ok: false, error: error.message }, 500);
    if (!store) return c.json({ ok: false, error: "不正な店舗です" }, 400);

    const token = issueAdminToken({ store_id: storeId });
    return c.json({ ok: true, token});
});

// ===== worktime admin dashboard =====
app.get("/api/worktime/admin/dashboard", requireAdmin, async (c) => {
  const week_start = c.req.query("week_start") || "";
  const storeId = c.get("admin_store_id");
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
    .eq("store_id", storeId)
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

// ローカルだと動かない↓
/*app.post("/api/worktime/admin/login", async (c) => {
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
});*/

//demoログイン追加
app.post("/api/worktime/admin/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const password = String(body?.password ?? "");

  const ADMIN_PASSWORD = c.env.ADMIN_PASSWORD ?? "";
  const DEMO_PASSWORD = c.env.DEMO_WORKTIME_ADMIN_PASSWORD ?? "";

  let store_id = "";

  if (password === DEMO_PASSWORD) {
    store_id = "demo";
  } else if (password === ADMIN_PASSWORD) {
    store_id =
      c.env.WORKTIME_ADMIN_STORE_ID ??
      c.env.ADMIN_STORE_ID ??
      "";
  } else {
    return c.json({ ok: false, error: "Invalid password" }, 401);
  }

  const token = issueAdminToken({ store_id });
  return c.json({ ok: true, token });
});

// ローカルだと動く↓
/*app.post("/api/worktime/admin/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const password = String(body?.password ?? "");

  // ✅ dev(tsx) でも Workers でも動くように両対応
  const ADMIN_PASSWORD =
    String((c.env as any)?.ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "");
  const store_id =
    String(
      (c.env as any)?.WORKTIME_ADMIN_STORE_ID ??
        (c.env as any)?.ADMIN_STORE_ID ??
        process.env.WORKTIME_ADMIN_STORE_ID ??
        process.env.ADMIN_STORE_ID ??
        ""
    );

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
    .select("employee_id, employee_name, is_active, worktime_group")
    .eq("store_id", store_id)
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
    .gte("week_start", rangeStartYmd)
    .lt("week_start", rangeEndYmd);

  if (subRes.error) return c.json({ ok: false, error: subRes.error.message }, 500);

  const keyOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

  // 集計箱
  const totalMap = new Map<string, { total_minutes: number; night_minutes: number; weeks: Set<string> }>();
  for (const e of employees) totalMap.set(e.employee_id, { total_minutes: 0, night_minutes: 0, weeks: new Set() });

  for (const s of subRes.data ?? []) {
    const employee_id = String((s as any).employee_id);
    const box = totalMap.get(employee_id);
    if (!box) continue;

    const ws = String((s as any).week_start);
    const data = ((s as any).data ?? {}) as any; // { mon..sun, breakdown? }
    const weekStartDate = new Date(`${ws}T00:00:00`);

    let touched = false;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate);
      d.setDate(d.getDate() + i);
      if (d < monthStart || d >= nextMonthStart) continue;

      const k = keyOrder[i];
      const v = Number(data?.[k] ?? 0) || 0;
      if (v > 0) touched = true;
      box.total_minutes += v;

      // 深夜
      const night = Number(data?.breakdown?.[k]?.night ?? 0) || 0;
      box.night_minutes += night;
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
        night_minutes: box.night_minutes,
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
  if (!store_id) return c.json({ ok: false, error: "store unavailable" }, 403);

  const body = await c.req.json().catch(() => ({}));
  const week_start = String(body?.week_start ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
    return c.json({ ok: false, error: "week_start must be YYYY-MM-DD" }, 400);
  }

  // 社員（管理対象）
  const empRes = await supabase
    .from("employees")
    .select("employee_id, employee_name, email, is_active")
    .eq("store_id", store_id)
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
    .eq("store_id", store_id)
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
  lines.push("下記の勤務時間入力フォームから入力を行ってください。");
  lines.push("https://shiftflow-e14.pages.dev/worktime");
  lines.push("");
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
  const store_id = c.get("admin_store_id") as string;
  const leaveUrl = process.env.LEAVE_SUPABASE_URL;
  const leaveKey = process.env.LEAVE_SUPABASE_SERVICE_ROLE_KEY;
  if (!leaveUrl || !leaveKey) {
    return c.json({ ok: false, error: "leave summary unavailable" }, 503);
  }
  const { data, error } = await createClient(leaveUrl, leaveKey)
    .from("leave_admin_summary_v1")
    .select("*")
    .eq("store_id", store_id)
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

// inventory で従業員使うAPI
app.get("/api/public/employees", async (c) => {
  const store_id = String(c.req.query("store_id") ?? "").trim();
  if (!store_id) return c.json({ ok: false, error: "store_id required "}, 400)

  // 店舗制限
  const allowed = new Set(["7249", "7109", "7539"]);
  if (!allowed.has(store_id)) {
    return c.json({ ok: false, error: "forbidden store" }, 403);
  }

  // 任意：簡易キー
  const expected = process.env.PUBLIC_EMPLOYEES_KEY; // ←複数に統一
  const key = c.req.header("x-public-key") ?? "";

  if (expected && key !== expected) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }

  const q = await supabase
    .from("employees")
    .select("employee_name")
    .eq("store_id", store_id)
    .eq("is_active", true)
    .order("employee_name", { ascending: true });

  if (q.error) return c.json({ ok: false, error: q.error.message }, 500);
  
  const names = (q.data ?? [])
    .map((r: any) => String(r.employee_name ?? "").trim())
    .filter(Boolean);
  
  return c.json({ ok: true, store_id, names });
});


// エラー確認
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

export default {
  fetch: app.fetch,
  scheduled() {},
};
