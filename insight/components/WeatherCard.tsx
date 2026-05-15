import React from "react";
import { InsightDashboardResponse } from "../types";

type Props = {
    weather: InsightDashboardResponse ["weather"]
} 

// opem-meteoの数値から変換する定数作成予定
const weatherlabel = {
    rain: "雨",
} as const

export function WeatherCard({ weather }: Props ) {
    return (
        <div className="insight-card insight-card-weather">
          <h2>天気予報</h2>
            <div className="card-inner card-inner-weather">
                <div>{weatherlabel[weather.condition]} / 降水確率 {weather.rainProbability}% </div>
                <div>気温：{weather.temperature}℃</div>
                {weather.warningTime && <div>注意時間 : {weather.warningTime}</div>}
            </div>
        </div>
    )
}