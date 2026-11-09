import { useEffect, useMemo, useState } from "react";
import { orderApiFetch } from "./order-api-fetch";

type OrderRow = {
  store_id: string; order_date: string; display_order: number; item_code: string; name: string; category: string;
  priority: number; per_100k: number; budget_type: "base" | "onion" | "mushroom"; target_budget: number | null;
  required_qty: number; fridge_qty: number; freezer_qty: number; stock_qty: number; order_qty: number;
  has_input?: boolean;
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
  const [inputToken, setInputToken] = useState("");
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  useEffect(() => {
    document.body.classList.add("orderInputPage");
    return () => document.body.classList.remove("orderInputPage");
  }, []);

  async function loadDate(targetDate = date) {
    setLoading(true); setMessage("");
    try {
      const response = await orderApiFetch(`/api/order/calc?store_id=${encodeURIComponent(STORE_ID)}&date=${encodeURIComponent(targetDate)}`);
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error(json?.error || "読み込みに失敗しました");
      const data: OrderRow[] = Array.isArray(json.data) ? json.data : [];
      setInputToken(String(json.input_token ?? ""));
      setRows(data);
      setFridgeDrafts(Object.fromEntries(data.map((row) => [row.item_code, row.has_input ? String(Number(row.fridge_qty || 0)) : Number(row.fridge_qty) ? String(row.fridge_qty) : ""])));
      setFreezerDrafts(Object.fromEntries(data.map((row) => [row.item_code, row.has_input ? String(Number(row.freezer_qty || 0)) : Number(row.freezer_qty) ? String(row.freezer_qty) : ""])));
      if (!data.length) setMessage(orderDays.includes(new Date(`${targetDate}T12:00:00`).getDay()) || extraOrderDates.includes(targetDate) ? "この発注日の予算がまだ登録されていません。管理画面で予算を入力してください。" : "この日は発注日ではありません。案内されている曜日を選択してください。");
    } catch (error) { setRows([]); setMessage(error instanceof Error ? error.message : "読み込みに失敗しました"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    orderApiFetch(`/api/order/settings?store_id=${encodeURIComponent(STORE_ID)}`).then((response) => response.json()).then((data) => {
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
      const response = await orderApiFetch("/api/order/input", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${inputToken}` }, body: JSON.stringify({
        store_id: STORE_ID, date, items: rows.map((row) => ({ item_code: row.item_code, fridge_qty: Number(fridgeDrafts[row.item_code] || 0), freezer_qty: Number(freezerDrafts[row.item_code] || 0) })),
      }) });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error(json?.error || "保存に失敗しました");
      setShowSaveConfirm(false); setToast("在庫数を保存しました"); setTimeout(() => setToast(null), 2800); await loadDate(date);
    } catch (error) { setToast(error instanceof Error ? error.message : "保存に失敗しました"); setLoading(false); }
  }

  const grouped = useMemo(() => [
    ["ピザ食材", rows.filter((row) => row.category === "main")],
    ["サイド", rows.filter((row) => row.category === "side")],
    ["オニオン・ピーマン", rows.filter((row) => row.category === "fresh_veg")],
    ["マッシュルーム", rows.filter((row) => row.category === "mushroom")],
  ] as const, [rows]);
  const inputSummary = useMemo(() => {
    const entered = rows.filter((row) => (fridgeDrafts[row.item_code] ?? "") !== "" || (freezerDrafts[row.item_code] ?? "") !== "");
    const orderRequired = rows.filter((row) => {
      const stock = Number(fridgeDrafts[row.item_code] || 0) + Number(freezerDrafts[row.item_code] || 0);
      return Math.ceil(Math.max(Number(row.required_qty || 0) - stock, 0)) > 0;
    });
    return { entered: entered.length, missing: rows.length - entered.length, orderRequired: orderRequired.length, percent: rows.length ? Math.round((entered.length / rows.length) * 100) : 0 };
  }, [rows, fridgeDrafts, freezerDrafts]);
  const updateDraft = (setter: React.Dispatch<React.SetStateAction<Record<string, string>>>, code: string, value: string) => { if (!value || /^\d*\.?\d*$/.test(value)) setter((current) => ({ ...current, [code]: value })); };

  return <main className="orderShell">
    <header className="orderHero"><div><span className="orderEyebrow">SMART ORDER</span><h1>発注自動計算</h1><p>{STORE_NAMES[STORE_ID] ?? STORE_ID}（{STORE_ID}）</p></div><a className="orderButton ghost" href={`/order-admin?store_id=${STORE_ID}`}>管理画面</a></header>
    <section className="orderPanel">
      <p className="orderHint">発注日は<strong>{orderDays.map((day) => `${["日","月","火","水","木","金","土"][day]}曜日`).join("・")}</strong>{extraOrderDates.includes(date) && <span>（この日は一日限定）</span>}です。冷凍庫と冷蔵庫（W/I）の数量を入力すると、発注数を自動計算します。</p>
      <div className="orderToolbar"><label className="orderField">発注日<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><button className="orderButton ghost" onClick={() => loadDate(date)} disabled={loading}>{loading ? "読込中…" : "再読み込み"}</button><button className="orderButton primary" onClick={() => setShowSaveConfirm(true)} disabled={loading || !rows.length}>入力内容を確認</button></div>
      {message && <div className={`orderAlert ${rows.length ? "" : "error"}`}>{message}</div>}
      {!loading && !rows.length && <div className="orderEmpty">対象データがありません</div>}
      {!!rows.length && <section className="orderInputProgress" aria-label="入力状況"><div className="orderInputProgressTop"><span>入力状況</span><strong>{inputSummary.entered}/{rows.length}件</strong><b>{inputSummary.percent}%</b></div><div className="orderProgressTrack"><i style={{ width: `${inputSummary.percent}%` }} /></div><div className="orderProgressLegend"><span className="entered">入力済み {inputSummary.entered}</span><span className="missing">未入力 {inputSummary.missing}</span><span className="required">発注あり {inputSummary.orderRequired}</span></div></section>}
      {grouped.map(([title, sectionRows]) => <OrderSection key={title} title={title} rows={sectionRows} fridgeDrafts={fridgeDrafts} freezerDrafts={freezerDrafts} onFridge={(code, value) => updateDraft(setFridgeDrafts, code, value)} onFreezer={(code, value) => updateDraft(setFreezerDrafts, code, value)} />)}
    </section>
    {showSaveConfirm && <div className="budgetEditorBackdrop orderSaveConfirmBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) setShowSaveConfirm(false); }}><section className="budgetEditorSheet orderSaveConfirmSheet" role="dialog" aria-modal="true" aria-labelledby="order-save-title"><header><div><span className="orderEyebrow">FINAL CHECK</span><h3 id="order-save-title">この内容で保存しますか？</h3><small>{date.replaceAll("-", "/")}・{STORE_NAMES[STORE_ID] ?? STORE_ID}</small></div><button type="button" className="sheetClose" disabled={loading} onClick={() => setShowSaveConfirm(false)} aria-label="閉じる">×</button></header><div className="orderConfirmMetrics"><article className="entered"><span>入力済み</span><strong>{inputSummary.entered}</strong><small>全{rows.length}件</small></article><article className="missing"><span>未入力</span><strong>{inputSummary.missing}</strong><small>0として保存</small></article><article className="required"><span>発注あり</span><strong>{inputSummary.orderRequired}</strong><small>自動計算結果</small></article></div>{inputSummary.missing > 0 && <p className="orderConfirmNotice">未入力の食材が{inputSummary.missing}件あります。未入力欄は在庫0として保存されます。</p>}<div className="orderConfirmGroups">{grouped.map(([title, sectionRows]) => { const entered = sectionRows.filter((row) => (fridgeDrafts[row.item_code] ?? "") !== "" || (freezerDrafts[row.item_code] ?? "") !== "").length; return <div key={title}><span>{title}</span><strong>{entered}/{sectionRows.length}</strong></div>; })}</div><div className="itemSaveConfirmActions"><button type="button" className="orderButton ghost" disabled={loading} onClick={() => setShowSaveConfirm(false)}>入力に戻る</button><button type="button" className="orderButton primary" disabled={loading} onClick={saveAll}>{loading ? "保存中…" : inputSummary.missing ? "未入力を0として保存" : "この内容で保存"}</button></div></section></div>}
    {toast && <div className="orderToast" role="status">{toast}</div>}
  </main>;
}

function OrderSection({ title, rows, fridgeDrafts, freezerDrafts, onFridge, onFreezer }: { title: string; rows: OrderRow[]; fridgeDrafts: Record<string,string>; freezerDrafts: Record<string,string>; onFridge: (code:string,value:string)=>void; onFreezer: (code:string,value:string)=>void }) {
  if (!rows.length) return null;
  return <section className="orderSection"><h2>{title}</h2><div className="orderTableWrap"><table className="orderTable"><thead><tr><th style={{width:"32%"}}>食材名</th><th>必要数</th><th>冷凍</th><th>冷蔵</th><th>在庫計</th><th>発注数</th></tr></thead><tbody>{rows.map((row) => {
    const fridge = Number(fridgeDrafts[row.item_code] || 0); const freezer = Number(freezerDrafts[row.item_code] || 0); const total = fridge + freezer; const orderQty = Math.ceil(Math.max(Number(row.required_qty || 0) - total, 0));
    const entered = (fridgeDrafts[row.item_code] ?? "") !== "" || (freezerDrafts[row.item_code] ?? "") !== "";
    return <tr key={row.item_code} className={`${entered ? "isEntered" : "isMissing"} ${orderQty > 0 ? "hasOrder" : ""}`}><td className="itemName">{row.name}</td><td>{row.required_qty}</td><td><input inputMode="decimal" value={freezerDrafts[row.item_code] ?? ""} placeholder="0" onChange={(e) => onFreezer(row.item_code,e.target.value)} /></td><td><input inputMode="decimal" value={fridgeDrafts[row.item_code] ?? ""} placeholder="0" onChange={(e) => onFridge(row.item_code,e.target.value)} /></td><td>{total}</td><td className={`orderQty ${orderQty === 0 ? "zero" : ""}`}>{orderQty}</td></tr>;
  })}</tbody></table></div></section>;
}
