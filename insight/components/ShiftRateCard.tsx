import React from "react";
import { InsightDashboardResponse } from "../types";

type Props = {
    shift: InsightDashboardResponse["shift"]
}

export function ShiftRateCard({ shift }: Props) {

    const missing = shift.total - shift.submitted;

    return (
        <div className="insight-card">
            <h2>シフト状況</h2>
            <div className="card-inner card-inner-shift">
                <div>提出率：{shift.submitted.toLocaleString()} / {shift.total}人 ({shift.rate}%)</div>
                <div>未提出：{missing}人</div>
                {shift.employees.map((employee) => (
                    <div key= {employee.employeeId}>
                        {employee.employeeId} :
                        {employee.employeeName} :
                        {employee.badges.length > 0 && ` / ${employee.badges.join(" ・ ")}`} /
                        {employee.submitted ? "提出済" : "未提出"} 
                        {employee.nextTraining && ` / 次 : ${employee.nextTraining}`}
                    </div>

                ))}
            </div>
        </div>
    )
}