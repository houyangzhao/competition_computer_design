#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$PROJECT_ROOT/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"

stop_one() {
  local name="$1"
  local pid_file="$2"
  local cmd_pattern="$3"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name is not running (no PID file)."
  else
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid"
      echo "Stopped $name (PID $pid)."
    else
      echo "$name PID file existed, but process $pid was not running."
    fi
    rm -f "$pid_file"
  fi

  # 清理可能的残留进程（旧启动的进程可能没被记录）
  if pgrep -f "$cmd_pattern" >/dev/null 2>&1; then
    echo "  Cleaning up remaining $name processes..."
    pkill -f "$cmd_pattern" || true
  fi
}

stop_one "frontend" "$FRONTEND_PID_FILE" "vite.*port 6006"
stop_one "backend" "$BACKEND_PID_FILE" "uvicorn main:app"
