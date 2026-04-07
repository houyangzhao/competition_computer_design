#!/usr/bin/env bash
set -euo pipefail

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
SETUP_SCRIPT="$PROJECT_ROOT/setup_project.sh"
ENV_FILE="$PROJECT_ROOT/.env"

mkdir -p "$RUN_DIR"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
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
  echo "Node.js 20+ is required, and no fallback Node runtime was found."
  exit 1
fi

if [[ ! -x "$VENV_PYTHON" || ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Project dependencies are missing, running setup..."
  bash "$SETUP_SCRIPT"
fi

if [[ ! -x "$VENV_PYTHON" ]]; then
  echo "Missing Python environment: $VENV_PYTHON"
  exit 1
fi

if [[ -f "$BACKEND_PID_FILE" ]] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
  echo "Backend is already running with PID $(cat "$BACKEND_PID_FILE")."
else
  rm -f "$BACKEND_PID_FILE"
  nohup bash -lc "
    cd '$BACKEND_DIR'
    source '$PROJECT_ROOT/.venv/bin/activate'
    export ZHUYI_RECON_PYTHON='$VENV_PYTHON'
    export ZHUYI_GAUSSIAN_SPLATTING_DIR='${ZHUYI_GAUSSIAN_SPLATTING_DIR:-/root/gaussian-splatting}'
    export ZHUYI_RECON_ITERATIONS='${ZHUYI_RECON_ITERATIONS:-10}'
    export ZHUYI_COLMAP_NO_GPU='${ZHUYI_COLMAP_NO_GPU:-1}'
    export ZHUYI_RECONSTRUCTION_MODE='${ZHUYI_RECONSTRUCTION_MODE:-mock}'
    exec uvicorn main:app --host 127.0.0.1 --port 8000
  " >"$BACKEND_LOG" 2>&1 < /dev/null &
  echo $! >"$BACKEND_PID_FILE"
  echo "Backend started on http://127.0.0.1:8000"
fi

if [[ -f "$FRONTEND_PID_FILE" ]] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
  echo "Frontend is already running with PID $(cat "$FRONTEND_PID_FILE")."
else
  rm -f "$FRONTEND_PID_FILE"
  nohup bash -lc "
    cd '$FRONTEND_DIR'
    export PATH='${NODE_PATH_PREFIX}${PATH}'
    exec npm run dev -- --host 127.0.0.1 --port 6006
  " >"$FRONTEND_LOG" 2>&1 < /dev/null &
  echo $! >"$FRONTEND_PID_FILE"
  echo "Frontend started on http://127.0.0.1:5173"
fi

sleep 2

echo
echo "App URL: http://127.0.0.1:5173"
echo "Backend log: $BACKEND_LOG"
echo "Frontend log: $FRONTEND_LOG"
