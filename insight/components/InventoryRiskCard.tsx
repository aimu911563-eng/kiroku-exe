import React from "react";
import { InsightDashboardResponse } from "../types";


type Props = {
    inventory: InsightDashboardResponse["inventory"]
}

export function InventoryRiskCard({ inventory }: Props) {
    return (
        <div>
            {inventory.risks.map((risk) => (
                <div key={risk.itemCode}>
                    {risk.itemName}
                    {risk.currentQty}個
                    使用予測{risk.orderedQty}個
                    予測残り{risk.predictedRemaining}個
                    {risk.level}
                </div>
            ))}
        </div>
    )
}