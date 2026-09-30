import React from "react";
import { createRoot } from "react-dom/client";
import OrderAdminApp from "./orderAdminApp";
import "./order.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(<React.StrictMode><OrderAdminApp /></React.StrictMode>);
