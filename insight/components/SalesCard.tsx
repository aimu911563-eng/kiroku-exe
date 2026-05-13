import React from "react";
import { InsightDashboardResponse } from "../types";


type Props = {
    sales: InsightDashboardResponse["sales"]
}

export function SalesCard({ sales }: Props) {
    return (
        <div>
            今日の予算{sales.forecast.toLocaleString()}円
            前週売上{sales.lastWeek.toLocaleString()}円
        </div>
    )
}
