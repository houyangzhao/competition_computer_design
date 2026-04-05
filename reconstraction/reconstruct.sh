#!/bin/bash
# ============================================================
# 一键重建脚本：照片目录 → .splat 文件
#
# 用法:
#   bash reconstruct.sh <scene_dir> [iterations]
#
# 参数:
#   scene_dir   场景根目录，必须包含 input/ 子目录（放原始照片）
#               如果已有 sparse/0/ (COLMAP 结果)，自动跳过 COLMAP
#   iterations  3DGS 训练迭代数，默认 7000（demo质量）
#               高质量用 30000（耗时约 3-4 倍）
#
# 目录结构约定:
#   <scene_dir>/
#   ├── input/          ← 放入 JPG/PNG 图像（50-300 张）
#   ├── sparse/         ← COLMAP 稀疏重建结果（存在则跳过 COLMAP）
#   └── output/         ← 3DGS 训练输出（脚本自动创建）
#
# 输出:
#   <scene_dir>/output/point_cloud/iteration_<N>/point_cloud.ply
#   <scene_dir>/<scene_name>.splat   ← 最终 Web 可用文件
# ============================================================
set -e

# ── 参数解析 ─────────────────────────────────────────────────
SCENE_DIR="${1:?用法: bash reconstruct.sh <scene_dir> [iterations]}"
ITERATIONS="${2:-7000}"
SCENE_NAME="$(basename "$SCENE_DIR")"
GS_DIR="/root/gaussian-splatting"
OUTPUT_DIR="$SCENE_DIR/output_${ITERATIONS}"

echo "=========================================="
echo " 筑忆重建管线启动"
echo " 场景: $SCENE_NAME"
echo " 迭代: $ITERATIONS"
echo " 输出: $OUTPUT_DIR"
echo "=========================================="

# ── Step 1: 检查输入 ─────────────────────────────────────────
if [ ! -d "$SCENE_DIR/input" ]; then
    echo "❌ 未找到 $SCENE_DIR/input/ 目录，请将图像放入该目录"
    exit 1
fi

IMG_COUNT=$(find "$SCENE_DIR/input" -name "*.jpg" -o -name "*.JPG" \
            -o -name "*.png" -o -name "*.PNG" | wc -l)
echo "  找到 $IMG_COUNT 张图像"

if [ "$IMG_COUNT" -lt 20 ]; then
    echo "❌ 图像数量不足（$IMG_COUNT < 20），重建质量无法保证"
    exit 1
fi

# ── Step 2: COLMAP（如果已有稀疏重建则跳过）──────────────────
if [ -d "$SCENE_DIR/sparse/0" ]; then
    echo ""
    echo "[COLMAP] 检测到已有稀疏重建结果，跳过 COLMAP ✓"
    echo "  sparse/0/ 包含:"
    ls "$SCENE_DIR/sparse/0/" 2>/dev/null || true
else
    echo ""
    echo "[COLMAP] 开始特征提取与稀疏重建..."
    cd "$GS_DIR"

    # convert.py 是 gaussian-splatting 官方提供的 COLMAP 封装脚本
    python convert.py -s "$SCENE_DIR"

    if [ ! -d "$SCENE_DIR/sparse/0" ]; then
        echo "❌ COLMAP 重建失败：未生成 sparse/0/ 目录"
        echo "  可能原因：图像重叠不足、图像质量差、相机运动过快"
        exit 1
    fi

    IMG_REGISTERED=$(cat "$SCENE_DIR/sparse/0/images.txt" 2>/dev/null \
                     | grep -v "^#" | awk 'NR%2==1' | wc -l || echo "?")
    echo "  ✅ COLMAP 完成，成功注册 $IMG_REGISTERED 张图像"
fi

# ── Step 3: 3DGS 训练 ────────────────────────────────────────
echo ""
echo "[3DGS] 开始训练（$ITERATIONS 迭代）..."
cd "$GS_DIR"

python train.py \
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

# ── Step 4: PLY → .splat ─────────────────────────────────────
echo ""
echo "[转换] PLY → .splat..."
SPLAT_PATH="$SCENE_DIR/${SCENE_NAME}.splat"

python /root/convert_ply_to_splat.py "$PLY_PATH" "$SPLAT_PATH"

SPLAT_SIZE=$(du -sh "$SPLAT_PATH" | cut -f1)
echo "  ✅ 转换完成: $SPLAT_PATH ($SPLAT_SIZE)"

# ── 完成 ──────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo " 重建完成！"
echo " 输出文件: $SPLAT_PATH"
echo ""
echo " 下一步: 将此文件下载到本地，"
echo "  放入 frontend/public/models/ 目录"
echo "=========================================="
