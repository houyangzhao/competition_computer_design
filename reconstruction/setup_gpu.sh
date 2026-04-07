#!/bin/bash
# ============================================================
# GPU 重建环境搭建脚本（COLMAP + 3D Gaussian Splatting）
# 推荐镜像: PyTorch 2.1 + CUDA 11.8 + Ubuntu 22.04
# 推荐机型: RTX 3090 / 4090
#
# 用法:
#   bash reconstruction/setup_gpu.sh
#   或通过: scripts/setup.sh --gpu
# ============================================================

set -e
# 此脚本安装到系统 PyTorch 环境（conda），不是项目 .venv。
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
colmap -h > /dev/null 2>&1 && echo "COLMAP OK" || echo "COLMAP FAILED"
python -c "import torch; print(f'PyTorch {torch.__version__}, CUDA: {torch.cuda.is_available()}')"

echo ""
echo "========== GPU 重建环境就绪 =========="
echo "确保 .env 中 ZHUYI_RECON_PYTHON 指向系统 Python（如 /root/miniconda3/bin/python）"
echo "然后运行: bash reconstruction/reconstruct.sh <scene_name>"
