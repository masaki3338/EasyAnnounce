import "./ttsBridge"; // ← これだけ追加（副作用インポート）
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";


// ✅ Vite用PWA登録（最後に追加）
import { registerSW } from 'virtual:pwa-register';
registerSW();



createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
