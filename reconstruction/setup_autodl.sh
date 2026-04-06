#!/bin/bash
# ============================================================
# AutoDL 一键环境搭建脚本
# 推荐镜像: PyTorch 2.1 + CUDA 11.8 + Ubuntu 22.04
# 推荐机型: RTX 3090 / 4090
# ============================================================

set -e
# ⚠️  此脚本安装到 AutoDL 系统 PyTorch 环境（conda），不是项目 .venv。
# diff-gaussian-rasterization 和 simple-knn 需要 CUDA 编译，无法装进 .venv。

echo "========== 1. 安装 COLMAP =========="
apt-get update && apt-get install -y colmap

echo "========== 2. 克隆 3D Gaussian Splatting =========="
cd /root
if [ ! -d "gaussian-splatting" ]; then
    git clone --recursive https://github.com/graphdeco-inria/gaussian-splatting.git
fi
cd gaussian-splatting

echo "========== 3. 安装 Python 依赖 =========="
pip install plyfile tqdm submodules/diff-gaussian-rasterization submodules/simple-knn

echo "========== 4. 验证安装 =========="
colmap -h > /dev/null 2>&1 && echo "✅ COLMAP 安装成功" || echo "❌ COLMAP 安装失败"
python -c "import torch; print(f'✅ PyTorch {torch.__version__}, CUDA: {torch.cuda.is_available()}')"

echo ""
echo "========== 环境就绪 =========="
echo "下一步: 上传照片到 /root/data/your_building/input/"
echo "然后运行: bash /root/reconstruct.sh your_building"
