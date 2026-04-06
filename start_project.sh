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

NODE_PATH_PREFIX=""
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "$NODE_MAJOR" -lt 20 && -d "$NODE_FALLBACK_BIN" ]]; then
    NODE_PATH_PREFIX="$NODE_FALLBACK_BIN:"
  fi
elif [[ -d "$NODE_FALLBACK_BIN" ]]; then
  NODE_PATH_PREFIX="$NODE_FALLBACK_BIN:"
else
  echo "Node.js 20+ required. Not found in PATH or $NODE_FALLBACK_BIN"
  exit 1
fi

# ── 启动后端 ─────────────────────────────────────────────────
if [[ -f "$BACKEND_PID_FILE" ]] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
  echo "Backend already running (PID $(cat "$BACKEND_PID_FILE"))."
else
  rm -f "$BACKEND_PID_FILE"
  nohup bash -lc "
    cd '$BACKEND_DIR'
    source '$PROJECT_ROOT/.venv/bin/activate'
    export PATH='$COLMAP_BIN_DIR:\$PATH'
    export ZHUYI_RECON_PYTHON='$VENV_PYTHON'
    export ZHUYI_GAUSSIAN_SPLATTING_DIR='$GS_DIR'
    export ZHUYI_RECON_ITERATIONS='\${ZHUYI_RECON_ITERATIONS:-7000}'
    export ZHUYI_COLMAP_NO_GPU='\${ZHUYI_COLMAP_NO_GPU:-0}'
    export ZHUYI_RECON_MIN_IMAGES='\${ZHUYI_RECON_MIN_IMAGES:-10}'
    exec uvicorn main:app --host 0.0.0.0 --port 8000
  " >"$BACKEND_LOG" 2>&1 < /dev/null &
  echo $! >"$BACKEND_PID_FILE"
  echo "Backend  → http://0.0.0.0:8000  (log: $BACKEND_LOG)"
fi

# ── 启动前端 ─────────────────────────────────────────────────
if [[ -f "$FRONTEND_PID_FILE" ]] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
  echo "Frontend already running (PID $(cat "$FRONTEND_PID_FILE"))."
else
  rm -f "$FRONTEND_PID_FILE"
  nohup bash -lc "
    cd '$FRONTEND_DIR'
    export PATH='${NODE_PATH_PREFIX}\${PATH}'
    exec npm run dev -- --host 0.0.0.0 --port 5173
  " >"$FRONTEND_LOG" 2>&1 < /dev/null &
  echo $! >"$FRONTEND_PID_FILE"
  echo "Frontend → http://0.0.0.0:5173  (log: $FRONTEND_LOG)"
fi

sleep 2
echo ""
echo "✅ 项目已启动"
echo "   前端: http://localhost:5173"
echo "   后端: http://localhost:8000/docs"
