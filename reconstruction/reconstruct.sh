#!/bin/bash
# ============================================================
# 一键重建脚本：照片目录 -> .splat 文件
#
# 用法:
#   bash reconstruct.sh <scene_dir> [iterations]
#
# 参数:
#   scene_dir   场景根目录，必须包含 input/ 子目录（放原始照片）
#               如果已有 sparse/0/（COLMAP 结果），自动跳过 COLMAP
#   iterations  3DGS 训练迭代数，默认 7000（demo 质量）
#
# 环境变量（通过 start_project.sh 或 ~/.bashrc 设置）:
#   GS_DIR              gaussian-splatting 目录
#   COLMAP_BIN          colmap 可执行文件所在目录
#   PYTHON_BIN          Python 解释器路径
#   CONVERT_SCRIPT      convert_ply_to_splat.py 路径
#   COLMAP_NO_GPU       1=CPU模式（慢），0=GPU模式（默认）
#   MIN_IMAGES          最少图片数，默认 10
#
# 输出:
#   <scene_dir>/output_<N>/point_cloud/iteration_<N>/point_cloud.ply
#   <scene_dir>/<scene_name>.splat
# ============================================================

set -euo pipefail

SCENE_DIR="${1:?用法: bash reconstruct.sh <scene_dir> [iterations]}"
ITERATIONS="${2:-7000}"
SCENE_NAME="$(basename "$SCENE_DIR")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GS_DIR="${GS_DIR:-/root/Code/gaussian-splatting}"
COLMAP_BIN="${COLMAP_BIN:-/root/Code/colmap/build/src/colmap/exe}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
CONVERT_SCRIPT="${CONVERT_SCRIPT:-$SCRIPT_DIR/convert_ply_to_splat.py}"
COLMAP_NO_GPU="${COLMAP_NO_GPU:-0}"
MIN_IMAGES="${MIN_IMAGES:-10}"
OUTPUT_DIR="$SCENE_DIR/output_${ITERATIONS}"

echo "=========================================="
echo " 筑忆重建管线启动"
echo " 场景: $SCENE_NAME"
echo " 迭代: $ITERATIONS"
echo " GPU:  $([ "$COLMAP_NO_GPU" = "0" ] && echo "启用" || echo "禁用（CPU模式）")"
echo " 输出: $OUTPUT_DIR"
echo "=========================================="

# ── 前置检查 ─────────────────────────────────────────────────
if [ ! -d "$SCENE_DIR/input" ]; then
    echo "❌ 未找到 $SCENE_DIR/input/ 目录，请将图像放入该目录"
    exit 1
fi

IMG_COUNT=$(find "$SCENE_DIR/input" \( -name "*.jpg" -o -name "*.JPG" -o -name "*.png" -o -name "*.PNG" -o -name "*.jpeg" \) | wc -l)
echo "  找到 $IMG_COUNT 张图像"

if [ "$IMG_COUNT" -lt "$MIN_IMAGES" ]; then
    echo "❌ 图像数量不足（$IMG_COUNT < $MIN_IMAGES）"
    exit 1
fi

if [ ! -d "$GS_DIR" ]; then
    echo "❌ gaussian-splatting 未找到: $GS_DIR"
    echo "  请先运行 bash setup_autodl.sh"
    exit 1
fi

# ── COLMAP 稀疏重建 ───────────────────────────────────────────
if [ -d "$SCENE_DIR/sparse/0" ] && [ "$(ls -A "$SCENE_DIR/sparse/0" 2>/dev/null)" ]; then
    echo ""
    echo "[COLMAP] 检测到已有稀疏重建结果，跳过 ✓"
else
    echo ""
    echo "[COLMAP] 开始稀疏重建..."

    # 建立 distorted 目录结构（gaussian-splatting convert.py 期望的格式）
    mkdir -p "$SCENE_DIR/distorted/sparse"

    if [ "$COLMAP_NO_GPU" = "1" ]; then
        COLMAP_CMD="colmap"
        SIFT_USE_GPU="0"
    else
        # headless 服务器需要 xvfb-run 提供虚拟 X 显示给 OpenGL GPU SIFT
        COLMAP_CMD="xvfb-run -a $COLMAP_BIN/colmap"
        SIFT_USE_GPU="1"
    fi

    echo "  [1/4] 特征提取..."
    $COLMAP_CMD feature_extractor \
        --database_path "$SCENE_DIR/distorted/database.db" \
        --image_path "$SCENE_DIR/input" \
        --ImageReader.single_camera 1 \
        --SiftExtraction.use_gpu "$SIFT_USE_GPU"

    echo "  [2/4] 特征匹配..."
    $COLMAP_CMD exhaustive_matcher \
        --database_path "$SCENE_DIR/distorted/database.db" \
        --SiftMatching.use_gpu "$SIFT_USE_GPU"

    echo "  [3/4] 稀疏重建（mapper）..."
    mkdir -p "$SCENE_DIR/distorted/sparse"
    $COLMAP_CMD mapper \
        --database_path "$SCENE_DIR/distorted/database.db" \
        --image_path "$SCENE_DIR/input" \
        --output_path "$SCENE_DIR/distorted/sparse"

    # 选择最大子模型（mapper 可能生成多个）
    BEST_MODEL=""
    BEST_COUNT=0
    for MODEL_DIR in "$SCENE_DIR/distorted/sparse"/*/; do
        if [ -f "${MODEL_DIR}images.bin" ]; then
            COUNT=$(wc -c < "${MODEL_DIR}images.bin")
            if [ "$COUNT" -gt "$BEST_COUNT" ]; then
                BEST_COUNT=$COUNT
                BEST_MODEL="$MODEL_DIR"
            fi
        fi
    done

    if [ -z "$BEST_MODEL" ]; then
        echo "❌ COLMAP 重建失败：未生成任何稀疏模型"
        exit 1
    fi

    # 归一化到 distorted/sparse/0（image_undistorter 期望固定路径）
    if [ "$BEST_MODEL" != "$SCENE_DIR/distorted/sparse/0/" ]; then
        echo "  使用最大子模型: $BEST_MODEL（共 $BEST_COUNT 字节）"
        rm -rf "$SCENE_DIR/distorted/sparse/0"
        cp -r "$BEST_MODEL" "$SCENE_DIR/distorted/sparse/0"
    fi

    echo "  [4/4] 去畸变..."
    $COLMAP_CMD image_undistorter \
        --image_path "$SCENE_DIR/input" \
        --input_path "$SCENE_DIR/distorted/sparse/0" \
        --output_path "$SCENE_DIR" \
        --output_type COLMAP

    mkdir -p "$SCENE_DIR/sparse/0"
    mv "$SCENE_DIR/sparse/"*.bin "$SCENE_DIR/sparse/0/" 2>/dev/null || true

    IMG_REGISTERED=$(python3 -c "
import struct, sys
with open('$SCENE_DIR/sparse/0/images.bin','rb') as f:
    n = struct.unpack('<Q',f.read(8))[0]
print(n)
" 2>/dev/null || echo "0")
    echo "  COLMAP 完成，注册图像: $IMG_REGISTERED / $IMG_COUNT 张"

    if [ "$IMG_REGISTERED" -lt "$MIN_IMAGES" ] 2>/dev/null; then
        echo "❌ COLMAP 注册图像数量不足（$IMG_REGISTERED < $MIN_IMAGES），照片重叠度可能不够"
        echo "   建议：确保相邻照片之间有 70% 以上重叠，避免混合横拍和竖拍"
        exit 1
    fi
fi

# ── 3DGS 训练 ────────────────────────────────────────────────
echo ""
echo "[3DGS] 开始训练（$ITERATIONS 迭代）..."
cd "$GS_DIR"

"$PYTHON_BIN" train.py \
    -s "$SCENE_DIR" \
    -m "$OUTPUT_DIR" \
    -r 4 \
    --iterations "$ITERATIONS" \
    --position_lr_max_steps "$ITERATIONS" \
    --densify_until_iter $(( ITERATIONS * 2 / 3 )) \
    --save_iterations "$ITERATIONS" \
    --test_iterations "$ITERATIONS" \
    --checkpoint_iterations $(( ITERATIONS / 2 )) "$ITERATIONS"

PLY_PATH="$OUTPUT_DIR/point_cloud/iteration_${ITERATIONS}/point_cloud.ply"

if [ ! -f "$PLY_PATH" ]; then
    echo "❌ 训练失败：未找到输出 PLY"
    exit 1
fi

echo "  ✅ 训练完成: $(du -sh "$PLY_PATH" | cut -f1)"

# ── PLY → .splat ─────────────────────────────────────────────
echo ""
echo "[转换] PLY -> .splat..."
SPLAT_PATH="$SCENE_DIR/${SCENE_NAME}.splat"

"$PYTHON_BIN" "$CONVERT_SCRIPT" "$PLY_PATH" "$SPLAT_PATH" --transform outdoor_arch \
    --min-opacity 0.02 --max-scale 0.1

echo "  ✅ 转换完成: $SPLAT_PATH ($(du -sh "$SPLAT_PATH" | cut -f1))"

echo ""
echo "=========================================="
echo " 重建完成！"
echo " 输出: $SPLAT_PATH"
echo "=========================================="
