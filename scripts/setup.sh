#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
VENV_DIR="$PROJECT_ROOT/.venv"
VENV_PYTHON="$VENV_DIR/bin/python"
NODE_FALLBACK_BIN="/tmp/node-v22.14.0-linux-x64/bin"

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

if [[ ! -d "$VENV_DIR" ]]; then
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
python -m pip install --upgrade pip
python -m pip install -r "$BACKEND_DIR/requirements.txt"

(
  cd "$FRONTEND_DIR"
  export PATH="${NODE_PATH_PREFIX}${PATH}"
  npm ci
)

# 基础目录（后端启动时会根据 ZHUYI_DATA_DIR 自动创建存储目录）
mkdir -p "$BACKEND_DIR/storage" "$BACKEND_DIR/data"

echo "Web setup complete."
echo "Python: $VENV_PYTHON"
echo "Frontend deps: $FRONTEND_DIR/node_modules"

# --gpu: 额外安装 COLMAP + 3D Gaussian Splatting（需要 CUDA 环境）
if [[ "${1:-}" == "--gpu" ]]; then
  echo ""
  echo "Installing GPU reconstruction environment..."
  bash "$PROJECT_ROOT/reconstruction/setup_gpu.sh"
fi
