#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/data/coding/learning/competition_computer_design"
RUN_DIR="$PROJECT_ROOT/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"

stop_one() {
  local name="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name is not running."
    return
  fi

  local pid
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "Stopped $name (PID $pid)."
  else
    echo "$name PID file existed, but process $pid was not running."
  fi

  rm -f "$pid_file"
}

stop_one "frontend" "$FRONTEND_PID_FILE"
stop_one "backend" "$BACKEND_PID_FILE"
