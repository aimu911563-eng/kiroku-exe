import React, { useEffect, useState } from "react";
import type { InsightDashboardResponse } from "./types";
import { fetchInsightDashboard } from "./api";
import { SalesCard } from "./components/SalesCard";
import { ShiftRateCard } from "./components/ShiftRateCard";
import { InventoryRiskCard } from "./components/InventoryRiskCard";
import { WeatherCard } from "./components/WeatherCard";
import { AlertCard } from "./components/AlertList";

export function InsightDashboard() {
  const [data, setData] = useState<InsightDashboardResponse | null>(null);

  useEffect(() => {
    fetchInsightDashboard().then(setData);
  }, []);

  if (!data) {
    return <div>loading...</div>;
  }

  return (
    <>
      <SalesCard sales={data.sales} />
      <ShiftRateCard shift={data.shift} />
      <InventoryRiskCard inventory={data.inventory} />
      <WeatherCard weather={data.weather} />
      <AlertCard alerts={data.alerts} />
    </>
  );
}