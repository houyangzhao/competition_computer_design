#!/bin/bash
# ============================================================
# AutoDL 环境一键搭建脚本
#
# 推荐镜像: PyTorch 2.x + CUDA 12.x + Ubuntu 22.04
# 推荐 GPU:  RTX 3090 / 4090 (CUDA Arch 86/89)
# 运行方式: bash setup_autodl.sh
#
# 本脚本会在 /root/Code/ 下安装：
#   - colmap         (从源码编译，支持 GPU SIFT)
#   - gaussian-splatting (graphdeco-inria 官方仓库)
# ============================================================
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/root/Code}"
COLMAP_DIR="$INSTALL_DIR/colmap"
GS_DIR="$INSTALL_DIR/gaussian-splatting"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检测 CUDA Arch（3090=86, 4090=89, A100=80）
CUDA_ARCH="${CUDA_ARCH:-$(python3 -c "import torch; cap=torch.cuda.get_device_capability(); print(cap[0]*10+cap[1])" 2>/dev/null || echo 89)}"

echo "=========================================="
echo " 筑忆重建环境搭建"
echo " INSTALL_DIR : $INSTALL_DIR"
echo " CUDA_ARCH   : $CUDA_ARCH"
echo "=========================================="

mkdir -p "$INSTALL_DIR"

# ── 1. 系统依赖 ──────────────────────────────────────────────
echo ""
echo "[1/6] 安装系统依赖..."
apt-get update -qq
apt-get install -y \
    cmake ninja-build \
    libboost-program-options-dev libboost-filesystem-dev \
    libboost-graph-dev libboost-system-dev \
    libeigen3-dev libflann-dev libfreeimage-dev \
    libmetis-dev libgoogle-glog-dev libgflags-dev \
    libsqlite3-dev libglew-dev qtbase5-dev libqt5opengl5-dev \
    libcgal-dev libceres-dev \
    xvfb libgl1-mesa-glx libglib2.0-0 \
    git wget

# ── 2. 从源码编译 COLMAP（支持 GPU SIFT）────────────────────
echo ""
echo "[2/6] 编译 COLMAP（GPU 支持）..."
if [ ! -f "$COLMAP_DIR/build/src/colmap/exe/colmap" ]; then
    if [ ! -d "$COLMAP_DIR" ]; then
        git clone https://github.com/colmap/colmap.git "$COLMAP_DIR" --branch 3.11.1 --depth 1
    fi

    # 修复：移除 GUI 关闭时强制关闭 OpenGL 的耦合（headless GPU SIFT 需要 OpenGL）
    DEPS_CMAKE="$COLMAP_DIR/cmake/FindDependencies.cmake"
    if grep -q "set(OPENGL_ENABLED OFF)" "$DEPS_CMAKE"; then
        sed -i '/if(NOT GUI_ENABLED)/,/endif()/{ /set(OPENGL_ENABLED OFF)/d }' "$DEPS_CMAKE"
        echo "  已修复 FindDependencies.cmake（OpenGL/GUI 耦合）"
    fi

    mkdir -p "$COLMAP_DIR/build"
    cmake -S "$COLMAP_DIR" -B "$COLMAP_DIR/build" \
        -GNinja \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_CUDA_ARCHITECTURES="$CUDA_ARCH" \
        -DGUI_ENABLED=OFF \
        -DOPENGL_ENABLED=ON
    cmake --build "$COLMAP_DIR/build" -j"$(nproc)"
    echo "  ✅ COLMAP 编译完成"
else
    echo "  已存在，跳过"
fi

# 将 colmap 加入 PATH
COLMAP_BIN="$COLMAP_DIR/build/src/colmap/exe"
if ! echo "$PATH" | grep -q "$COLMAP_BIN"; then
    echo "export PATH=\"$COLMAP_BIN:\$PATH\"" >> ~/.bashrc
    export PATH="$COLMAP_BIN:$PATH"
fi

# ── 3. 克隆 gaussian-splatting ───────────────────────────────
echo ""
echo "[3/6] 克隆 gaussian-splatting..."
if [ ! -d "$GS_DIR" ]; then
    git clone --recursive https://github.com/graphdeco-inria/gaussian-splatting.git "$GS_DIR"
else
    echo "  已存在，跳过"
fi

# ── 4. 编译 CUDA 扩展 ────────────────────────────────────────
echo ""
echo "[4/6] 编译 gaussian-splatting CUDA 扩展..."
cd "$GS_DIR"
pip install -q plyfile tqdm
pip install -q submodules/diff-gaussian-rasterization
pip install -q submodules/simple-knn
pip install -q opencv-python-headless
echo "  ✅ CUDA 扩展编译完成"

# ── 5. Python 依赖（后端）───────────────────────────────────
echo ""
echo "[5/6] 安装后端 Python 依赖..."
BACKEND_DIR="$(dirname "$SCRIPT_DIR")/backend"
if [ -f "$BACKEND_DIR/requirements.txt" ]; then
    pip install -q -r "$BACKEND_DIR/requirements.txt"
fi

# ── 6. 验证 ──────────────────────────────────────────────────
echo ""
echo "[6/6] 验证安装..."
xvfb-run -a "$COLMAP_BIN/colmap" -h > /dev/null 2>&1 \
    && echo "  ✅ COLMAP (GPU, headless)" \
    || echo "  ❌ COLMAP 验证失败"
python3 -c "import torch; assert torch.cuda.is_available(), 'no cuda'" \
    && echo "  ✅ PyTorch + CUDA" \
    || echo "  ❌ CUDA 不可用"
python3 -c "import plyfile" \
    && echo "  ✅ plyfile" \
    || echo "  ❌ plyfile 缺失"

echo ""
echo "=========================================="
echo " 环境就绪！"
echo ""
echo " 环境变量（已写入 ~/.bashrc）："
echo "   ZHUYI_GAUSSIAN_SPLATTING_DIR=$GS_DIR"
echo "   ZHUYI_COLMAP_NO_GPU=0"
echo ""
echo " 启动项目："
echo "   bash start_project.sh"
echo "=========================================="

# 写入推荐的环境变量
cat >> ~/.bashrc << EOF

# 筑忆项目环境变量
export ZHUYI_GAUSSIAN_SPLATTING_DIR="$GS_DIR"
export ZHUYI_COLMAP_NO_GPU="0"
export ZHUYI_RECON_ITERATIONS="7000"
EOF
