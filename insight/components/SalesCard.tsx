import React from "react";
import { InsightDashboardResponse } from "../types";


type Props = {
    sales: InsightDashboardResponse["sales"]
}

export function SalesCard({ sales }: Props) {
    return (
        <div className="insight-card insight-card-sales">
          <h2>売上予測</h2>
            <div className="card-inner card-inner-sales">
                <div className="big-number">
                    今日の予算{sales.forecast.toLocaleString()}円
                </div>
                前週売上{sales.lastWeek.toLocaleString()}円
            </div>
        </div>
    )
}
