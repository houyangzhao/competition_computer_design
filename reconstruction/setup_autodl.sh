#!/bin/bash
# ============================================================
# AutoDL 环境一键搭建脚本
# 推荐镜像: PyTorch 2.1 + CUDA 11.8 + Ubuntu 22.04
# 推荐 GPU: RTX 3090 / 4090
# 运行: bash setup_autodl.sh
# ============================================================
set -e

echo "=========================================="
echo " 筑忆重建环境搭建"
echo "=========================================="

# ── 1. 系统依赖 ──────────────────────────────────────────────
echo "[1/5] 安装系统依赖..."
apt-get update -qq
apt-get install -y colmap gdown libgl1-mesa-glx libglib2.0-0

# ── 2. Python 依赖 ───────────────────────────────────────────
echo "[2/5] 安装 Python 依赖..."
pip install -q plyfile tqdm numpy gdown

# ── 3. 克隆并改造 gaussian-splatting ────────────────────────
echo "[3/5] 克隆 gaussian-splatting 源码..."
cd /root

if [ ! -d "gaussian-splatting" ]; then
    git clone --recursive https://github.com/graphdeco-inria/gaussian-splatting.git
fi

cd gaussian-splatting

# 编译 CUDA 扩展
echo "  编译 diff-gaussian-rasterization..."
pip install -q submodules/diff-gaussian-rasterization

echo "  编译 simple-knn..."
pip install -q submodules/simple-knn

# ── 4. 复制我们的工具脚本到工作目录 ─────────────────────────
echo "[4/5] 部署工具脚本..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cp "$SCRIPT_DIR/reconstruct.sh"          /root/reconstruct.sh
cp "$SCRIPT_DIR/convert_ply_to_splat.py" /root/convert_ply_to_splat.py
chmod +x /root/reconstruct.sh

# ── 5. 验证 ──────────────────────────────────────────────────
echo "[5/5] 验证安装..."
colmap -h > /dev/null 2>&1    && echo "  ✅ COLMAP" || echo "  ❌ COLMAP 安装失败"
python -c "import torch; assert torch.cuda.is_available()" \
                               && echo "  ✅ PyTorch + CUDA" || echo "  ❌ CUDA 不可用"
python -c "import plyfile"     && echo "  ✅ plyfile" || echo "  ❌ plyfile 缺失"

echo ""
echo "=========================================="
echo " 环境就绪！"
echo " 下一步: bash /root/reconstruct.sh <scene_dir> [iterations]"
echo " 示例:   bash /root/reconstruct.sh /root/data/taihedian 7000"
echo "=========================================="
