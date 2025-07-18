import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom"; // ← 追加
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter> {/* ← ここでラップ */}
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
