#!/bin/bash
# ============================================================
# 一键重建脚本：照片目录 -> .splat 文件
#
# 用法:
#   bash reconstruct.sh <scene_dir> [iterations]
#
# 参数:
#   scene_dir   场景根目录，必须包含 input/ 子目录（放原始照片）
#               如果已有 sparse/0/ (COLMAP 结果)，自动跳过 COLMAP
#   iterations  3DGS 训练迭代数，默认 7000（demo 质量）
#
# 输出:
#   <scene_dir>/output_<N>/point_cloud/iteration_<N>/point_cloud.ply
#   <scene_dir>/<scene_name>.splat
# ============================================================

set -euo pipefail

SCENE_DIR="${1:?用法: bash reconstruct.sh <scene_dir> [iterations]}"
ITERATIONS="${2:-7000}"
SCENE_NAME="$(basename "$SCENE_DIR")"
GS_DIR="${GS_DIR:-/root/gaussian-splatting}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
CONVERT_SCRIPT="${CONVERT_SCRIPT:-/root/convert_ply_to_splat.py}"
COLMAP_NO_GPU="${COLMAP_NO_GPU:-1}"
OUTPUT_DIR="$SCENE_DIR/output_${ITERATIONS}"

echo "=========================================="
echo " 筑忆重建管线启动"
echo " 场景: $SCENE_NAME"
echo " 迭代: $ITERATIONS"
echo " 输出: $OUTPUT_DIR"
echo "=========================================="

if [ ! -d "$SCENE_DIR/input" ]; then
    echo "❌ 未找到 $SCENE_DIR/input/ 目录，请将图像放入该目录"
    exit 1
fi

IMG_COUNT=$(
    find "$SCENE_DIR/input" \( -name "*.jpg" -o -name "*.JPG" -o -name "*.png" -o -name "*.PNG" \) | wc -l
)
echo "  找到 $IMG_COUNT 张图像"

MIN_IMAGES="${MIN_IMAGES:-3}"

if [ "$IMG_COUNT" -lt "$MIN_IMAGES" ]; then
    echo "❌ 图像数量不足（$IMG_COUNT < $MIN_IMAGES），重建质量无法保证"
    exit 1
fi

if [ -d "$SCENE_DIR/sparse/0" ]; then
    echo ""
    echo "[COLMAP] 检测到已有稀疏重建结果，跳过 COLMAP ✓"
    echo "  sparse/0/ 包含:"
    ls "$SCENE_DIR/sparse/0/" 2>/dev/null || true
else
    echo ""
    echo "[COLMAP] 开始特征提取与稀疏重建..."
    cd "$GS_DIR"
    if [ "$COLMAP_NO_GPU" = "1" ]; then
        "$PYTHON_BIN" convert.py -s "$SCENE_DIR" --no_gpu
    else
        "$PYTHON_BIN" convert.py -s "$SCENE_DIR"
    fi

    if [ ! -d "$SCENE_DIR/sparse/0" ]; then
        echo "❌ COLMAP 重建失败：未生成 sparse/0/ 目录"
        echo "  可能原因：图像重叠不足、图像质量差、相机运动过快"
        exit 1
    fi

    IMG_REGISTERED=$(
        awk 'BEGIN { count = 0 } !/^#/ && NF { count += 1 } END { print int(count / 2) }' \
            "$SCENE_DIR/sparse/0/images.txt" 2>/dev/null || echo "?"
    )
    echo "  ✅ COLMAP 完成，成功注册 $IMG_REGISTERED 张图像"
fi

echo ""
echo "[3DGS] 开始训练（$ITERATIONS 迭代）..."
cd "$GS_DIR"

"$PYTHON_BIN" train.py \
    -s "$SCENE_DIR" \
    -m "$OUTPUT_DIR" \
    --iterations "$ITERATIONS" \
    --densify_until_iter $(( ITERATIONS * 5 / 7 )) \
    --save_iterations "$ITERATIONS" \
    --test_iterations "$ITERATIONS"

PLY_PATH="$OUTPUT_DIR/point_cloud/iteration_${ITERATIONS}/point_cloud.ply"

if [ ! -f "$PLY_PATH" ]; then
    echo "❌ 训练失败：未找到输出 PLY 文件"
    exit 1
fi

PLY_SIZE=$(du -sh "$PLY_PATH" | cut -f1)
echo "  ✅ 训练完成，PLY 文件: $PLY_SIZE"

echo ""
echo "[转换] PLY -> .splat..."
SPLAT_PATH="$SCENE_DIR/${SCENE_NAME}.splat"

"$PYTHON_BIN" "$CONVERT_SCRIPT" "$PLY_PATH" "$SPLAT_PATH"

SPLAT_SIZE=$(du -sh "$SPLAT_PATH" | cut -f1)
echo "  ✅ 转换完成: $SPLAT_PATH ($SPLAT_SIZE)"

echo ""
echo "=========================================="
echo " 重建完成！"
echo " 输出文件: $SPLAT_PATH"
echo ""
echo " 下一步: 将此文件下载到本地，"
echo "  放入 frontend/public/models/ 目录"
echo "=========================================="
