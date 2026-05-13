import React from "react";
import { InsightDashboardResponse } from "../types";

type Props = {
    shift: InsightDashboardResponse["shift"]
}

export function ShiftRateCard({ shift }: Props) {
    return (
        <div>
            提出者{shift.submitted.toLocaleString()}人
            合計{shift.total}人
            提出率{shift.rate}人

            {shift.employees.map((employee) => (
                <div key= {employee.employeeId}>
                    従業員番号{employee.employeeId}
                    名前{employee.employeeName}
                    {employee.badges.join(" / ")}
                    提出状況{employee.submitted ? "提出済" : "未提出"}
                    やること{employee.nextTraining}
                </div>

            ))}
            
        </div>
    )
}