import React from "react";
import { createRoot } from "react-dom/client";
import { InsightDashboard } from "./InsightDashboard";
import "./insight.css"


createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <InsightDashboard />
  </React.StrictMode>
);