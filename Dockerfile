# syntax=docker/dockerfile:1

# ============ 阶段 1：构建前端 ============
FROM node:20-alpine AS web-build
WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ============ 阶段 2：服务端运行时 ============
# better-sqlite3 为原生模块，需要编译工具链
FROM node:20-alpine AS runtime
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && apk del python3 make g++

COPY server/src ./src

# 前端构建产物放到 server 预期的位置（../web/dist）
COPY --from=web-build /build/dist /app/web-dist
ENV WEB_DIST=/app/web-dist \
    DATA_DIR=/data \
    NODE_ENV=production

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1

CMD ["node", "src/index.js"]
