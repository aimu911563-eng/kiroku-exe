import React from "react";
import { InsightDashboardResponse } from "../types";

type Props = {
    alerts: InsightDashboardResponse["alerts"]
}

export function AlertCard({ alerts }: Props) {
  return (
    <>
      {alerts.map((alert) => (
        <div key={`${alert.category}-${alert.message}`}>
          {alert.category}
          {alert.message}
        </div>
      ))}
    </>
  );
}