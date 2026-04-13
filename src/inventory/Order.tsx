import React from "react";
import { createRoot } from "react-dom/client";
import OrderApp from "./orderApp";
import "./inventory.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");

createRoot(el).render(
  <React.StrictMode>
    <OrderApp />
  </React.StrictMode>
);


