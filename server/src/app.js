import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { authRouter } from './routes/auth.js';
import { settingsRouter } from './routes/settings.js';
import { sessionsRouter } from './routes/sessions.js';
import { WEB_DIST } from './config.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.use('/api/auth', authRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/sessions', sessionsRouter);

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // 生产模式：托管前端构建产物（PWA）
  if (fs.existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST, { maxAge: '1h', setHeaders: setNoCacheForSw }));
    app.get(/^(?!\/api\/).*/, (req, res) => {
      res.sendFile(path.join(WEB_DIST, 'index.html'));
    });
  }

  // 统一错误处理
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ error: status === 400 ? '请求体格式错误' : '服务器内部错误' });
  });

  return app;
}

function setNoCacheForSw(res, filePath) {
  // SW 注册脚本 / 清单 / 入口页必须实时生效，否则部署后客户端拿旧缓存
  if (
    filePath.endsWith('sw.js') ||
    filePath.endsWith('index.html') ||
    filePath.endsWith('manifest.webmanifest') ||
    filePath.endsWith('registerSW.js')
  ) {
    res.setHeader('Cache-Control', 'no-cache');
  }
}
