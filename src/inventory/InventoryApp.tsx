import { useCallback, useEffect, useState, useMemo, } from "react";
import type { InventoryState, InventoryViewResponse, WeatherNow, RainHour, CleaningState, CleaningTask, } from "./types";

const API_BASE = "/api";

export default function InventoryApp() {
  const storeId = "7249";
  const STORE_COORDS: Record<string, { lat: number; lon: number; label: string }> = {
    "7249": { lat: 34.70, lon: 137.73, label: "寺島(仮)" },
  };
  const STORE_MAP: Record<string, string> = {
    "7249": "terajima",
    "7109": "hamakita",
    "7539": "kosai",
  };
  // const SHIFT_API_BASE = import.meta.env.VITE_SHIFT_API_BASE;
  const PUBLIC_KEY = import.meta.env.VITE_PUBLIC_EMPLOYEES_KEY;
  const [sortKey, setSortKey] = useState<"expiry" | "qty" | "default">("expiry");
  const [state, setState] = useState<InventoryState>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [weather, setWeather] = useState<
    | { status: "idle" }
    | { status: "loading"; data?: WeatherNow } 
    | { status: "error"; message: string }
    | { status: "ready"; data: WeatherNow }
  >({ status: "idle" });

  const [employeeNames, setEmployeeNames] = useState<string[]>([]);
  const [employeeErr, setEmployeeErr] = useState<string | null>(null);

  const sortedNames = useMemo(
    () => [...employeeNames].sort((a, b) => a.localeCompare(b, "ja")),
    [employeeNames]
  );

  const [showNames, setShowNames] = useState(false);

  const fetchEmployees = useCallback(async () => {
    try {
      setEmployeeErr(null);
      const mappedStoreId = STORE_MAP[storeId] ?? storeId;
      const url = `${API_BASE}/public/employees?store_id=${encodeURIComponent(mappedStoreId)}&key=${encodeURIComponent(PUBLIC_KEY)}`;
      const res = await fetch(url, {
        // headers: PUBLIC_KEY ? { "x-public-key" : PUBLIC_KEY } : undefined,
        cache: "no-store",
      });
      const json = await res.json();
      console.log("employees json=", json);
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);

      setEmployeeNames((json.employees ?? []).map((e: any) => e.employee_name));
    } catch (e) {
      setEmployeeErr(e instanceof Error ? e.message : "unknown error");
      setEmployeeNames([]);
    }
  }, [storeId, PUBLIC_KEY]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const [cleaning, setCleaning] = useState<CleaningState>({ status: "idle"});
  const [selectedNames, setSelectedNames] = useState<string[]>([]);

  const fetchCleaning = useCallback(async () => {
    try {
      setCleaning((prev) => 
        prev.status === "ready"
          ? { status: "loading", data: prev.data }
          : prev.status === "error" && prev.data 
            ? { status: "loading", data: prev.data }
            : { status: "loading" }
      );

      const res = await fetch(
        `${API_BASE}/inventory/cleaning/today?store_id=${encodeURIComponent(storeId)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);

      // json.task を cleaningTask に揃える
      const task: CleaningTask = {
        date: json.date,
        task_id: json.task_code,
        task_name: json.task_name ?? null,
        done_by: json.done_by ?? null,
        done_at: json.done_at ?? null,
      };
      setCleaning({ status: "ready", data: task });
    } catch (e) {
      setCleaning((prev) => ({
        status: "error",
        message: e instanceof Error ? e.message : "unknown error",
        data: prev.status === "ready" ? prev.data : prev.status === "loading" ? prev.data : prev.status === "error" ? prev.data : undefined,
      }));
    }
  }, [storeId]);

  const taskCode = cleaning.status === "ready" ? cleaning.data.task_id : null;

  const submitCleaning = useCallback(async () => {
    if (!taskCode) return;
    if (selectedNames.length === 0) return;

    const res = await fetch(`${API_BASE}/cleaning/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        store_id: storeId,
        task_code: taskCode,
        names: selectedNames,
      }),
    });

    if (res.status === 409) {
      alert("今日はもう完了しています");
      return;
    }


    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);

    fetchCleaning();
    setSelectedNames([]);
    setShowNames(false);
  }, [storeId, taskCode, selectedNames, fetchCleaning]);

  

  function weatherEmoji(code: number) {
    if (code === 0) return "☀️";
    if (code === 1 || code === 2) return "⛅";
    if (code === 3) return "☁️";
    if (code === 45 || code === 48) return "🌫️";
    if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
    if ([61, 63, 65, 66, 67, ].includes(code)) return "🌧️";
    if ([71, 73, 75, 77].includes(code)) return "🌨️";
    if ([80, 81, 82].includes(code)) return "🌧️";
    if ([95, 96, 99].includes(code)) return "⛈️";
    return " ";
  }

  function calcBestBefore(today: Date, days: number) {
    const d = new Date (today);

    if (days === 1) {
      d.setTime(d.getTime() + 24 * 60 * 60 * 1000);
      return d;
    }

    d.setDate(d.getDate() + (days - 1));
    return d;
  }

  function fmtHM(d: Date) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = "00"
    return `${hh}:${mm}`;
  }

  function fmtMD(d: Date) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${m}/${day}`;
  }
  
  function shelfChipStyle(days: number) {
    // 翌日
    if (days <= 1) {
      return {
        background: "fee2e2",
        border:"1px solid #fca5a5",
        color: "991b1b",
      };
    }
    // ３〜４
    if (days <= 4) {
      return {
        background: "#ffedd5",
        border: "1px solid #fdba74",
        color: "#9a3412",
      };
    }
    // 5日
    if (days === 5) {
      return {
        background: "#ffedd5",
        border: "1px solid #fdba74",
        color: "#9a3412",
      };
    }
    // 7日
    if (days === 7) {
      return {
        background: "#dbeafe",
        border: "1px solid #93c5fd",
        color: "#1e3a8a"
      }
    }
    // 14日とか
    return {
      background: "#dcfce7",
      border: "1px solid #86efac",
      color: "#166534",
    }
  }

  const fetchWeather = useCallback(async () => {
    const coord = STORE_COORDS[storeId];
    if (!coord) return;

    try {
      setWeather((prev) => 
        prev.status === "ready"
          ? { status: "loading", data: prev.data }
          : { status: "loading" }
      )

      const url = 
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${coord.lat}&longitude=${coord.lon}` +
      `&current_weather=true` +
      `&hourly=temperature_2m,precipitation_probability,weather_code` +
      `&forecast_days=1&timezone=Asia%2FTokyo`;

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`weather HTTP ${res.status}`);
      const json = await res.json();

      const tempC = Number(json?.current_weather?.temperature);
      const code = Number(json?.current_weather?.weathercode);

      const times: string[] = json?.hourly?.time ?? [];
      const probs: number[] = json?.hourly?.precipitation_probability ?? [];
      const temps: number[] = json?.hourly?.temperature_2m ?? [];
      const codes: number[] = json?.hourly?.weather_code ?? [];

      const now = new Date();
      const pad2 = (n: number) => String(n).padStart(2, "0");
      const nowISO = 
        `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}` +
        `T${pad2(now.getHours())}:00`;

      let idx = times.findIndex((t) => t === nowISO);
      if (idx < 0) idx = 0;

      const precipProb = Number(probs[idx] ?? 0);

      const N = 7;
      const rainHours: RainHour[] = Array.from({ length: N}, (_, i) => {
        const j = idx + i;
        const iso = times[j] ?? "";
        const hour = iso ? pad2(new Date(iso).getHours()) : "--";
        return {
          hour,
          prob: Number(probs[j] ?? 0),
          tempC: Number(temps[j] ?? NaN),
          code: Number(codes[j] ?? NaN),
        };
      });

      const data: WeatherNow = { tempC, precipProb, code, rainHours };
      setWeather({ status: "ready", data });
    } catch (e) {
      setWeather({
        status: "error",
        message: e instanceof Error ? e.message : "Weather unknown error",
      });
    }
  }, [storeId]);
  
  // 今の時間だけ更新する
  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 1000) //1秒ごと
    return () => window.clearInterval(id);
  }, []);

  const fetchView = useCallback(async () => {
    try {
      setState({ status: "loading" });

      const res = await fetch(
        `${API_BASE}/inventory/view?store_id=${encodeURIComponent(storeId)}`,
        { cache: "no-store" }
      );
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }

      const data: InventoryViewResponse = json;
      setState({ status: "ready", data });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "unknown error" });
    }
  }, [storeId]);

  useEffect(() => {
    fetchView();
    fetchWeather();

    const id = window.setInterval(() => {
      fetchView();
      fetchWeather();
    }, 5 * 60 * 1000); // 5分ごとに更新
    return () => window.clearInterval(id);
  }, [fetchView, fetchWeather]);


  const elapsedText = useMemo(() => {
    if (state.status !== "ready") return "";

    const ms = Date.now() - new Date(state.data.updated_at).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "更新時刻不明";

    const sec = Math.floor(ms / 1000);
    if (sec < 10) return "たった今";
    if (sec < 60) return `${sec}秒前`;

    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}分前`;

    const hr = Math.floor(min / 60);
    return `${hr}時間前`;
  }, [state, tick]);

  useEffect(() => {
  fetchCleaning();
}, [fetchCleaning]);
  
  const items = state.status === "ready" ? state.data.items : [];

  const mainItems = items.filter((x: any) => x.category === "main");
  const sideItems = items.filter((x: any) => x.category === "side");

  const sortItems = (arr: any[]) => {
    const getIsCase = (it: any) => typeof it.pack_qty === "number" && it.pack_qty >= 2;
    const getQty = (it: any) => (getIsCase(it) ? Number(it.required_unit ?? 0) : Number(it.required_qty ?? 0));

    const getExpiryTs = (it: any) => {
      if (typeof it.shelf_life_days !== "number") return Number.POSITIVE_INFINITY;
      const d = calcBestBefore(new Date(), it.shelf_life_days);
      return d.getTime();
    };

    return [...arr].sort((a, b) => {
      if (sortKey === "qty") {
        return getQty(b) - getQty(a);
      }
      if (sortKey === "default") {
        // display_order があるならそれ優先（なければ0）
        return (Number(a.display_order ?? 0) - Number(b.display_order ?? 0));
      }
      // expiry（期限近い順） + 必要数多い順
      const ea = getExpiryTs(a);
      const eb = getExpiryTs(b);
      if (ea !== eb) return ea - eb;
      return getQty(b) - getQty(a);
    });
  };

  const mainSorted = useMemo(() => sortItems(mainItems), [mainItems, sortKey]);
  const sideSorted = useMemo(() => sortItems(sideItems), [sideItems, sortKey]);

  const done = cleaning.status === "ready" && !!cleaning.data?.done_by;
  // const canSubmit = cleaning.status === "ready" && !!cleanName.trim() && !done;

  if (state.status === "loading") return <div style={{ padding: 24 }}>読み込み中…</div>;
  if (state.status === "error") return <div style={{ padding: 24 }}>エラー: {state.message}</div>;


  return (
    <div style={{ height: "100vh", background: "#f6f7f9", color: "#111", display: "flex", flexDirection: "column" }}>
      {/* Header (固定) */}
            <div
        style={{
          padding: "12px 16px",
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        {/* ★中身を中央寄せ＋最大幅 */}
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          {/* 左：売上 */}
          <div style={{ width: 220 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>本日 予測売上</div>
            <div style={{ fontSize: 32, fontWeight: 900, lineHeight: 1.1 }}>
              {typeof state.data.forecast_sales === "number"
                ? `¥${state.data.forecast_sales.toLocaleString("ja-JP")}`
                : "—"}
            </div>
          </div>

          {/* 中：天気 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>天気</div>

            {weather.status === "ready" ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                  {weatherEmoji(weather.data.code)} {weather.data.tempC.toFixed(1)}℃ / 降水{" "}
                  {Math.round(weather.data.precipProb)}%
                </div>

                {/* ★ここ：黒四角をやめて “小さい白カード” にする */}
                <div style={{ marginTop: 8, overflow: "hidden" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    {weather.data.rainHours.map((h, i) => {
                      const isHigh = h.prob >= 40;
                      const isMid = h.prob >= 20 && h.prob < 40;

                      return (
                        <div
                          key={`${h.hour}-${i}`}
                          style={{
                            width: 64,
                            borderRadius: 12,
                            border: "1px solid #e5e7eb",
                            background: isHigh ? "#fee2e2" : isMid ? "#ffedd5" : "#f9fafb",
                            padding: "6px 6px",
                            textAlign: "center",
                            flex: "0 0 auto",
                          }}
                        >
                          <div style={{ fontSize: 12, color: "#374151" }}>{h.hour}時</div>
                          <div style={{ fontSize: 14 }}>{weatherEmoji(h.code ?? 0)}</div>
                          <div style={{ fontSize: 13, fontWeight: 800 }}>{Math.round(h.prob)}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : weather.status === "error" ? (
              <div style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>
                天気取得失敗（{weather.message}）
              </div>
            ) : (
              <div style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>天気: 読み込み中...</div>
            )}
          </div>

          {/* 右：更新 */}
          <div style={{ width: 220, textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>最終更新</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{elapsedText || "—"}</div>

            <button
              onClick={() => {
                fetchView();
                fetchWeather();
              }}
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#7d9fe9",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              手動更新
            </button>

            <div style={{ marginTop: 6, fontSize: 11, color: "#9ca3af" }}>
              店舗: {state.data.store_id}
            </div>
          </div>
        </div>
      </div>

      {/* 今日の掃除タスク */}
      <div style={{
          marginTop: 10,
          borderRadius: 14,
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          padding: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 , marginBottom: 6 }}>今日の掃除</div>

          {cleaning.status === "error" ? (
            <div style={{ fontSize: 14, fontWeight: 800 }}>取得失敗 ({cleaning.message}) </div>
          ) : cleaning.status === "ready" ? (
            <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{cleaning.data.task_name}</div>
          ) : (
            <div style={{ fontSize: 16, fontWeight: 800, opacity: 0.8 }}>読み込み中...</div>
          )}

          {cleaning.status === "ready" && cleaning.data.done_by && (
            <div style={{ marginTop: 4, fontSize: 12, color: "#059669", fontWeight: 900 }}>
              本日の清掃タスク完了 (担当：{cleaning.data.done_by})
            </div>
          )}
        </div>

        {/* 右側：完了入力（縦積みで安定） */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, minWidth: 320 }}>
          {/* 選択済みチップ */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {selectedNames.length === 0 ? (
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>
                名前を選択（複数ok）
              </div>
            ) : (
              selectedNames.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSelectedNames((prev) => prev.filter((x) => x !== n))}
                  disabled={!!employeeErr}
                  style={{
                    height: 30,
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    padding: "0 10px",
                    background: "#fff",
                    fontWeight: 800,
                    cursor: !!employeeErr || done ? "not-allowed" : "pointer",
                    opacity: !!employeeErr || done ? 0.6 : 1,
                  }}
                  title="タップで解除"
                >
                  {n} ✕
                </button>
              ))
            )}
          </div>


          <button
            type="button"
            onClick={() => setShowNames((v) => !v)}
            disabled={!!employeeErr || done}
            style={{
              height: 40,
              padding: "0 14px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#fff",
              fontWeight: 900,
              cursor: !!employeeErr || done ? "not-allowed" : "pointer",
              opacity: !!employeeErr || done ? 0.6 : 1,
            }}
          >
            {showNames ? "名前一覧を閉じる" : "名前を選択"}
          </button>

          {/* チェックボックス一覧 */}
          {showNames && (
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {sortedNames.map((n) => {
                const checked = selectedNames.includes(n);
                const disabled = !!employeeErr || done;

                return (
                  <label
                    key={n}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      height: 40,
                      padding: "0 12px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: checked ? "#eff6ff" : "#fff",
                      fontWeight: 800,
                      opacity: disabled ? 0.55 : 1,
                      cursor: disabled ? "not-allowed" : "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => {
                        setSelectedNames((prev) =>
                          prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
                        );
                      }}
                    />
                    {n}
                  </label>
                );
              })}
            </div>
          )}


          {/* エラー */}
          {employeeErr && (
            <div style={{ fontSize: 12, fontWeight: 800 }}>
              名前一覧取得失敗 ({employeeErr})
            </div>
          )}

          {/* 送信ボタン */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={submitCleaning}
              disabled={!!employeeErr || done || selectedNames.length === 0}
              style={{
                height: 36,
                padding: "0 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#7d9fe9",
                color: "#fff",
                fontWeight: 900,
                cursor: !!employeeErr || done || selectedNames.length === 0 ? "not-allowed" : "pointer",
                opacity: !!employeeErr || done || selectedNames.length === 0 ? 0.5 : 1,
              }}
            >
              {done ? "完了済" : "完了送信"}
            </button>

            {!done && selectedNames.length > 0 && (
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>
                {selectedNames.length}人で報告
              </div>
            )}
          </div>
        </div>
      </div>


      <div style={{ display: "inline-flex", gap: 6, padding: 4, borderRadius: 999, background: "#f3f4f6", border: "1px solid #e5e7eb", alignItems: "center"}}>
        {[ 
          ["expiry", "期限順"], 
          ["qty", "必要順"], 
          ["default", "標準"],
        ].map(([key, label]) => {
          const active = sortKey === key;
          return (
            <button
              key={key}
              onClick={() => setSortKey(key as any)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: active ? "1px solid #e5e7eb" : "1px solid transparnet",
                background: active ? "#ffffff" : "transparnet",
                boxShadow: active ? "0 1px 2px rgba(0,0,0,0,08)" : "none",
                fontWeight: active ? 800 : 600,
                fontSize: 13,
                color: "#111827",
                cursor: "pointer",
                lineHeight: 1.1,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Body: 2カラム */}
      <div style={{ flex: 1, padding: 16, overflow: "auto", overflowX: "hidden" }}>
        {/* <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, height: "100%" }}> */}
        <div style={{maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "start"}}>
          <Section title="メイン（最重要）" items={mainSorted} />
          <Section title="サイドメニュー" items={sideSorted} />
        </div>
      </div>
    </div>
  );
  function Section({ title, items }: { title: string; items: any[] }) {
    return (
      <div
        style={{
          borderRadius: 16,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
          {title}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            overflow: "hidden",
          }}
        >
          {items.map((it) => {
            const isCaseManaged = typeof it.pack_qty === "number" && it.pack_qty >= 2;
            const showCaseHint = isCaseManaged && (it.unit === "枚" || it.unit === "個");
            const best = calcBestBefore(new Date(), it.shelf_life_days);
            return (
              <div key={it.item_code} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 10px",
                  borderRadius: 12,
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                }}
              >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {it.name}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, display: "flex", alignItems:"flex-end", justifyContent: "flex-end", gap:4 }}>
                  <span>
                    { isCaseManaged ? it.required_unit : it.required_qty}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#666" }}>
                    {it.unit || ""}
                  </span>
                </div>
                {showCaseHint && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>(= {it.required_qty}ケース)</div>
                )}
                {typeof it.shelf_life_days === "number" && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4, display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                    <span>期限{fmtMD(best)}{it.shelf_life_days === 1 ? ` ${fmtHM(best)}` : ""}</span>
                    <span
                      style={{
                        ...shelfChipStyle(it.shelf_life_days),
                        padding: "2px 6px",
                        borderRadius: 999,
                        fontWeight: 800,
                        lineHeight: 1.2,
                      }}
                    >
                      {it.shelf_life_days}日
                    </span>
                  </div>
                )}
              </div>
            </div>
            )
          })}
        </div>
      </div>
    );
  }
}

