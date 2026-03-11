const STORE_ID = "7249";
const API_BASE = "/api";

type SummaryResponse = {
    ok: boolean;
    store_id: string;
    date: string;
    forecast_sales: number;
    weather: {
        label: string;
        temp_max: number | null;
        rain_hours: number[];
    };
    cleannig: {
        task_code: string | null;
        task_name: string | null;
        done: boolean;
        completed_by: string | null;
        completed_at: string | null;
    };
    ranking_top5: Array<{
        employee_id: string | null;
        employee_name: string;
        count: number;
    }>;
    items: Array<{
        item_code: string;
        name: string;
        category: string | null;
        required_unit: number;
        pack_qty: number;
        required_qty: number;
        unit: string;
    }>;
};

function yen(n: number): string {
    return new Intl.NumberFormat("ja-JP", {
        style: "currency",
        currency: "JPY",
        maximumFractionDigits: 0,
    }).format(n);
}

function formatDate(date: string): string {
    return new Date(date).toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
    });
}

function formatDateTime(date: string | null): string {
    if (!date) return "-";
    return new Date(date).toLocaleString("ja-JP", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function rainHoursLabel(hours: number[]): string {
    if (!hours?.length) return "特になし";
    return hours.map((h) => `${h}時`).join(", ");
}

function setText(id : string, value: string) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderRanking(list: SummaryResponse["ranking_top5"]) {
    const wrap = document.getElementById("rankingList");
    if (!wrap) return;
    wrap.innerHTML = "";

    if (!list.length) {
        wrap.innerHTML = `<div class="muted">まだデータがありません</div>`;
        return;
    }

    list.forEach((row, idx) => {
        const div = document.createElement("div");
        div.className = "rank-item";
        div.innerHTML = `
          <div class="rank-top">
            <span>${idx + 1}位 ${row.employee_name}</span>
            <span>${row.count}件</span>
          </div>
          <div class="rank-sub">従業員番号: ${row.employee_id ?? "-"}</div>
        `;
        wrap.appendChild(div);
    });
}

function renderItems(items: SummaryResponse["items"]) {
    const mainWrap = document.getElementById("mainItems");
    const sideWrap = document.getElementById("sideItems");
    if (!mainWrap || !sideWrap) return;

    mainWrap.innerHTML = "";
    sideWrap.innerHTML = "";

    const mainItems = items.filter((x) => x.category === "main");
    const sideItems = items.filter((x) => x.category !== "main");

    const render = (
        wrap: HTMLElement,
        rows: SummaryResponse["items"]
    ) => {
        if (!rows.length) {
            wrap.innerHTML = `<div class="muted">データがありません</div>`;
            return;
        }

        rows.forEach((item) => {
            const div = document.createElement("div");
            div.className = "item-row";
            div.innerHTML = `
                <div class="rank-top">
                <span>${item.name}</span>
                <span>${item.required_qty}${item.unit}</span>
                </div>
                <div class="item-sub">
                必要数: ${item.required_unit} / pack_qty: ${item.pack_qty} / item_code: ${item.item_code}
                </div>
            `;
            wrap.appendChild(div);
        });
    };

    render(mainWrap, mainItems);
    render(sideWrap, sideItems);
}

async function loadSummary() {
    const loadingEl = document.getElementById("loading");
    const errorEl = document.getElementById("error");
    const appEl = document.getElementById("app");

    try {
        const res = await fetch(
            `${API_BASE}/inventory/admin/summary?store_id=${encodeURIComponent(STORE_ID)}`
        );

        const text = await res.text();
        const data = JSON.parse(text) as SummaryResponse;

        if (!res.ok || !data.ok) {
            throw new Error("summary api error");
        }

        setText("pageSub", `${data.store_id} / ${formatDate(data.date)}時点`);
        setText("forecastSales", yen(data.forecast_sales));
        setText("summaryDate", formatDate(data.date));
        setText("weatherLabel", data.weather.label || "-");
        setText("weatherTempMax", data.weather.temp_max != null ? `${data.weather.temp_max}℃` : "-");
        setText("weatherRainHours", rainHoursLabel(data.weather.rain_hours));
        setText("cleaningTask", data.cleannig.task_name || "-");

        const statusEl = document.getElementById("cleaningStatus");
        if (statusEl) {
            statusEl.innerHTML = data.cleannig.done
              ? `<span class="status-done">完了</span>`
              : `<span class="status-pending">未完了</span>`
        }

        setText("cleaningBy", data.cleannig.completed_by || "-");
        setText("cleaningAt", formatDateTime(data.cleannig.completed_at));

        renderRanking(data.ranking_top5);
        renderItems(data.items);

        if (loadingEl) loadingEl.style.display = "none";
        if (errorEl) errorEl.style.display = "none";
        if (appEl) appEl.style.display = " block";
    } catch (err) {
        console.error(err);
        if (loadingEl) loadingEl.style.display = "none";
        if (errorEl) {
            errorEl.style.display = "block";
            errorEl.textContent = "管理画面の取得に失敗しました";
        }
    }
}

loadSummary();