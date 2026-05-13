import React from "react";
import { InsightDashboardResponse } from "../types";

type Props = {
    weather: InsightDashboardResponse ["weather"]
}

export function WeatherCard({ weather }: Props ) {
    return (
        <div>
            {weather.condition}
            降水確率{weather.rainProbability}%
            {weather.temperature}°
            降水時間{weather.warningTime}
        </div>
    )
}