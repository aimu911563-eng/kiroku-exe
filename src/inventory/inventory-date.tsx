import React from "react";
import { createRoot } from "react-dom/client";
import InventoryDateApp from "./InventoryDateApp";
import "./inventory-date.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");

createRoot(el).render(
  <React.StrictMode>
    <InventoryDateApp />
  </React.StrictMode>
);


