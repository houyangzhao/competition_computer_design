#!/usr/bin/env bash
set -euo pipefail

# PROJECT_ROOT 自动定位到脚本所在目录，不依赖硬编码路径
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
VENV_PYTHON="$PROJECT_ROOT/.venv/bin/python"
RUN_DIR="$PROJECT_ROOT/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"
BACKEND_LOG="$RUN_DIR/backend.log"
FRONTEND_LOG="$RUN_DIR/frontend.log"
NODE_FALLBACK_BIN="/tmp/node-v22.14.0-linux-x64/bin"

# 算法目录（setup_autodl.sh 安装到此处）
GS_DIR="${ZHUYI_GAUSSIAN_SPLATTING_DIR:-/root/Code/gaussian-splatting}"
COLMAP_BIN_DIR="${ZHUYI_COLMAP_BIN:-/root/Code/colmap/build/src/colmap/exe}"

mkdir -p "$RUN_DIR"

if [[ ! -x "$VENV_PYTHON" ]]; then
  echo "Missing Python venv: $VENV_PYTHON"
  echo "Run: python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt"
  exit 1
fi

# 定位 npm 绝对路径（避免 login shell PATH 问题）
NPM_BIN="$(command -v npm 2>/dev/null || echo "$NODE_FALLBACK_BIN/npm")"
if [[ ! -x "$NPM_BIN" ]]; then
  echo "Node.js 20+ / npm not found. Install: https://nodejs.org"
  exit 1
fi
NODE_MAJOR="$("$(dirname "$NPM_BIN")/node" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Node.js 20+ required (found $NODE_MAJOR). Please upgrade."
  exit 1
fi

# ── 启动后端 ─────────────────────────────────────────────────
if [[ -f "$BACKEND_PID_FILE" ]] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
  echo "Backend already running (PID $(cat "$BACKEND_PID_FILE"))."
else
  rm -f "$BACKEND_PID_FILE"
  UVICORN_BIN="$PROJECT_ROOT/.venv/bin/uvicorn"
  nohup env \
    PATH="$COLMAP_BIN_DIR:$PROJECT_ROOT/.venv/bin:/usr/local/bin:/usr/bin:/bin" \
    VIRTUAL_ENV="$PROJECT_ROOT/.venv" \
    ZHUYI_RECON_PYTHON="$VENV_PYTHON" \
    ZHUYI_GAUSSIAN_SPLATTING_DIR="$GS_DIR" \
    ZHUYI_RECON_ITERATIONS="${ZHUYI_RECON_ITERATIONS:-7000}" \
    ZHUYI_COLMAP_NO_GPU="${ZHUYI_COLMAP_NO_GPU:-0}" \
    ZHUYI_RECON_MIN_IMAGES="${ZHUYI_RECON_MIN_IMAGES:-10}" \
    "$UVICORN_BIN" main:app --host 0.0.0.0 --port 8000 \
    --app-dir "$BACKEND_DIR" \
  >"$BACKEND_LOG" 2>&1 < /dev/null &
  echo $! >"$BACKEND_PID_FILE"
  echo "Backend  → http://0.0.0.0:8000  (log: $BACKEND_LOG)"
fi

# ── 启动前端 ─────────────────────────────────────────────────
if [[ -f "$FRONTEND_PID_FILE" ]] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
  echo "Frontend already running (PID $(cat "$FRONTEND_PID_FILE"))."
else
  rm -f "$FRONTEND_PID_FILE"
  nohup env PATH="$(dirname "$NPM_BIN"):/usr/local/bin:/usr/bin:/bin" \
    "$NPM_BIN" --prefix "$FRONTEND_DIR" run dev -- --host 0.0.0.0 --port 5173 \
  >"$FRONTEND_LOG" 2>&1 < /dev/null &
  echo $! >"$FRONTEND_PID_FILE"
  echo "Frontend → http://0.0.0.0:5173  (log: $FRONTEND_LOG)"
fi

sleep 2

# ── nginx 反向代理（端口 6006，AutoDL 公网映射用）──────────────
NGINX_CONF="/etc/nginx/sites-available/zhuyi"
if command -v nginx >/dev/null 2>&1; then
  if [[ ! -f "$NGINX_CONF" ]]; then
    cat > "$NGINX_CONF" << 'NGINX'
server {
    listen 6006;
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }
}
NGINX
    ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/zhuyi
    rm -f /etc/nginx/sites-enabled/default
  fi
  nginx -t -q 2>/dev/null && (nginx -s reload 2>/dev/null || nginx) && \
    echo "Nginx    → http://0.0.0.0:6006  (AutoDL 公网端口)"
fi

echo ""
echo "✅ 项目已启动"
echo "   本地前端:  http://localhost:5173"
echo "   本地后端:  http://localhost:8000/docs"
echo "   公网入口:  http://0.0.0.0:6006  (需在 AutoDL 控制台开启自定义服务)"
