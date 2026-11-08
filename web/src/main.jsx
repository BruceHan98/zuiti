import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import './styles.css';

/* ============ Service Worker 即时更新策略 ============
 * 目标：服务器部署新代码后，移动端刷新/打开立即生效。
 * 1. 页面加载时 SW 检测到新版本 → onNeedRefresh 触发
 * 2. 立即调用 updateSW(true) 激活新 SW（skipWaiting）
 * 3. 新 SW 接管 → controllerchange 触发 → 自动刷新一次，展示新版本
 * 4. 页面从后台切回前台时额外检查一次更新（长驻 PWA 场景）
 */
let refreshing = false;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

const updateSW = registerSW({
  onNeedRefresh() {
    // 检测到新版本：立即激活并让 controllerchange 完成刷新
    updateSW(true).catch(() => {
      // 激活失败时兜底强刷
      window.location.reload();
    });
  },
  onOfflineReady() {},
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    // 长驻会话：切回前台时检查更新；每 60 分钟兜底检查一次
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });
    setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
  },
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
