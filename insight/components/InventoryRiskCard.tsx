import React from "react";
import { InsightDashboardResponse } from "../types";


type Props = {
    inventory: InsightDashboardResponse["inventory"]
}

const risklabel = {
    high: "高",
    medium: "中",
    low: "低",
} as const

export function InventoryRiskCard({ inventory }: Props) {
    return (
        <div className="insight-card">
          <h2>在庫状況</h2>
            <div className="card-inner card-inner-inventory">
                {inventory.risks.map((risk) => (
                    <div key={risk.itemCode}>
                        <div>{risk.itemName}</div>
                        <div>現在：{risk.currentQty}個</div>
                        <div>使用予測：{risk.orderedQty}個</div>
                        <div>予測残り：{risk.predictedRemaining}個</div>
                        <div>不足リスク : {risklabel[risk.level]}</div>
                    </div>
                ))}
            </div>
        </div>
    )
}