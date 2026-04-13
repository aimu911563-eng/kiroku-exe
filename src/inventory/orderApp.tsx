import { useEffect, useMemo, useState  } from "react";

type OrderRow = {
  store_id: string;
  order_date: string;
  display_order: number;
  item_code: string;
  name: string;
  category: string;
  priority: number;
  per_100k: number;
  budget_type: "base" | "onion" | "mushroom";
  target_budget: number | null;
  required_qty: number;
  fridge_qty: number;
  freezer_qty: number;
  stock_qty: number;
  order_qty: number;
  input_by?: string | null;
  updated_at?: string | null;
};

const STORE_ID = "7249";
const API_BASE = "/api";
const today = new Date().toISOString().slice(0, 10);


export default function OrderInputPage() {
    const [date, setDate] = useState(today);
    const [rows, setRows] = useState<OrderRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [fridgeDrafts, setFridgeDrafts] = useState<Record<string, string>>({});
    const [freezerDrafts, setFreezerDrafts] = useState<Record<string, string>>({});
    const [toast, setToast] = useState<string | null>(null);
     


    async function loadDate(targetDate = date) {
        setLoading(true);
        setMessage("");

        try {
            const res = await fetch(
            `/api/order/calc?store_id=${encodeURIComponent(STORE_ID)}&date=${encodeURIComponent(targetDate)}`
            );
            const json = await res.json();

            if (!json.ok) {
            throw new Error(json.error || "読み込み失敗しました");
            }

            const data: OrderRow[] = Array.isArray(json.data) ? json.data : [];
            setRows(data);

            const nextFridge: Record<string, string> = {};
            const nextFreezer: Record<string, string> = {};

            for (const row of data) {
            nextFridge[row.item_code] = row.fridge_qty && Number(row.fridge_qty) !== 0 ? String(row.fridge_qty) : "";
            nextFreezer[row.item_code] = row.freezer_qty && Number(row.freezer_qty) !== 0 ? String(row.freezer_qty) : "";
            }

            setFridgeDrafts(nextFridge);
            setFreezerDrafts(nextFreezer);
        } catch (err) {
            console.log(err);
            setMessage(err instanceof Error ? err.message : "読み込み失敗しました");
        } finally {
            setLoading(false);
        }
    }

    useEffect (() => {
        loadDate(date);
    }, [date]);
    
    
    async function saveAll() {
        setMessage("");

        const items = rows.map((row) => ({
            item_code: row.item_code,
            fridge_qty: Number(fridgeDrafts[row.item_code] || 0),
            freezer_qty: Number(freezerDrafts[row.item_code] || 0),
        }));

        try {
            const res = await fetch(`${API_BASE}/inventory/bulk-input`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                store_id: STORE_ID,
                date,
                items,
            }),
            });

            if (!res.ok) {
            const text = await res.text();
            throw new Error(`HTTP ${res.status}: ${text}`);
            }

            const json = await res.json();

            if (!json.ok) {
            throw new Error(json.error || "保存に失敗しました");
            }

            await loadDate(date);
        } catch (err) {
            console.error(err);
        }
        setToast("保存しました");
        setTimeout(() => setToast(null), 3000);
    }
    const grouped = useMemo(() => {
        return {
            main: rows.filter((row) => row.category === "main"),
            side: rows.filter((row) => row.category === "side"),
            freshVeg: rows.filter((row) => row.category === "fresh_veg"),
            mushroom: rows.filter((row) => row.category === "mushroom"),
        };
    }, [rows]);

    function updateFridgeDraft(itemCode: string, value: string) {
        if (value !== "" && !/^\d*\.?\d*$/.test(value)) return;
        setFridgeDrafts((prev) => ({ ...prev, [itemCode]: value }));
    }

    function updateFreezerDraft(itemCode: string, value: string) {
        if (value !== "" && !/^\d*\.?\d*$/.test(value)) return;
        setFreezerDrafts((prev) => ({ ...prev, [itemCode]: value }));
    }

    return (
        <div style={{ maxWidth: 660, margin: "0 auto", padding: 12, }}>
            <h1 style={{ fontSize: 22, marginBottom: 40, textAlign: "center" }}>発注自動計算</h1>

                <div style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginBottom: 12,
                }}
                >
                <div style={{ marginBottom: 14, lineHeight: 1.6 }}>
                    <div style={{ fontSize: 13, color: "#444" }}>
                        発注日は火・金を選択してください
                    </div>
                    <div style={{ fontSize: 13, color: "#444" }}>
                        冷蔵庫(W/I)・冷凍庫の在庫を入力すると発注数が自動計算されます
                    </div>
                    <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>
                        WEB発注時は、ユーザーIDに自分の従業員番号を入力してください
                    </div>
                </div>

                <label style={{ display: "flex", flexDirection: "column", minWidth: 120, fontSize: 12, fontWeight: 600 }}>
                    発注日{" "}
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        style={{ padding: 8 }}
                    />
                </label>

                <button onClick={() => 
                  loadDate(date)} 
                  disabled={loading} 
                  style={{
                        minWidth: 110,
                        height: 38,
                        padding: "0 10px",
                        whiteSpace: "nowrap",
                        background: "#333",
                        color: "#fff",
                    }}
                >
                    {loading ? "読み込み中..." : "読み込み"}
                </button>

                <button 
                  onClick={saveAll} 
                  disabled={loading || rows.length === 0}
                  style={{
                        minWidth: 110,
                        height: 38,
                        padding: "0 10px",
                        whiteSpace: "nowrap",
                        background: "#fff",
                        color: "#333",
                    }}
                >
                    一括保存
                </button>
            </div>

            <Section 
                title="ピザ食材"
                rows={grouped.main}
                fridgeDrafts={fridgeDrafts}
                freezerDrafts={freezerDrafts}
                onFridgeChange={updateFridgeDraft}
                onFreezerChange={updateFreezerDraft}
            />

            <Section 
                title="サイド"
                rows={grouped.side}
                fridgeDrafts={fridgeDrafts}
                freezerDrafts={freezerDrafts}
                onFridgeChange={updateFridgeDraft}
                onFreezerChange={updateFreezerDraft}
            />

            <Section 
                title="生鮮野菜"
                rows={grouped.freshVeg}
                fridgeDrafts={fridgeDrafts}
                freezerDrafts={freezerDrafts}
                onFridgeChange={updateFridgeDraft}
                onFreezerChange={updateFreezerDraft}
            />

            <Section 
                title="特別発注マッシュルーム"
                rows={grouped.mushroom}
                fridgeDrafts={fridgeDrafts}
                freezerDrafts={freezerDrafts}
                onFridgeChange={updateFridgeDraft}
                onFreezerChange={updateFreezerDraft}
            />

            {toast && (
                <div style={{
                    position: "fixed",
                    bottom: 20,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "#333",
                    color: "#fff",
                    padding: "10px 16px",
                    borderRadius: 8,
                    fontSize: 14,
                    opacity: 0.9,
                }}>
                    {toast}
                </div>
            )}
        </div>
    );
}

function Section({
    title,
    rows,
    fridgeDrafts,
    freezerDrafts,
    onFridgeChange,
    onFreezerChange,
} : {
    title: string;
    rows: OrderRow[];
    fridgeDrafts: Record<string, string>;
    freezerDrafts: Record<string, string>;
    onFridgeChange: (itemCode: string, value: string) => void;
    onFreezerChange: (itemCode: string, value: string) => void;
}) {
    if (rows.length === 0) return null;

    return (
        <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, marginBottom: 8}}>{title}</h2>

            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", padding: 6, fontSize: 12, tableLayout: "fixed" }}>
                    <thead>
                        <tr>
                            <Th width="30%">食材名</Th>
                            <Th width="12%">必要数</Th>
                            <Th width="16%">冷凍</Th>
                            <Th width="16%">冷蔵(W/I)</Th>
                            <Th width="10%">合計</Th>
                            <Th width="12%">発注数</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => {
                            const fridge = Number(fridgeDrafts[row.item_code] || 0);
                            const freezer = Number(freezerDrafts[row.item_code] || 0);
                            const total = fridge + freezer;
                            //const orderQty = Math.max(Number(row.required_qty || 0) - total, 0);
                            const rawOrderQty = Math.max(Number(row.required_qty || 0) - total, 0);
                            const orderQty = Math.ceil(rawOrderQty);

                            return (
                                <tr key={row.item_code}>
                                    <Td width="30%" 
                                        style={{
                                            textAlign: "center",
                                            lineHeight: "1.25",
                                            wordBreak: "break-word",
                                        }}
                                    >
                                        {row.name}
                                    </Td>
                                    <Td width="12%">
                                        {row.required_qty}
                                    </Td>
                                    <Td width="16%">
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={fridgeDrafts[row.item_code] ?? ""}
                                            placeholder="0"
                                            onChange={(e) => onFridgeChange(row.item_code, e.target.value)}
                                            style={{ width: 40, padding: "6px 4px", textAlign: "center", }}
                                        />
                                    </Td>
                                    <Td width="16%">
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={freezerDrafts[row.item_code] ?? ""}
                                            placeholder="0"
                                            onChange={(e) => onFreezerChange(row.item_code, e.target.value)}
                                            style={{ width: 40, padding: "6px 4px", textAlign: "center" }}
                                        />
                                    </Td>
                                    <Td width="10%" >
                                        {total}
                                    </Td>
                                    <Td width="12%" style={{ 
                                        color: orderQty === 0 
                                          ? "#aaa" 
                                          : orderQty >= 10
                                          ? "#d32f2f"
                                          : "#1976d2",
                                        fontWeight: orderQty === 0 ? 400 : 600,
                                        backgroundColor: orderQty > 0 ? "#e3f2fd" : "transparent",
                                    }}>
                                        {orderQty.toFixed(2)}
                                    </Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>

    );
}

function Th ({ children, width, style, } : { children: React.ReactNode; width?: string; style?: React.CSSProperties; }) {
    return (
        <th 
            style={{
            textAlign: "center",
            borderBottom: "1px solid #ccc",
            padding: "10px 8px",
            whiteSpace: "nowrap",
            width,
            ...style,
            }}
        >
            {children}
        </th>
    );
}

function Td ({ children, width, style } : { children: React.ReactNode; width?: string; style?: React.CSSProperties; }) {
    return (
        <td 
            style={{
            textAlign: "center",
            borderBottom: "1px solid #eee",
            padding: "6px 4px",
            verticalAlign: "middle",
            width,            ...style,
            }}
        >
            {children}
        </td>
    );
}
