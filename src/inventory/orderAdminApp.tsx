import { useEffect, useMemo, useState } from "react";

type BudgetType = "base" | "onion" | "mushroom";
type ItemCategory = "main" | "side" | "fresh_veg" | "mushroom";
type Item = { item_code: string; name: string; category: string; priority: number; display_order: number; per_100k: number | string; budget_type: BudgetType; is_new?: boolean };
type Budget = { order_date: string; base_budget: number | string; onion_budget: number | string; mushroom_budget: number | string };

const STORE_ID = new URLSearchParams(location.search).get("store_id") || "7539";
const TOKEN_KEY = `order_admin_token_${STORE_ID}`;
const DEFAULT_ORDER_DAYS: Record<string, number[]> = { "7249": [2, 5], "7539": [1, 4] };
const STORE_NAMES: Record<string, string> = { "7249": "寺島", "7539": "浜北小松" };
const budgetLabels: Record<BudgetType, string> = { base: "食材", onion: "オニ＆ピーマン", mushroom: "マッシュ" };
const categoryLabels: Record<ItemCategory, string> = { main: "ピザ食材", side: "サイド", fresh_veg: "オニオン・ピーマン", mushroom: "マッシュルーム" };
const categoryOrder = Object.keys(categoryLabels) as ItemCategory[];
const emptyNewItem = { name: "", category: "main" as ItemCategory, per_100k: "" };
const categoryPrefixes: Record<ItemCategory, string> = { main: "MAIN", side: "SIDE", fresh_veg: "VEG", mushroom: "MUSHROOM" };

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
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState(emptyNewItem);
  const [orderDays, setOrderDays] = useState(DEFAULT_ORDER_DAYS[STORE_ID] ?? [1, 4]);
  const [savedOrderDays, setSavedOrderDays] = useState(DEFAULT_ORDER_DAYS[STORE_ID] ?? [1, 4]);
  const [extraOrderDates, setExtraOrderDates] = useState<string[]>([]);
  const [savedExtraOrderDates, setSavedExtraOrderDates] = useState<string[]>([]);
  const [activeBudgetDate, setActiveBudgetDate] = useState<string | null>(null);

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

  async function loadSettings() {
    try { const data = await request(`/settings?store_id=${STORE_ID}`); setOrderDays(data.order_days); setSavedOrderDays(data.order_days); setExtraOrderDates(data.extra_order_dates ?? []); setSavedExtraOrderDates(data.extra_order_dates ?? []); }
    catch (error) { setMessage((error as Error).message); }
  }

  useEffect(() => { if (authenticated) loadBudgets(); }, [authenticated, month]);
  useEffect(() => { if (authenticated) loadSettings(); }, [authenticated]);
  useEffect(() => { if (authenticated && tab === "items" && items.length === 0) loadItems(); }, [authenticated, tab]);

  const calendarDays = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    const first = new Date(year, monthNumber - 1, 1);
    const start = new Date(year, monthNumber - 1, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  }, [month]);
  const groupedItems = useMemo(() => categoryOrder.map((category) => ({
    category,
    items: items.map((item, index) => ({ item, index })).filter(({ item }) => item.category === category),
  })), [items]);

  function changeMonth(offset: number) { const [y, m] = month.split("-").map(Number); setMonth(monthKey(new Date(y, m - 1 + offset, 1))); }
  function updateBudget(date: string, key: keyof Budget, value: string) {
    if (value && !/^\d*\.?\d*$/.test(value)) return;
    setBudgets((current) => ({ ...current, [date]: { ...(current[date] ?? { order_date: date, base_budget: "", onion_budget: "", mushroom_budget: "" }), [key]: value } }));
    setTouchedDates((current) => new Set(current).add(date));
  }

  function toggleOrderDay(day: number) {
    setOrderDays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b));
  }
  function toggleExtraOrderDate(date: string) {
    setExtraOrderDates((current) => current.includes(date) ? current.filter((value) => value !== date) : [...current, date].sort());
  }
  async function saveOrderDays() {
    if (!orderDays.length) return setMessage("発注曜日を1つ以上選択してください");
    setLoading(true);
    try { const data = await request("/admin/settings", { method: "PUT", body: JSON.stringify({ order_days: orderDays, extra_order_dates: extraOrderDates }) }); setOrderDays(data.order_days); setSavedOrderDays(data.order_days); setExtraOrderDates(data.extra_order_dates); setSavedExtraOrderDates(data.extra_order_dates); setMessage("発注日の設定を保存しました"); }
    catch (error) { setMessage((error as Error).message); }
    finally { setLoading(false); }
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
  function addItem(event: React.FormEvent) {
    event.preventDefault();
    const itemCode = nextItemCode(newItem.category);
    const name = newItem.name.trim();
    const per100k = Number(newItem.per_100k);
    if (!name || newItem.per_100k === "" || !Number.isFinite(per100k) || per100k < 0) return setMessage("食材名とイールド数を入力してください");
    const budgetType: BudgetType = newItem.category === "fresh_veg" ? "onion" : newItem.category === "mushroom" ? "mushroom" : "base";
    const created: Item = { item_code: itemCode, name, category: newItem.category, priority: 1, display_order: items.length + 1, per_100k: newItem.per_100k, budget_type: budgetType, is_new: true };
    const lastCategoryIndex = items.reduce((last, item, index) => item.category === newItem.category ? index : last, -1);
    setItems((current) => { const next = [...current]; next.splice(lastCategoryIndex + 1, 0, created); return next; });
    setNewItem(emptyNewItem); setShowAddItem(false); setMessage("新しい食材を追加しました。「変更を保存」でDBに登録されます");
  }
  function nextItemCode(category: ItemCategory) {
    const prefix = categoryPrefixes[category];
    const max = items.reduce((current, item) => {
      const match = item.item_code.match(new RegExp(`^${prefix}_(\\d+)$`, "i"));
      return match ? Math.max(current, Number(match[1])) : current;
    }, 0);
    return `${prefix}_${String(max + 1).padStart(3, "0")}`;
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
      <div className="orderSectionHeader"><div><span className="orderEyebrow">MONTHLY BUDGET</span><h2>予算カレンダー</h2><p>設定した発注日に3種類の予算を入力します。</p></div><div className="monthControls"><button onClick={() => changeMonth(-1)}>‹</button><strong>{month.replace("-", "年")}月</strong><button onClick={() => changeMonth(1)}>›</button></div></div>
      <div className="orderDaySettings"><div><strong>発注日の設定</strong><p>繰り返す曜日を選び、カレンダーから一日限定の日付も追加できます。</p></div><div className="weekdayPicker">{["日","月","火","水","木","金","土"].map((label, day) => <button type="button" key={label} className={orderDays.includes(day) ? "selected" : ""} onClick={() => toggleOrderDay(day)}>{label}</button>)}</div><button className="orderButton primary" disabled={loading || !orderDays.length || (JSON.stringify(orderDays) === JSON.stringify(savedOrderDays) && JSON.stringify(extraOrderDates) === JSON.stringify(savedExtraOrderDates))} onClick={saveOrderDays}>設定を保存</button></div>
      <div className="budgetLegend"><span className="base">食材</span><span className="onion">オニ＆ピーマン</span><span className="mushroom">マッシュ</span></div>
      <div className="budgetCalendar"><div className="calendarWeekdays">{["日","月","火","水","木","金","土"].map((d) => <span key={d}>{d}</span>)}</div><div className="calendarGrid">{calendarDays.map((day) => {
        const key = dateKey(day); const currentMonth = key.startsWith(month); const recurringDay = orderDays.includes(day.getDay()); const extraDay = extraOrderDates.includes(key); const orderDay = recurringDay || extraDay; const row = budgets[key];
        return <article key={key} className={`budgetDay ${!currentMonth ? "outside" : ""} ${orderDay && currentMonth ? "orderDay" : ""} ${extraDay ? "extraDay" : ""}`}><div className="budgetDayNumber"><strong>{day.getDate()}</strong><div>{extraDay && <span>限定</span>}{row && <span>保存済</span>}</div></div>{currentMonth && orderDay ? <><button type="button" className="budgetDayOpen" onClick={() => setActiveBudgetDate(key)} aria-label={`${day.getMonth() + 1}月${day.getDate()}日の予算を入力`}><span className="budgetDot base" /> <span className="budgetDot onion" /> <span className="budgetDot mushroom" /><small>{row ? "入力・確認" : "予算を入力"}</small></button><div className="budgetInputs budgetInputsInline">
          {(["base_budget","onion_budget","mushroom_budget"] as const).map((field) => <label key={field} className={field.split("_")[0]}><span>{field === "base_budget" ? "食材" : field === "onion_budget" ? "オニ・ピーマン" : "マッシュ"}</span><input inputMode="decimal" value={row?.[field] ?? ""} placeholder="0" onChange={(e) => updateBudget(key, field, e.target.value)} /></label>)}
        </div>{extraDay && !recurringDay && <button type="button" className="extraDateButton remove" onClick={() => toggleExtraOrderDate(key)}>一日限定を解除</button>}</> : currentMonth ? <button type="button" className="extraDateButton" onClick={() => toggleExtraOrderDate(key)}>＋ この日だけ追加</button> : null}</article>;
      })}</div></div>
      {activeBudgetDate && (() => { const active = budgets[activeBudgetDate]; const [year, monthNumber, dateNumber] = activeBudgetDate.split("-").map(Number); return <div className="budgetEditorBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveBudgetDate(null); }}><section className="budgetEditorSheet" role="dialog" aria-modal="true" aria-labelledby="budget-editor-title"><header><div><span className="orderEyebrow">DAILY BUDGET</span><h3 id="budget-editor-title">{monthNumber}月{dateNumber}日の予算</h3><small>{year}年</small></div><button type="button" className="sheetClose" onClick={() => setActiveBudgetDate(null)} aria-label="閉じる">×</button></header><div className="budgetInputs budgetInputsSheet">
        {(["base_budget","onion_budget","mushroom_budget"] as const).map((field) => <label key={field} className={field.split("_")[0]}><span>{field === "base_budget" ? "食材" : field === "onion_budget" ? "オニオン・ピーマン" : "マッシュ"}</span><input autoFocus={field === "base_budget"} inputMode="decimal" value={active?.[field] ?? ""} placeholder="0" onChange={(e) => updateBudget(activeBudgetDate, field, e.target.value)} /></label>)}
      </div><button type="button" className="orderButton primary sheetDone" onClick={() => setActiveBudgetDate(null)}>入力を完了</button></section></div>; })()}
      <div className="stickySave"><button className="orderButton primary" disabled={loading || !touchedDates.size} onClick={saveBudgets}>{loading ? "保存中…" : `${touchedDates.size || 0}日分を保存`}</button></div>
    </section> : <section className="orderPanel">
      <div className="orderSectionHeader"><div><span className="orderEyebrow">ITEM MASTER</span><h2>食材・イールド</h2><p>4区分ごとに編集し、同じ区分内で表示順を変更できます。</p></div><div className="itemHeaderActions"><button className="orderButton ghost" onClick={() => setShowAddItem((current) => !current)}>{showAddItem ? "閉じる" : "＋ 新しいアイテム"}</button><button className="orderButton primary" disabled={loading} onClick={saveItems}>{loading ? "保存中…" : "変更を保存"}</button></div></div>
      {showAddItem && <form className="newItemForm" onSubmit={addItem}><div className="newItemTitle"><div><strong>新しいアイテム</strong><p>商品コードは区分から自動発行されます。追加後に「変更を保存」を押すとDBへ登録されます。</p></div><span className="generatedCode">{nextItemCode(newItem.category)}</span></div><div className="newItemFields"><label className="orderField">食材名<input autoFocus value={newItem.name} placeholder="例：モッツァレラチーズ" onChange={(e) => setNewItem((current) => ({ ...current, name: e.target.value }))} /></label><label className="orderField">区分<select value={newItem.category} onChange={(e) => setNewItem((current) => ({ ...current, category: e.target.value as ItemCategory }))}>{categoryOrder.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}</select></label><label className="orderField">イールド数<input inputMode="decimal" value={newItem.per_100k} placeholder="0" onChange={(e) => { const value = e.target.value; if (!value || /^\d*\.?\d*$/.test(value)) setNewItem((current) => ({ ...current, per_100k: value })); }} /></label></div><div className="newItemActions"><button type="button" className="orderButton ghost" onClick={() => { setNewItem(emptyNewItem); setShowAddItem(false); }}>キャンセル</button><button className="orderButton primary" type="submit">一覧に追加</button></div></form>}
      <div className="itemCategoryList">{groupedItems.map(({ category, items: sectionItems }) => <section className={`itemCategorySection category-${category}`} key={category}><header><div><span>{categoryLabels[category]}</span><small>{sectionItems.length}件</small></div><p>{category === "main" || category === "side" ? "食材予算" : budgetLabels[category === "fresh_veg" ? "onion" : "mushroom"]}</p></header><div className="itemEditorList">{sectionItems.map(({ item, index }, sectionIndex) => <article key={item.item_code} draggable onDragStart={() => setDragIndex(index)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragIndex !== null && items[dragIndex]?.category === category) moveItem(dragIndex, index); setDragIndex(null); }} className="itemEditorCard">
        <div className="dragHandle" aria-label="並び替え">⠿</div><div className="itemEditorMain"><span className={`budgetBadge ${item.budget_type}`}>{budgetLabels[item.budget_type]}</span><small>{item.item_code}</small><input aria-label="食材名" value={item.name} onChange={(e) => updateItem(index, { name: e.target.value })} /><select aria-label="区分" value={item.category} onChange={(e) => { const category = e.target.value as ItemCategory; updateItem(index, { category, budget_type: category === "fresh_veg" ? "onion" : category === "mushroom" ? "mushroom" : "base" }); }}>{categoryOrder.map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}</select></div>
        <label className="yieldField"><span>イールド数</span><input inputMode="decimal" value={item.per_100k} onChange={(e) => { const value = e.target.value; if (!value || /^\d*\.?\d*$/.test(value)) updateItem(index, { per_100k: value }); }} /></label>
        <div className="moveButtons"><button onClick={() => moveItem(index, sectionItems[sectionIndex - 1]?.index ?? -1)} disabled={sectionIndex === 0}>↑</button><button onClick={() => moveItem(index, sectionItems[sectionIndex + 1]?.index ?? items.length)} disabled={sectionIndex === sectionItems.length - 1}>↓</button></div>
      </article>)}</div></section>)}</div>
    </section>}
  </main>;
}
