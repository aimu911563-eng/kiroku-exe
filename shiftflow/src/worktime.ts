console.log ("main.tsが読み込まれた:");
const EMP_TOKEN_KEY = "shiftflow_employee_token";
const EMPLOYEE_NAME_KEY = "shiftflow_employee_name";
const STORE_ID_KEY = "shiftflow_employee_store_id";
const MONTHLY_TARGET_KEY = "shiftflow_monthly_target_minutes";


type LoginResponse = {
  token: string;
  employee_name?: string;
  store_id?: string;
  monthly_target_minutes?: number | null;
};

type WorktimeGetResponse = {
  week_start: string;
  data: Record<DayKey, number>;
  status?: "submitted" | "updated";
  total_minutes?: number;
  updated_at?: string;
  breakdown?: Partial<Record<DayKey, { normal: number; night: number }>>; 
};

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

type WorktimeRow = {
  week_start: string;
  data: { mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number };
  status: string;
  total_minutes: number;
};

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element not found: #${id}`);
  return el;
}

function getToken(): string | null {
  return localStorage.getItem(EMP_TOKEN_KEY);
}

function setLoggedInInfo(res: LoginResponse) {
  localStorage.setItem(EMP_TOKEN_KEY, res.token);
  if (res.employee_name) localStorage.setItem(EMPLOYEE_NAME_KEY, res.employee_name);
  if (res.store_id) localStorage.setItem(STORE_ID_KEY, res.store_id);
  if (res.monthly_target_minutes !== null) {
    localStorage.setItem(MONTHLY_TARGET_KEY, String(res.monthly_target_minutes))
  } else {
    localStorage.removeItem(MONTHLY_TARGET_KEY)
  }
}

function setSplitInputsFromResponse(d: WorktimeGetResponse) {
  // breakdown があればそれを優先
  const bd = d.breakdown ?? (d.data as any)?.breakdown; // どっちで来ても拾えるように

  for (const k of DAY_KEYS) {
    const normalEl = document.getElementById(`${k}_normal`) as HTMLInputElement | null;
    const nightEl  = document.getElementById(`${k}_night`) as HTMLInputElement | null;
    if (!normalEl || !nightEl) continue;

    if (bd?.[k]) {
      const n = Number(bd[k]?.normal ?? 0);
      const ng = Number(bd[k]?.night ?? 0);
      normalEl.value = n > 0 ? formatHHMM(n) : "";
      nightEl.value  = ng > 0 ? formatHHMM(ng) : "";
    } else {
      // 旧データ互換：合算しか無いなら「通常」に全部入れる（深夜は空）
      const total = Number(d.data?.[k] ?? 0);
      normalEl.value = total > 0 ? formatHHMM(total) : "";
      nightEl.value  = "";
    }

    // 日別合計表示
    const sumEl = document.getElementById(`${k}_sum`);
    if (sumEl) {
      const ra = parseHhmmToMinutes(normalEl.value);
      const a = ra.ok ? ra.minutes : 0;
      const rb = parseHhmmToMinutes(nightEl.value);
      const b = rb.ok ? rb.minutes : 0;
      sumEl.textContent = formatHHMM(a + b);
    }
  }
}

/*function clearLoginInfo() {
  localStorage.removeItem(EMP_TOKEN_KEY);
  localStorage.removeItem(EMPLOYEE_NAME_KEY);
  localStorage.removeItem(STORE_ID_KEY);
}*/

function showLoggedOut(msg = "") {
  const loginWrap = $("loginWrap");
  const worktimeArea = $("worktimeArea");
  loginWrap.style.display = "";
  worktimeArea.style.display = "none";

  const userBar = document.getElementById("userBar");
  if (userBar) userBar.style.display = "none";

  const authMsg = $("employeeAuthMsg");
  authMsg.textContent = msg;
}

function showLoggedIn() {
  const loginWrap = $("loginWrap");
  const worktimeArea = $("worktimeArea");
  loginWrap.style.display = "none";
  worktimeArea.style.display = "";
  

  const name = localStorage.getItem(EMPLOYEE_NAME_KEY) ?? "";
  const storeId = localStorage.getItem(STORE_ID_KEY) ?? "";
  const label = document.getElementById("loginUserLabel");
  const userBar = document.getElementById("userBar");

  if (userBar) userBar.style.display = "";
  if (label) label.textContent = `👤 ${name}（店舗 ${storeId}）`;

  // 週開始日をデフォセット
  const weekStart = $("weekStart") as HTMLInputElement;
  if (!weekStart.value) {
    weekStart.value = toISODate(getMonday(new Date()));
  }

  // ログイン直後に今週をロード
  loadWorktimeForWeek(weekStart.value);
  attachRealtimeWeekTotal();
}

function toISODate(d: Date): string {
  // ローカル日付で YYYY-MM-DD を作る
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // Mon=0..Sun=6
  d.setDate(d.getDate() - diff);
  return d;
}

function normalizeWeekStartInput() {
  const weekStart = $("weekStart") as HTMLInputElement;
  weekStart.addEventListener("change", () => {
    if (!weekStart.value) return;
    const selected = new Date(weekStart.value + "T00:00:00");
    const monday = getMonday(selected);
    weekStart.value = toISODate(monday);

    // 週が変わったらロード
    loadWorktimeForWeek(weekStart.value);
    updateDayLabels();
    updateMonthTotalLabel();
  });
}

function setStorePreview(text: string) {
  const el = $("storePreview");
  el.textContent = text;
}

function updateStorePreview() {
  const employeeId = ($("employeeId") as HTMLInputElement).value.trim();
  if (employeeId.length >= 4) {
    setStorePreview(`店舗コード: ${employeeId.slice(0, 4)}`);
  } else {
    setStorePreview("");
  }
}

//入力欄に反映する関数
/*function setDayInputFromMinutes(data: Record<string, number>) {
  (["mon","tue","wed","thu","fri","sat","sun"] as const).forEach((k) => {
    const el = document.getElementById(k) as HTMLInputElement | null;
    if (!el) return;

    const mins = Number(data?.[k] ?? 0);
    el.value = mins > 0 ? formatHHMM(mins) : ""; //  0なら空
  });
}*/

/*function setDayInputFromMinutes(data: Record<string, number>) {

  (DAY_KEYS as const).forEach((k) => {
    const normalEl = document.getElementById(`${k}_normal`) as HTMLInputElement | null;
    const nightEl  = document.getElementById(`${k}_night`) as HTMLInputElement | null;
    const sumEl    = document.getElementById(`${k}_sum`) as HTMLElement | null;

    const mins = Number(data?.[k] ?? 0);
    if (normalEl) normalEl.value = mins > 0 ? formatHHMM(mins) : ""; // 合計を通常側へ寄せる
    if (nightEl) nightEl.value = ""; // 取得できないので空
    if (sumEl) sumEl.textContent = formatHHMM(mins);
  });
  recalcTotalsUI();
}*/
//空欄なら何もしない
/*function attachTimeInputHandlers() {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(".timeInput"));

    for (const el of inputs) {
        el.addEventListener("input", () => {
            (window as any).__recalcWorktimeTotal?.();
        });

        el.addEventListener("blur", () => {
            const r = parseHhmmToMinutes(el.value);
            if (!r.ok) return;
            el.value = r.normalized;
            (window as any).__recalcWorktimeTotal?.();
        })
    }
}*/

//曜日の横に日付を表示する　ゼロ埋めにする
function pad2(n: number) {
    return String(n).padStart(2, "0");
}

function formatLabel(d: Date, wd: string) {
    const m = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    return `${m}/${day}(${wd})`;
}


function updateDayLabels() {
    const weekStartEl = document.getElementById("weekStart") as HTMLInputElement | null;
    if (!weekStartEl?.value) return;

    const ws = new Date(weekStartEl.value + "T00:00:00");

    const labels = Array.from(document.querySelectorAll<HTMLElement>(".dayLabel"));
    for (const label of labels) {
        const dayIndex = Number(label.dataset.day ?? "0");
        const wd = label.dataset.wd ?? "";

        const d = new Date(ws);
        d.setDate(ws.getDate() + dayIndex);

        label.textContent = formatLabel(d, wd)
    }
}


//GETして反映する
async function loadWorktimeForWeek(weekStart: string) {
    const msgEl = $("message");
    const submitStatus = $("submitStatus");

    msgEl.textContent = "";
    submitStatus.textContent = "読み込み中";

    const token = getToken();
    if (!token) {
        showLoggedOut("ログインが必要です");
        return;
    }

    try {
        const res = await fetch(`/api/worktime?week_start=${encodeURIComponent(weekStart)}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 404) {
            //未提出:ゼロ初期化
            setAllZeroSplit();
            submitStatus.textContent = "未提出(新規入力)";
            //合計再計算(blur待たずに更新)
            recalcTotalsUI();
            return;
        }

        if(!res.ok) {
            const text = await res.text().catch(() => "");
            submitStatus.textContent = "";
            msgEl.textContent = `読み込み失敗 (${res.status}) ${text ? `: ${text}` : ""}`;
            return;
        }

        const data = (await res.json()) as WorktimeGetResponse;

        setSplitInputsFromResponse(data);
        submitStatus.textContent =
          data.status === "updated"
            ? "提出済(更新済)"
            : "提出済";
        recalcTotalsUI();
    } catch (e) {
        submitStatus.textContent = "";
        msgEl.textContent = `読み込み失敗: ${String(e)}`;
    }

    recalcWeekTotalUI();
}

//週データを取る関数
async function fetchWorktimeWeek(ws: string, token: string): Promise<WorktimeRow | null> {
    const res = await fetch(`/api/worktime?week_start=${encodeURIComponent(ws)}`, {
        headers: { Authorization: `Bearer ${token}`},
    });
    if (!res.ok) return null;

    const json = await res.json();
    //帰りが配列なら先頭、単体ならそれ
    const row = Array.isArray(json) ? json[0] : json;
    return row ?? null;
}

function attachLoginHandlers() {
  const employeeIdEl = $("employeeId") as HTMLInputElement;
  const pinEl = $("pinInput") as HTMLInputElement;
  const loginBtn = $("employeeLoginBtn") as HTMLButtonElement;
  const authMsg = $("employeeAuthMsg");

  employeeIdEl.addEventListener("input", updateStorePreview);

  // Enterでログインできるように（任意）
  pinEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginBtn.click();
  });

  loginBtn.addEventListener("click", async () => {
    authMsg.textContent = "";
    const employee_id = employeeIdEl.value.trim();
    const pin = pinEl.value.trim();

    if (!employee_id) {
      authMsg.textContent = "従業員番号を入力してください";
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      authMsg.textContent = "パスワードは4桁で入力してください";
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "ログイン中…";

    try {
      const res = await fetch("/api/employee/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id, pin }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        authMsg.textContent = `ログイン失敗（${res.status}）${text ? `: ${text}` : ""}`;
        return;
      }

      const data = (await res.json()) as LoginResponse;

      if (!data.token) {
        authMsg.textContent = "ログイン応答が不正です（tokenがありません）";
        return;
      }

      setLoggedInInfo(data);

      if (data.monthly_target_minutes != null) {
        localStorage.setItem(MONTHLY_TARGET_KEY, String(data.monthly_target_minutes));
      } else {
        localStorage.removeItem(MONTHLY_TARGET_KEY);
      }



      showLoggedIn();
      updateMonthTotalLabel();

      const weekStartEl = document.getElementById("weekStart") as HTMLInputElement | null;
      if (weekStartEl) {
        if (!weekStartEl.value) {
            weekStartEl.value = toISODate(getMonday(new Date()));
        }
        loadWorktimeForWeek(weekStartEl.value)
      }

    } catch (e) {
      authMsg.textContent = `ログイン失敗: ${String(e)}`;
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "ログイン";
    }
  });
}

document.getElementById("logoutBtn")?.addEventListener("click", () => {
  localStorage.removeItem(EMP_TOKEN_KEY);
  localStorage.removeItem(EMPLOYEE_NAME_KEY);
  localStorage.removeItem(STORE_ID_KEY);
  showLoggedOut("ログアウトしました");
});

// 月の最初の月曜日
/*function firstMondayOfMonth(base: Date) {
  const y = base.getFullYear();
  const m = base.getMonth();
  const first = new Date(y, m, 1);          // 月初
  const monday = getMonday(first);          // その週の月曜（= 月初が火〜日なら前月の月曜になる）
  if (monday.getMonth() !== m) monday.setDate(monday.getDate() + 7); // 前月に落ちたら翌週へ
  return monday;
}*/


// ---- hh:mm 入力 → 分 ----

/*function parseHhmmToMinutes(raw: string): { ok: true; minutes: number; normalized: string } | { ok: false; error: string } {
  const s = raw.trim();
  if (s === "") return { ok: true, minutes: 0, normalized: "00:00" };

  // 830 / 0830 みたいなのを 08:30 に寄せたい（任意）
  const compact = s.replace(/[^0-9]/g, "");
  if (/^\d{3,4}$/.test(compact) && !s.includes(":")) {
    const h = compact.length === 3 ? compact.slice(0, 1) : compact.slice(0, 2);
    const m = compact.slice(-2);
    return parseHhmmToMinutes(`${h}:${m}`);
  }

  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { ok: false, error: "形式は hh:mm（例 08:30）で入力してください" };

  const hh = Number(m[1]);
  const mm = Number(m[2]);

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return { ok: false, error: "数値として解釈できません" };
  if (mm < 0 || mm > 59) return { ok: false, error: "分は00〜59です" };
  if (hh < 0 || hh > 24) return { ok: false, error: "時間は0〜24です" };
  if (hh === 24 && mm !== 0) return { ok: false, error: "24:00 以外の24時台は無効です" };

  const minutes = hh * 60 + mm;
  if (minutes > 1440) return { ok: false, error: "1日の上限は24:00です" };

  const normalized = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  return { ok: true, minutes, normalized };
}*/

function parseHhmmToMinutes(raw: string):
  | { ok: true; minutes: number; normalized: string }
  | { ok: false; error: string } {

    const s = raw.trim();

    if (s === "") return { ok: true, minutes: 0, normalized: "" };

    const compact = s.replace(/[^0-9]/g, "");
    if (/^\d{3,4}$/.test(compact) && !s.includes(":")) {
        const h = compact.length === 3 ? compact.slice(0, 1) : compact.slice(0, 2);
        const m = compact.slice(-2);
        return parseHhmmToMinutes(`${h}:${m}`);
    }

    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return { ok: false, error: "形式は hh:mm(例 08:30) で入力してください" };

    const hh = Number(m[1]);
    const mm = Number(m[2]);

    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return { ok: false, error: "数値として解釈できません" };
    if (mm < 0 || mm > 59) return { ok: false, error: "分は00~59です" };
    if (hh < 0 || hh > 24) return { ok: false, error: "時間は00~24です" };
    if (hh === 24 && mm !== 0) return { ok: false, error: "24:00 以外の24時台は無効です" };

    const minutes = hh * 60 + mm;
    if (minutes > 1440) return { ok: false, error: "1日の上限は24:00です" };

    const normalized = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    return { ok: true, minutes, normalized}
  }


function minutesToHhmm(total: number): string {
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/*function attachHhmmHandlers() {
  const weekTotalEl = $("weekTotal");
  const msgEl = $("message");

  const inputs = DAY_KEYS.map((k) => $(k) as HTMLInputElement);

  function recalc() {
    msgEl.textContent = "";
    let sum = 0;

    for (const input of inputs) {
      const r = parseHhmmToMinutes(input.value);
      if (!r.ok) {
        msgEl.textContent = r.error;
        weekTotalEl.textContent = "00:00";
        return;
      }
      sum += r.minutes;
    }

    weekTotalEl.textContent = minutesToHhmm(sum);
  }

  // 入力のたびに合計更新
  for (const input of inputs) {
    input.addEventListener("input", recalc);
    input.addEventListener("blur", () => {
      const r = parseHhmmToMinutes(input.value);
      if (r.ok) input.value = r.normalized;
      recalc();
    });
  }

  (window as any).__recalcWorktimeTotal = recalc;
  recalc();
}*/

/*function collectMinutesPayload(): Record<DayKey, number> {
    const out = {} as Record<DayKey, number>;

    for (const k of DAY_KEYS) {
        const input = document.getElementById(k) as HTMLInputElement;
        const r = parseHhmmToMinutes(input.value);
        if (!r.ok) throw new Error(`${k}: ${r.error}`);
        out[k] = r.minutes;
    }
    return out;
}*/

/*function collectMinutesPayload(): Record<DayKey, number> {
  const out = {} as Record<DayKey, number>;

  for (const k of DAY_KEYS) {
    const normalEl = document.getElementById(`${k}_normal`) as HTMLInputElement;
    const nightEl  = document.getElementById(`${k}_night`) as HTMLInputElement;

    const a = parseHhmmToMinutes(normalEl?.value ?? "");
    if (!a.ok) throw new Error(`${k}_normal: ${a.error}`);

    const b = parseHhmmToMinutes(nightEl?.value ?? "");
    if (!b.ok) throw new Error(`${k}_night: ${b.error}`);

    const total = a.minutes + b.minutes;
    out[k] = total;

    // 画面の合算表示（任意）
    const totalEl = document.getElementById(`${k}_total`);
    if (totalEl) totalEl.textContent = minutesToHhmm(total); // 既存の変換関数があればそれ使う
  }

  return out;
}*/

/*function updateDailyTotalsAndReturnPayload(): Record<DayKey, number> {
  const out = {} as Record<DayKey, number>;

  for (const k of DAY_KEYS) {
    const normalEl = document.getElementById(`${k}_normal`) as HTMLInputElement;
    const nightEl  = document.getElementById(`${k}_night`) as HTMLInputElement;

    const a = parseHhmmToMinutes(normalEl?.value ?? "");
    if (!a.ok) throw new Error(`${k} 通常: ${a.error}`);

    const b = parseHhmmToMinutes(nightEl?.value ?? "");
    if (!b.ok) throw new Error(`${k} 深夜: ${b.error}`);

    const total = a.minutes + b.minutes;
    out[k] = total;

    const totalEl = document.getElementById(`${k}_total`);
    if (totalEl) totalEl.textContent = minutesToHhmm(total);
  }

  return out;
}*/


function attachButtons() {
  const previewBtn = $("btnPreview") as HTMLButtonElement;
  const submitBtn = $("btnSubmit") as HTMLButtonElement;
  const msgEl = $("message");

  previewBtn.addEventListener("click", () => {
    msgEl.textContent = "（プレビューは後で実装。今は合計が出てればOK）";
  });

    submitBtn.addEventListener("click", async () => {
        const msgEl = $("message");
        const submitstatus = $("submitStatus");
        msgEl.textContent = "";

        const token = getToken();
        if (!token) {
            showLoggedOut("ログインが必要です");
            return;
        }

        const weekStartEl = $("weekStart") as HTMLInputElement;

        let weekStart = weekStartEl.value;
        if (!weekStart) {
            weekStart = toISODate(getMonday(new Date()));
            weekStartEl.value = weekStart;
        }

        let data: Record<DayKey, number>;
        let breakdown: any;

        try {
          const v = validateAllInputs();
          if (!v.ok) throw new Error(v.error);
          data = v.totals;
          breakdown = v.breakdown;
        } catch (e) {
          msgEl.textContent = String(e);
          return;
        }

        try {
            const res = await fetch("/api/worktime", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`,},
                body: JSON.stringify({ 
                    week_start: weekStart,
                    data,
                    breakdown,
                }),
            });

            if (res.status === 409) {
                msgEl.textContent = "更新は一回までです（以降は管理者またはオーナーへ連絡）";
                return;
            }

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                msgEl.textContent = `送信失敗 (${res.status}) ${text ? `: ${text}` : ""}`;
                return;
            }

            const json = await res.json();
            submitstatus.textContent = json.status === "updated" ? "提出済(提出済)" : "提出済";
            msgEl.textContent = "送信しました";
        } catch (e) {
            msgEl.textContent = `送信失敗: ${String(e)}`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "送信";
        }
    });
}

// 月合計のやつ
type MonthTotalResult = { totalMinutes: number; foundWeeks: number };

function formatHHMM(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// その月に関係する「週の月曜（week_start）」一覧を作る
function listWeekStartsForMonth(anyDayInMonth: Date): string[] {
  const first = new Date(anyDayInMonth.getFullYear(), anyDayInMonth.getMonth(), 1);
  const month = first.getMonth();

  // 月初の“週の月曜”へ戻す
  const monday = new Date(first);
  const day = monday.getDay();
  const diffToMon = (day === 0 ? -6 : 1 - day);
  monday.setDate(monday.getDate() + diffToMon);

  const weekStarts: string[] = [];
  const cur = new Date(monday);

  // 最大6週あれば月はカバーできる（7にする必要なし）
  for (let i = 0; i < 6; i++) {
    const ws = toISODate(cur);
    weekStarts.push(ws);

    // この週が「その月に1日でも触れてるか」を判定
    const start = new Date(cur);
    const end = new Date(cur);
    end.setDate(end.getDate() + 6);

    const touches =
      start.getMonth() === month ||
      end.getMonth() === month ||
      (start.getMonth() < month && end.getMonth() > month); // 念のため

    cur.setDate(cur.getDate() + 7);
    if (!touches) break;
  }

  return Array.from(new Set(weekStarts));
}

function parseISODateLocal(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d); // ← ローカルの 00:00
}


async function calcMonthTotal(anyDayISO: string, token: string): Promise<MonthTotalResult> {
  const anyDay = parseISODateLocal(anyDayISO);
  const targetYear = anyDay.getFullYear();
  const targetMonth = anyDay.getMonth(); // 0-11

  const weekStarts = listWeekStartsForMonth(anyDay);

  let sum = 0;
  let found = 0;

  for (const ws of weekStarts) {
    const row = await fetchWorktimeWeek(ws, token); // ← 週データを取る
    if (!row) continue;

    // ws(月曜) を起点に、その週の各日を「日付として」判定して、該当月だけ足す
    const weekStartDate = new Date(ws);

    const keys: Array<keyof WorktimeRow["data"]> = ["mon","tue","wed","thu","fri","sat","sun"];

    let addedThisWeek = 0;

    keys.forEach((k, i) => {
      const d = new Date(weekStartDate);
      d.setDate(d.getDate() + i);

      if (d.getFullYear() === targetYear && d.getMonth() === targetMonth) {
        const v = Number(row.data?.[k] ?? 0);
        sum += v;
        addedThisWeek += v;
      }
    });

    // “その月に1分でも入った週”をカウントしたいならこれ
    if (addedThisWeek > 0) found += 1;
  }

  return { totalMinutes: sum, foundWeeks: found };
}



async function updateMonthTotalLabel() {
    const el = document.getElementById("monthTotalLabel");
    if (!el) return;

    const token = getToken?.() ?? null; //既存のgetToken()を使う想定
    const weekStartEl = document.getElementById("weekStart") as HTMLInputElement | null;
    
    if (!token || !weekStartEl) {
        el.textContent = "--:--";
        return;
    }

    const anyDateISO = weekStartEl.value || toISODate(new Date());
    try {
        el.textContent = "計算中...";
        const r = await calcMonthTotal(anyDateISO, token);
        el.textContent = formatHHMM(r.totalMinutes);

        renderMonthProgress(r.totalMinutes);
    } catch (e) {
        el.textContent = "--:--";
        console.error(e);
    }

}

//所定労働時間のバー
function renderMonthProgress(monthTotalMinutes: number) {
  const fill = document.getElementById("monthProgressFill") as HTMLDivElement | null;
  const cap = document.getElementById("monthProgressCaption") as HTMLSpanElement | null;
  const pctEl = document.getElementById("monthProgressPct") as HTMLSpanElement | null;
  if (!fill || !cap || !pctEl) return;

  const target = Number(localStorage.getItem(MONTHLY_TARGET_KEY) || "0");

  if (!target) {
    fill.style.width = "0%";
    cap.textContent = `${formatHHMM(monthTotalMinutes)} / --:--`;
    pctEl.textContent = "";
    return;
  }

  const pct = Math.min(100, Math.round((monthTotalMinutes / target) * 100));
  fill.style.width = `${pct}%`;
  cap.textContent = `${formatHHMM(monthTotalMinutes)} / ${formatHHMM(target)}`;
  pctEl.textContent = `進捗 ${pct}%${monthTotalMinutes > target ? "（超過）" : ""}`;
}

//週合計リアルタイム計算
/*function parseHHMMToMinutes(v: string): number {
  const s = (v ?? "").trim();
  if (!s) return 0;

  // "09:30" 形式のみ許可（必要ならここを緩めてもOK）
  const m = s.match(/^(\d{1,3}):([0-5]\d)$/);
  if (!m) return 0;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}*/

function recalcWeekTotalUI() {
  const totalEl = document.getElementById("weekTotal");
  if (!totalEl) return;

  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>(".timeInput")
  );

  let totalMinutes = 0;

  for (const el of inputs) {
    const r = parseHhmmToMinutes(el.value);
    if (r.ok) {
      totalMinutes += r.minutes;
    }
  }

  totalEl.textContent = formatHHMM(totalMinutes);
}


function attachRealtimeWeekTotal() {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(".timeInput"));
  for (const el of inputs) {
    el.addEventListener("input", recalcWeekTotalUI);
    el.addEventListener("change", recalcWeekTotalUI);
  }
  // 初期表示も一回
  recalcWeekTotalUI();
}

const inputId = (k: DayKey, kind: "normal"|"night") => `${k}_${kind}`;
const sumId   = (k: DayKey) => `${k}_sum`;

// 既存の parseHhmmToMinutes(raw) をそのまま使う前提
// 既存の minutesToHhmm(totalMinutes) をそのまま使う前提

function validateAllInputs(): { ok: true; totals: Record<DayKey, number>; breakdown: Record<DayKey,{normal:number; night:number}> }
                           | { ok: false; error: string } {

  const totals = {} as Record<DayKey, number>;
  const breakdown = {} as Record<DayKey,{normal:number; night:number}>;

  for (const k of DAY_KEYS) {
    const normalEl = $(inputId(k,"normal")) as HTMLInputElement | null;
    const nightEl  = $(inputId(k,"night")) as HTMLInputElement | null;
    if (!normalEl || !nightEl) return { ok:false, error:`DOMが見つかりません: ${k}` };

    const rn = parseHhmmToMinutes(normalEl.value);
    if (!rn.ok) return { ok:false, error:`${k}（通常）: ${rn.error}` };

    const rnight = parseHhmmToMinutes(nightEl.value);
    if (!rnight.ok) return { ok:false, error:`${k}（深夜）: ${rnight.error}` };

    breakdown[k] = { normal: rn.minutes, night: rnight.minutes };
    totals[k] = rn.minutes + rnight.minutes; // 日別合算（通常+深夜）
  }

  return { ok:true, totals, breakdown };
}

function recalcTotalsUI() {
  const msgEl = $("message");
  if (msgEl) msgEl.textContent = "";

  const weekTotalEl = $("weekTotal");
  if (!weekTotalEl) return;

  const v = validateAllInputs();
  if (!v.ok) {
    weekTotalEl.textContent = "00:00";
    if (msgEl) msgEl.textContent = v.error;
    return;
  }

  // 日別sum表示
  for (const k of DAY_KEYS) {
    const el = $(sumId(k));
    if (el) el.textContent = minutesToHhmm(v.totals[k]);
  }

  // 週合計
  const weekTotal = DAY_KEYS.reduce((acc,k)=> acc + v.totals[k], 0);
  weekTotalEl.textContent = minutesToHhmm(weekTotal);
}

function attachWorktimeHandlers() {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(".timeInput"));

  for (const el of inputs) {
    el.addEventListener("input", recalcTotalsUI);
    el.addEventListener("blur", () => {
      const r = parseHhmmToMinutes(el.value);
      if (r.ok) el.value = r.normalized;   // ここで 830 → 08:30 みたいに正規化
      recalcTotalsUI();
    });
  }

  recalcTotalsUI(); // 初回
}

// 送信 payload（互換性維持：dataは従来どおり「合算」 / breakdownは追加情報）
/*function collectWorktimePayloadOrThrow(): Record<DayKey, number> {
  const v = validateAllInputs();
  if (!v.ok) throw new Error(v.error);
  return v.totals; // ← ここだけ送る
}*/

function setAllZeroSplit() {
  for (const k of DAY_KEYS) {
    const normalEl = document.getElementById(`${k}_normal`) as HTMLInputElement | null;
    const nightEl  = document.getElementById(`${k}_night`) as HTMLInputElement | null;
    const sumEl    = document.getElementById(`${k}_sum`) as HTMLElement | null;

    if (normalEl) normalEl.value = "";
    if (nightEl) nightEl.value = "";
    if (sumEl) sumEl.textContent = "00:00";
  }
}

/*function setAllZero() {
  (["mon","tue","wed","thu","fri","sat","sun"] as const).forEach((k) => {
    const n = document.getElementById(`${k}_normal`) as HTMLInputElement | null;
    const g = document.getElementById(`${k}_night`) as HTMLInputElement | null;
    if (n) n.value = "";
    if (g) g.value = "";
    const sum = document.getElementById(`${k}_sum`);
    if (sum) sum.textContent = "00:00";
  });
}*/

/*function setInputsFromApiData(apiData: any) {
  // apiData: { mon..sun:number, breakdown?: { mon:{normal,night}... } }
  const bd = apiData?.breakdown;

  (["mon","tue","wed","thu","fri","sat","sun"] as const).forEach((k) => {
    const normalEl = document.getElementById(`${k}_normal`) as HTMLInputElement | null;
    const nightEl  = document.getElementById(`${k}_night`)  as HTMLInputElement | null;

    const normalMin = Number(bd?.[k]?.normal ?? apiData?.[k] ?? 0);
    const nightMin  = Number(bd?.[k]?.night  ?? 0);

    if (normalEl) normalEl.value = normalMin > 0 ? formatHHMM(normalMin) : "";
    if (nightEl)  nightEl.value  = nightMin  > 0 ? formatHHMM(nightMin)  : "";
  });
}*/



function boot() {
  // まずログイン処理（共通資産）
  attachLoginHandlers();

  // 週開始日（月曜固定）
  normalizeWeekStartInput();

  // 入力合計
  attachWorktimeHandlers();

  // ボタン（仮）
  attachButtons();

  // 既にログイン済みなら入力画面へ
  if (getToken()) {
    showLoggedIn();
    updateDayLabels();
    updateMonthTotalLabel();
  } else {
    showLoggedOut();
  }
}

boot();
