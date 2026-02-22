export type StoreId = string;

export interface InventoryItemView {
  item_code: string;
  name: string;
  unit: string;
  required_qty: number;
  shelf_life_days?: number | null;
}

export interface InventoryViewResponse {
  store_id: StoreId;
  updated_at: string;
  items: InventoryItemView[];
  forecast_sales: number;
}

export type InventoryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: InventoryViewResponse };

// 天気の型
export type RainHour = {
  hour: string;     // "18"
  prob: number;     // 0-100
  tempC?: number;   // 省略OK
  code?: number;    // 省略OK
};

export type WeatherNow = {
  tempC: number;
  precipProb: number;
  code: number;
  rainHours: RainHour[]; // ←ここに時間別を入れる
};

export type WeatherState =
  | { status: "idle" }
  | { status: "loading"; data?: WeatherNow }
  | { status: "error"; message: string }
  | { status: "ready"; data: WeatherNow };

export type CleaningTask = {
  date: string;          // "2026-02-22"
  task_id: string;       // "FLOOR" みたいなID
  task_name: string;     // 表示名
  done_by?: string | null;
  done_at?: string | null; // ISO文字列
};

export type CleaningState =
  | { status: "idle" }
  | { status: "loading"; data?: CleaningTask }
  | { status: "error"; message: string; data?: CleaningTask }
  | { status: "ready"; data: CleaningTask };