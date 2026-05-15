 import { InsightDashboardResponse } from "./types";


// ダミー　とりあえず表示させたい
export async function fetchInsightDashboard(): Promise<InsightDashboardResponse> {
    const morkDate: InsightDashboardResponse = {
        sales: {
            forecast: 420000,
            lastWeek: 380000,
            diff: 40000,
        },

        weather: {
            condition: "rain",
            rainProbability: 70,
            temperature: 22,
            warningTime: "18:00~21:00",
        },

        shift: {
            submitted: 18,
            total: 24,
            rate: 75,

            employees: [ 
                { 
                    employeeId: "72490000",
                    employeeName: "テスト",
                    badges: ["責任者"],
                    submitted: true,
                    nextTraining: "新人トレーニング"
                },

                { 
                    employeeId: "72490001",
                    employeeName: "タロウ",
                    badges: ["ドライバー"],
                    submitted: true,
                    nextTraining: "新人トレーニング"
                },

                { 
                    employeeId: "72490002",
                    employeeName: "よしこ",
                    badges: ["インストア"],
                    submitted: true,
                    nextTraining: "新人トレーニング"
                }              
            ] 
        },

        inventory: {
            risks: [
                {
                    itemCode: "DOUGH_HT_L",
                    itemName: "Lドー",
                    currentQty: 12,
                    orderedQty: 7,
                    predictedUsage: 20,
                    predictedRemaining: -2,
                    level: "high",
                },

                {
                    itemCode: "DOUGH_HT_R",
                    itemName: "Mドー",
                    currentQty: 24,
                    orderedQty: 8,
                    predictedUsage: 20,
                    predictedRemaining: -2,
                    level: "high",
                },

                {
                    itemCode: "CHEESE",
                    itemName: "チーズ",
                    currentQty: 12,
                    orderedQty: 7,
                    predictedUsage: 20,
                    predictedRemaining: -2,
                    level: "high",
                },
            ],
        },

        alerts: [
            {
                level: "high",
                category: "inventory",
                message: "生地 L が不足する可能性があります",
            },

            {
                level: "low",
                category: "weather",
                message: "雨が降る予定はありません",
            },
        ],
    };

    return morkDate;
}
