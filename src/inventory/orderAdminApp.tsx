import { useEffect, useMemo, useState } from "react";

type BudgetType = "base" | "onion" | "mushroom";
type Item = { item_code: string; name: string; category: string; priority: number; display_order: number; per_100k: number | string; budget_type: BudgetType };
type Budget = { order_date: string; base_budget: number | string; onion_budget: number | string; mushroom_budget: number | string };

const STORE_ID = new URLSearchParams(location.search).get("store_id") || "7539";
const TOKEN_KEY = `order_admin_token_${STORE_ID}`;
const ORDER_DAYS: Record<string, number[]> = { "7249": [2, 5], "7539": [1, 4] };
const STORE_NAMES: Record<string, string> = { "7249": "寺島", "7539": "浜北小松" };
const budgetLabels: Record<BudgetType, string> = { base: "食材", onion: "オニ＆ピーマン", mushroom: "マッシュ" };

function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

async function request(path: string, init: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`/api/order${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

export default function OrderAdminApp() {
  const [authenticated, setAuthenticated] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<"budgets" | "items">("budgets");
  const [month, setMonth] = useState(monthKey());
  const [budgets, setBudgets] = useState<Record<string, Budget>>({});
  const [touchedDates, setTouchedDates] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setLoginError("");
    try {
      const data = await request("/admin/login", { method: "POST", body: JSON.stringify({ store_id: STORE_ID, password }) });
      localStorage.setItem(TOKEN_KEY, data.token); setAuthenticated(true); setPassword("");
    } catch (error) { setLoginError(error instanceof Error ? error.message : "ログインできませんでした"); }
  }

  async function loadBudgets() {
    setLoading(true); setMessage("");
    try {
      const data = await request(`/admin/budgets?month=${month}`);
      const next: Record<string, Budget> = {};
      for (const row of data.budgets ?? []) next[row.order_date] = row;
      setBudgets(next); setTouchedDates(new Set());
    } catch (error) {
      if ((error as Error).message === "Unauthorized") { localStorage.removeItem(TOKEN_KEY); setAuthenticated(false); }
      else setMessage((error as Error).message);
    } finally { setLoading(false); }
  }

  async function loadItems() {
    setLoading(true); setMessage("");
    try { const data = await request("/admin/items"); setItems(data.items ?? []); }
    catch (error) { setMessage((error as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (authenticated) loadBudgets(); }, [authenticated, month]);
  useEffect(() => { if (authenticated && tab === "items" && items.length === 0) loadItems(); }, [authenticated, tab]);

  const calendarDays = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    const first = new Date(year, monthNumber - 1, 1);
    const start = new Date(year, monthNumber - 1, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  }, [month]);

  function changeMonth(offset: number) { const [y, m] = month.split("-").map(Number); setMonth(monthKey(new Date(y, m - 1 + offset, 1))); }
  function updateBudget(date: string, key: keyof Budget, value: string) {
    if (value && !/^\d*\.?\d*$/.test(value)) return;
    setBudgets((current) => ({ ...current, [date]: { ...(current[date] ?? { order_date: date, base_budget: "", onion_budget: "", mushroom_budget: "" }), [key]: value } }));
    setTouchedDates((current) => new Set(current).add(date));
  }

  async function saveBudgets() {
    if (!touchedDates.size) return setMessage("変更された予算はありません");
    const rows = [...touchedDates].map((date) => ({
      order_date: date,
      base_budget: Number(budgets[date]?.base_budget || 0),
      onion_budget: Number(budgets[date]?.onion_budget || 0),
      mushroom_budget: Number(budgets[date]?.mushroom_budget || 0),
    }));
    setLoading(true);
    try { await request("/admin/budgets", { method: "PUT", body: JSON.stringify({ budgets: rows }) }); setMessage(`${rows.length}日分の予算を保存しました`); await loadBudgets(); }
    catch (error) { setMessage((error as Error).message); setLoading(false); }
  }

  function updateItem(index: number, patch: Partial<Item>) { setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item)); }
  function moveItem(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    setItems((current) => { const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; });
  }
  async function saveItems() {
    setLoading(true);
    try { await request("/admin/items", { method: "PUT", body: JSON.stringify({ items }) }); setMessage(`${items.length}件の食材設定を保存しました`); await loadItems(); }
    catch (error) { setMessage((error as Error).message); setLoading(false); }
  }

  if (!authenticated) return <main className="orderAdminShell orderLoginShell"><form className="orderPanel orderLoginCard" onSubmit={login}>
    <span className="orderEyebrow">ORDER ADMIN</span><h1>発注管理</h1><p>{STORE_NAMES[STORE_ID] ?? STORE_ID}の予算と食材設定を管理します。</p>
    <label className="orderField">管理パスワード<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
    {loginError && <div className="orderAlert error">{loginError}</div>}<button className="orderButton primary" type="submit">ログイン</button>
  </form></main>;

  return <main className="orderAdminShell">
    <header className="orderHero"><div><span className="orderEyebrow">ORDER ADMIN</span><h1>発注管理</h1><p>{STORE_NAMES[STORE_ID] ?? STORE_ID}・予算と食材マスター</p></div><button className="orderButton ghost" onClick={() => { localStorage.removeItem(TOKEN_KEY); setAuthenticated(false); }}>ログアウト</button></header>
    <nav className="orderTabs"><button className={tab === "budgets" ? "active" : ""} onClick={() => setTab("budgets")}>予算カレンダー</button><button className={tab === "items" ? "active" : ""} onClick={() => setTab("items")}>食材・イールド</button></nav>
    {message && <div className="orderAlert">{message}</div>}
    {tab === "budgets" ? <section className="orderPanel">
      <div className="orderSectionHeader"><div><span className="orderEyebrow">MONTHLY BUDGET</span><h2>予算カレンダー</h2><p>月・木の発注日に3種類の予算を入力します。</p></div><div className="monthControls"><button onClick={() => changeMonth(-1)}>‹</button><strong>{month.replace("-", "年")}月</strong><button onClick={() => changeMonth(1)}>›</button></div></div>
      <div className="budgetLegend"><span className="base">食材</span><span className="onion">オニ＆ピーマン</span><span className="mushroom">マッシュ</span></div>
      <div className="budgetCalendar"><div className="calendarWeekdays">{["日","月","火","水","木","金","土"].map((d) => <span key={d}>{d}</span>)}</div><div className="calendarGrid">{calendarDays.map((day) => {
        const key = dateKey(day); const currentMonth = key.startsWith(month); const orderDay = (ORDER_DAYS[STORE_ID] ?? []).includes(day.getDay()); const row = budgets[key];
        return <article key={key} className={`budgetDay ${!currentMonth ? "outside" : ""} ${orderDay && currentMonth ? "orderDay" : ""}`}><div className="budgetDayNumber"><strong>{day.getDate()}</strong>{row && <span>保存済</span>}</div>{currentMonth && orderDay ? <div className="budgetInputs">
          {(["base_budget","onion_budget","mushroom_budget"] as const).map((field) => <label key={field} className={field.split("_")[0]}><span>{field === "base_budget" ? "食材" : field === "onion_budget" ? "オニ・ピーマン" : "マッシュ"}</span><input inputMode="decimal" value={row?.[field] ?? ""} placeholder="0" onChange={(e) => updateBudget(key, field, e.target.value)} /></label>)}
        </div> : null}</article>;
      })}</div></div>
      <div className="stickySave"><button className="orderButton primary" disabled={loading || !touchedDates.size} onClick={saveBudgets}>{loading ? "保存中…" : `${touchedDates.size || 0}日分を保存`}</button></div>
    </section> : <section className="orderPanel">
      <div className="orderSectionHeader"><div><span className="orderEyebrow">ITEM MASTER</span><h2>食材・イールド</h2><p>ドラッグまたは矢印で、発注画面の表示順を変更できます。</p></div><button className="orderButton primary" disabled={loading} onClick={saveItems}>{loading ? "保存中…" : "変更を保存"}</button></div>
      <div className="itemEditorList">{items.map((item, index) => <article key={item.item_code} draggable onDragStart={() => setDragIndex(index)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragIndex !== null) moveItem(dragIndex, index); setDragIndex(null); }} className="itemEditorCard">
        <div className="dragHandle" aria-label="並び替え">⠿</div><div className="itemEditorMain"><span className={`budgetBadge ${item.budget_type}`}>{budgetLabels[item.budget_type]}</span><small>{item.item_code}</small><input aria-label="食材名" value={item.name} onChange={(e) => updateItem(index, { name: e.target.value })} /></div>
        <label className="yieldField"><span>イールド数</span><input inputMode="decimal" value={item.per_100k} onChange={(e) => { const value = e.target.value; if (!value || /^\d*\.?\d*$/.test(value)) updateItem(index, { per_100k: value }); }} /></label>
        <div className="moveButtons"><button onClick={() => moveItem(index, index - 1)} disabled={index === 0}>↑</button><button onClick={() => moveItem(index, index + 1)} disabled={index === items.length - 1}>↓</button></div>
      </article>)}</div>
    </section>}
  </main>;
}
