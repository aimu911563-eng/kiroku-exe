import React from "react";
import { InsightDashboardResponse } from "../types";

type Props = {
    alerts: InsightDashboardResponse["alerts"]
}

const levellabel = {
    high: "重要",
    medium: "注意",
    low: "情報",
} as const 

const categorylabel = {
    inventory: "在庫",
    weather: "天気",
    shift: "シフト",
    sales: "売上",
} as const;


export function AlertCard({ alerts }: Props) {
  return (
    <div className="insight-card insight-card-alert">
      <h2>注意アラート</h2>
        <div className="card-inner card-inner-alert">
            <>
            {alerts.map((alert) => (
                    <div key={`${alert.category}-${alert.message}`}>
                    <div>{categorylabel[alert.category]} : {levellabel[alert.level]}</div>
                    <div>{alert.message}</div>
                </div>
            ))}
            </>
        </div>
    </div>
  );
}