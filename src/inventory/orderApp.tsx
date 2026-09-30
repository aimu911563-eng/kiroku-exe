import { useEffect, useMemo, useState } from "react";

type OrderRow = {
  store_id: string; order_date: string; display_order: number; item_code: string; name: string; category: string;
  priority: number; per_100k: number; budget_type: "base" | "onion" | "mushroom"; target_budget: number | null;
  required_qty: number; fridge_qty: number; freezer_qty: number; stock_qty: number; order_qty: number;
};

const params = new URLSearchParams(window.location.search);
const STORE_ID = params.get("store_id") || "7249";
const STORE_NAMES: Record<string, string> = { "7249": "寺島", "7539": "浜北小松" };
const STORE_CONFIG: Record<string, { orderDays: number[] }> = { "7249": { orderDays: [2, 5] }, "7539": { orderDays: [1, 4] } };
const defaultOrderDays = (STORE_CONFIG[STORE_ID] ?? STORE_CONFIG["7249"]).orderDays;

function localDateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function nextOrderDate(orderDays: number[], extraOrderDates: string[] = []) {
  const date = new Date();
  for (let i = 0; i < 370; i += 1) { if (orderDays.includes(date.getDay()) || extraOrderDates.includes(localDateKey(date))) return localDateKey(date); date.setDate(date.getDate() + 1); }
  return localDateKey(new Date());
}

export default function OrderInputPage() {
  const [orderDays, setOrderDays] = useState(defaultOrderDays);
  const [extraOrderDates, setExtraOrderDates] = useState<string[]>([]);
  const [date, setDate] = useState(() => nextOrderDate(defaultOrderDays));
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [fridgeDrafts, setFridgeDrafts] = useState<Record<string, string>>({});
  const [freezerDrafts, setFreezerDrafts] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  async function loadDate(targetDate = date) {
    setLoading(true); setMessage("");
    try {
      const response = await fetch(`/api/order/calc?store_id=${encodeURIComponent(STORE_ID)}&date=${encodeURIComponent(targetDate)}`);
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error(json?.error || "読み込みに失敗しました");
      const data: OrderRow[] = Array.isArray(json.data) ? json.data : [];
      setRows(data);
      setFridgeDrafts(Object.fromEntries(data.map((row) => [row.item_code, Number(row.fridge_qty) ? String(row.fridge_qty) : ""])));
      setFreezerDrafts(Object.fromEntries(data.map((row) => [row.item_code, Number(row.freezer_qty) ? String(row.freezer_qty) : ""])));
      if (!data.length) setMessage(orderDays.includes(new Date(`${targetDate}T12:00:00`).getDay()) || extraOrderDates.includes(targetDate) ? "この発注日の予算がまだ登録されていません。管理画面で予算を入力してください。" : "この日は発注日ではありません。案内されている曜日を選択してください。");
    } catch (error) { setRows([]); setMessage(error instanceof Error ? error.message : "読み込みに失敗しました"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    fetch(`/api/order/settings?store_id=${encodeURIComponent(STORE_ID)}`).then((response) => response.json()).then((data) => {
      if (!data?.ok || !Array.isArray(data.order_days) || !data.order_days.length) return;
      setOrderDays(data.order_days);
      const extraDates = Array.isArray(data.extra_order_dates) ? data.extra_order_dates : [];
      setExtraOrderDates(extraDates);
      setDate((current) => data.order_days.includes(new Date(`${current}T12:00:00`).getDay()) || extraDates.includes(current) ? current : nextOrderDate(data.order_days, extraDates));
    }).catch(() => undefined);
  }, []);
  useEffect(() => { loadDate(date); }, [date, orderDays, extraOrderDates]);

  async function saveAll() {
    setLoading(true);
    try {
      const response = await fetch("/api/inventory/bulk-input", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        store_id: STORE_ID, date, items: rows.map((row) => ({ item_code: row.item_code, fridge_qty: Number(fridgeDrafts[row.item_code] || 0), freezer_qty: Number(freezerDrafts[row.item_code] || 0) })),
      }) });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error(json?.error || "保存に失敗しました");
      setToast("在庫数を保存しました"); setTimeout(() => setToast(null), 2800); await loadDate(date);
    } catch (error) { setToast(error instanceof Error ? error.message : "保存に失敗しました"); setLoading(false); }
  }

  const grouped = useMemo(() => [
    ["ピザ食材", rows.filter((row) => row.category === "main")],
    ["サイド", rows.filter((row) => row.category === "side")],
    ["オニオン・ピーマン", rows.filter((row) => row.category === "fresh_veg")],
    ["マッシュルーム", rows.filter((row) => row.category === "mushroom")],
  ] as const, [rows]);
  const updateDraft = (setter: React.Dispatch<React.SetStateAction<Record<string, string>>>, code: string, value: string) => { if (!value || /^\d*\.?\d*$/.test(value)) setter((current) => ({ ...current, [code]: value })); };

  return <main className="orderShell">
    <header className="orderHero"><div><span className="orderEyebrow">SMART ORDER</span><h1>発注自動計算</h1><p>{STORE_NAMES[STORE_ID] ?? STORE_ID}（{STORE_ID}）</p></div><a className="orderButton ghost" href={`/order-admin?store_id=${STORE_ID}`}>管理画面</a></header>
    <section className="orderPanel">
      <p className="orderHint">発注日は<strong>{orderDays.map((day) => `${["日","月","火","水","木","金","土"][day]}曜日`).join("・")}</strong>{extraOrderDates.includes(date) && <span>（この日は一日限定）</span>}です。冷凍庫と冷蔵庫（W/I）の数量を入力すると、発注数を自動計算します。</p>
      <div className="orderToolbar"><label className="orderField">発注日<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><button className="orderButton ghost" onClick={() => loadDate(date)} disabled={loading}>{loading ? "読込中…" : "再読み込み"}</button><button className="orderButton primary" onClick={saveAll} disabled={loading || !rows.length}>在庫を保存</button></div>
      {message && <div className={`orderAlert ${rows.length ? "" : "error"}`}>{message}</div>}
      {!loading && !rows.length && <div className="orderEmpty">対象データがありません</div>}
      {grouped.map(([title, sectionRows]) => <OrderSection key={title} title={title} rows={sectionRows} fridgeDrafts={fridgeDrafts} freezerDrafts={freezerDrafts} onFridge={(code, value) => updateDraft(setFridgeDrafts, code, value)} onFreezer={(code, value) => updateDraft(setFreezerDrafts, code, value)} />)}
    </section>
    {toast && <div className="orderToast" role="status">{toast}</div>}
  </main>;
}

function OrderSection({ title, rows, fridgeDrafts, freezerDrafts, onFridge, onFreezer }: { title: string; rows: OrderRow[]; fridgeDrafts: Record<string,string>; freezerDrafts: Record<string,string>; onFridge: (code:string,value:string)=>void; onFreezer: (code:string,value:string)=>void }) {
  if (!rows.length) return null;
  return <section className="orderSection"><h2>{title}</h2><div className="orderTableWrap"><table className="orderTable"><thead><tr><th style={{width:"32%"}}>食材名</th><th>必要数</th><th>冷凍</th><th>冷蔵</th><th>在庫計</th><th>発注数</th></tr></thead><tbody>{rows.map((row) => {
    const fridge = Number(fridgeDrafts[row.item_code] || 0); const freezer = Number(freezerDrafts[row.item_code] || 0); const total = fridge + freezer; const orderQty = Math.ceil(Math.max(Number(row.required_qty || 0) - total, 0));
    return <tr key={row.item_code}><td className="itemName">{row.name}</td><td>{row.required_qty}</td><td><input inputMode="decimal" value={freezerDrafts[row.item_code] ?? ""} placeholder="0" onChange={(e) => onFreezer(row.item_code,e.target.value)} /></td><td><input inputMode="decimal" value={fridgeDrafts[row.item_code] ?? ""} placeholder="0" onChange={(e) => onFridge(row.item_code,e.target.value)} /></td><td>{total}</td><td className={`orderQty ${orderQty === 0 ? "zero" : ""}`}>{orderQty}</td></tr>;
  })}</tbody></table></div></section>;
}
