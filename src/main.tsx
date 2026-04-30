import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

import { setupAutoDisplaySizeMode } from "./lib/displaySizeSettings";

// ✅ 端末の画面サイズに合わせて、アプリ全体の表示倍率を自動反映
setupAutoDisplaySizeMode();

// ✅ Vite用PWA登録（任意。使っているなら残してOK）
import { registerSW } from "virtual:pwa-register";
registerSW();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
