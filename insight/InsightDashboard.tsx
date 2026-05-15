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
    <main className="insight-page">
        <h1>Dominos Insight</h1>
            <section className="insight-grid">
                <SalesCard sales={data.sales} />
                <WeatherCard weather={data.weather} />
                <InventoryRiskCard inventory={data.inventory} />
                <ShiftRateCard shift={data.shift} />              
                <AlertCard alerts={data.alerts} />
            </section>
    </main>
  );
}