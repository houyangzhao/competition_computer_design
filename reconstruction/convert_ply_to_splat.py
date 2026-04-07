"""
convert_ply_to_splat.py
=======================
将 3D Gaussian Splatting 训练输出的 PLY 文件转换为 Web 端
@mkkellogg/gaussian-splats-3d 可直接加载的 .splat 二进制格式。

.splat 格式规范（antimatter15/splat）：
  每个 Gaussian 占 32 字节，按以下顺序紧密排列：
  ┌─────────────────────────────────────────────────────┐
  │ position  xyz     3 × float32   (12 bytes)           │
  │ scale     xyz     3 × float32   (12 bytes)           │
  │ color     RGBA    4 × uint8     ( 4 bytes)           │
  │ rotation  wxyz    4 × uint8     ( 4 bytes)           │
  └─────────────────────────────────────────────────────┘

坐标系说明：
  3DGS/COLMAP 输出的世界坐标系通常 Y 朝下，WebGL 期望 Y 朝上。
  默认应用 --transform x180 修正（绕 X 轴旋转 180°，翻转 Y 和 Z）。

用法:
  python convert_ply_to_splat.py <input.ply> <output.splat> [--transform TRANSFORM]

  --transform 选项：
    none   不做任何变换（原始 COLMAP 坐标）
    x180   绕 X 轴旋转 180°，修正 Y 朝上（默认，推荐室外建筑场景）
    x-90   绕 X 轴旋转 -90°（备选）
    x90    绕 X 轴旋转 +90°（备选）
"""

import sys
import argparse
import numpy as np
from plyfile import PlyData
from pathlib import Path


# 球谐函数 DC 系数 → RGB 的缩放常数
SH_C0 = 0.28209479177387814


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def quat_multiply(q1: np.ndarray, q2: np.ndarray) -> np.ndarray:
    """
    四元数乘法 q1 ⊗ q2，格式均为 (N, 4) wxyz。
    若 q1 是单个四元数 (4,)，广播到所有 q2。
    """
    w1, x1, y1, z1 = q1[..., 0], q1[..., 1], q1[..., 2], q1[..., 3]
    w2, x2, y2, z2 = q2[:, 0], q2[:, 1], q2[:, 2], q2[:, 3]
    return np.stack([
        w1*w2 - x1*x2 - y1*y2 - z1*z2,
        w1*x2 + x1*w2 + y1*z2 - z1*y2,
        w1*y2 - x1*z2 + y1*w2 + z1*x2,
        w1*z2 + x1*y2 - y1*x2 + z1*w2,
    ], axis=1)


# 预定义变换：(旋转矩阵 3×3, 旋转四元数 wxyz)
TRANSFORMS = {
    "none": (
        np.eye(3, dtype=np.float32),
        np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32),
    ),
    # 绕 X 轴 180°：Y → -Y，Z → -Z
    # 修正 COLMAP（Y 朝下）→ WebGL（Y 朝上），适合室外建筑俯拍场景
    "x180": (
        np.array([[1, 0, 0], [0, -1, 0], [0, 0, -1]], dtype=np.float32),
        np.array([0.0, 1.0, 0.0, 0.0], dtype=np.float32),  # (w,x,y,z)
    ),
    # 绕 X 轴 -90°：Y → Z，Z → -Y
    "x-90": (
        np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=np.float32),
        np.array([0.7071068, -0.7071068, 0.0, 0.0], dtype=np.float32),
    ),
    # 绕 X 轴 +90°：Y → -Z，Z → Y
    "x90": (
        np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=np.float32),
        np.array([0.7071068, 0.7071068, 0.0, 0.0], dtype=np.float32),
    ),
    # 室外建筑专用（Zhantan等）：X→朝下, Y→朝向观察者, Z→朝左
    # 矩阵 [[0,0,-1],[-1,0,0],[0,1,0]]，四元数 (0.5, 0.5, -0.5, -0.5)
    "outdoor_arch": (
        np.array([[0, 0, -1], [-1, 0, 0], [0, 1, 0]], dtype=np.float32),
        np.array([0.5, 0.5, -0.5, -0.5], dtype=np.float32),
    ),
}


def load_gaussians(ply_path: str) -> dict:
    """从 3DGS 输出的 PLY 文件读取所有 Gaussian 属性"""
    plydata = PlyData.read(ply_path)
    v = plydata["vertex"]

    data = {}
    data["xyz"] = np.stack([v["x"], v["y"], v["z"]], axis=1).astype(np.float32)

    # 尺度：3DGS 存储 log(scale)，需要还原
    data["scale"] = np.exp(
        np.stack([v["scale_0"], v["scale_1"], v["scale_2"]], axis=1)
    ).astype(np.float32)

    # 颜色：从球谐 DC 分量还原 RGB，再 sigmoid（颜色激活）
    rgb = np.stack([v["f_dc_0"], v["f_dc_1"], v["f_dc_2"]], axis=1)
    rgb = 0.5 + SH_C0 * rgb
    rgb = np.clip(rgb, 0.0, 1.0)
    data["rgb"] = rgb.astype(np.float32)

    # 不透明度：3DGS 存储 logit(opacity)，需要 sigmoid
    data["opacity"] = sigmoid(np.array(v["opacity"])).astype(np.float32)

    # 旋转四元数（w, x, y, z），需要归一化
    rot = np.stack([v["rot_0"], v["rot_1"], v["rot_2"], v["rot_3"]], axis=1).astype(np.float32)
    norm = np.linalg.norm(rot, axis=1, keepdims=True)
    data["rotation"] = rot / (norm + 1e-8)

    return data


def apply_transform(data: dict, transform_name: str) -> dict:
    """对位置和旋转四元数应用全局坐标系变换"""
    if transform_name == "none":
        return data

    R, q_rot = TRANSFORMS[transform_name]
    print(f"  应用坐标变换: {transform_name}")

    # 旋转位置
    data["xyz"] = (data["xyz"] @ R.T)

    # 旋转四元数：q_new = q_rot ⊗ q_gaussian
    data["rotation"] = quat_multiply(q_rot, data["rotation"])
    # 重新归一化
    norm = np.linalg.norm(data["rotation"], axis=1, keepdims=True)
    data["rotation"] = data["rotation"] / (norm + 1e-8)

    return data


def sort_by_opacity(data: dict) -> dict:
    """按不透明度从高到低排序，提升 Web 端渲染质量"""
    order = np.argsort(-data["opacity"])
    return {k: v[order] for k, v in data.items()}


def pack_splat(data: dict) -> bytes:
    """
    将 Gaussian 属性打包为 .splat 二进制格式。
    每个 Gaussian 32 字节：
      position(3×f32) + scale(3×f32) + color(4×u8) + rotation(4×u8)
    """
    n = len(data["xyz"])
    print(f"  打包 {n:,} 个 Gaussians...")

    color_u8 = (data["rgb"] * 255).clip(0, 255).astype(np.uint8)
    alpha_u8 = (data["opacity"] * 255).clip(0, 255).astype(np.uint8).reshape(-1, 1)
    rgba_u8 = np.concatenate([color_u8, alpha_u8], axis=1)  # (N, 4)

    rot_u8 = ((data["rotation"] * 128) + 128).clip(0, 255).astype(np.uint8)  # (N, 4)

    structured = np.zeros(n, dtype=[
        ("px", np.float32), ("py", np.float32), ("pz", np.float32),
        ("sx", np.float32), ("sy", np.float32), ("sz", np.float32),
        ("cr", np.uint8),   ("cg", np.uint8),   ("cb", np.uint8), ("ca", np.uint8),
        ("rw", np.uint8),   ("rx", np.uint8),   ("ry", np.uint8), ("rz", np.uint8),
    ])

    structured["px"] = data["xyz"][:, 0]
    structured["py"] = data["xyz"][:, 1]
    structured["pz"] = data["xyz"][:, 2]
    structured["sx"] = data["scale"][:, 0]
    structured["sy"] = data["scale"][:, 1]
    structured["sz"] = data["scale"][:, 2]
    structured["cr"] = rgba_u8[:, 0]
    structured["cg"] = rgba_u8[:, 1]
    structured["cb"] = rgba_u8[:, 2]
    structured["ca"] = rgba_u8[:, 3]
    structured["rw"] = rot_u8[:, 0]
    structured["rx"] = rot_u8[:, 1]
    structured["ry"] = rot_u8[:, 2]
    structured["rz"] = rot_u8[:, 3]

    return structured.tobytes()


def center_scene(data: dict) -> dict:
    """将场景中心（高不透明度 Gaussian 的加权中位数）平移到原点"""
    # 用不透明度加权，取各轴中位数作为场景中心（比均值更鲁棒，抗漂浮噪点）
    weights = data["opacity"]
    order = np.argsort(weights)[::-1]
    top_n = max(1, len(order) // 10)  # 用前 10% 高不透明度点估计中心
    top_xyz = data["xyz"][order[:top_n]]
    center = np.median(top_xyz, axis=0)
    print(f"  场景中心: ({center[0]:.2f}, {center[1]:.2f}, {center[2]:.2f}) → 平移到原点")
    data["xyz"] = data["xyz"] - center
    return data


def prune_gaussians(data: dict, min_opacity: float = 0.004,
                     max_scale: float | None = None,
                     max_distance: float | None = None,
                     max_gaussians: int | None = None) -> dict:
    """
    多策略裁剪低贡献高斯体。

    - min_opacity:  不透明度低于此值的高斯体被移除（默认 1/255 ≈ 0.004）
    - max_scale:    三轴尺度的最大值超过此阈值的被移除（过大的背景填充噪声）
    - max_distance: 距场景中心距离超过此值的被移除（漂浮噪点）
    - max_gaussians: 按不透明度排序后只保留前 N 个（硬上限）
    """
    n = len(data["xyz"])
    mask = np.ones(n, dtype=bool)

    # 1) 不透明度裁剪
    opacity_mask = data["opacity"] > min_opacity
    cut = n - opacity_mask.sum()
    if cut > 0:
        print(f"  [裁剪] 不透明度 < {min_opacity:.3f}: 移除 {cut:,}")
    mask &= opacity_mask

    # 2) 尺度裁剪
    if max_scale is not None:
        scale_max = data["scale"].max(axis=1)
        scale_mask = scale_max < max_scale
        cut = mask.sum() - (mask & scale_mask).sum()
        if cut > 0:
            print(f"  [裁剪] 尺度 > {max_scale:.4f}: 移除 {cut:,}")
        mask &= scale_mask

    # 3) 距离裁剪（基于高不透明度点的中位中心）
    if max_distance is not None:
        top_n = max(1, n // 10)
        top_idx = np.argsort(-data["opacity"])[:top_n]
        center = np.median(data["xyz"][top_idx], axis=0)
        dist = np.linalg.norm(data["xyz"] - center, axis=1)
        dist_mask = dist < max_distance
        cut = mask.sum() - (mask & dist_mask).sum()
        if cut > 0:
            print(f"  [裁剪] 距中心 > {max_distance:.1f}: 移除 {cut:,}")
        mask &= dist_mask

    data = {k: v[mask] for k, v in data.items()}

    # 4) 数量硬上限（按不透明度保留 top N）
    if max_gaussians is not None and len(data["xyz"]) > max_gaussians:
        order = np.argsort(-data["opacity"])[:max_gaussians]
        order = np.sort(order)  # 保持空间局部性
        before = len(data["xyz"])
        data = {k: v[order] for k, v in data.items()}
        print(f"  [裁剪] 数量上限 {max_gaussians:,}: {before:,} → {len(data['xyz']):,}")

    kept = len(data["xyz"])
    removed = n - kept
    pct = removed / n * 100 if n > 0 else 0
    print(f"  裁剪总计: {n:,} → {kept:,} (移除 {removed:,}, {pct:.1f}%)")
    return data


def convert(ply_path: str, splat_path: str, transform: str = "x180", center: bool = True,
            min_opacity: float = 0.004, max_scale: float | None = None,
            max_distance: float | None = None, max_gaussians: int | None = None) -> None:
    print(f"读取 PLY: {ply_path}")
    data = load_gaussians(ply_path)
    n = len(data["xyz"])
    print(f"  共 {n:,} 个 Gaussians")

    print("按不透明度排序...")
    data = sort_by_opacity(data)

    # 多策略裁剪
    print("裁剪低贡献高斯体...")
    data = prune_gaussians(data, min_opacity=min_opacity, max_scale=max_scale,
                           max_distance=max_distance, max_gaussians=max_gaussians)

    # 平移场景中心到原点
    if center:
        data = center_scene(data)

    # 应用坐标系变换
    data = apply_transform(data, transform)

    print(f"打包为 .splat 格式...")
    raw = pack_splat(data)

    out = Path(splat_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(raw)

    final_n = len(data["xyz"])
    size_mb = len(raw) / 1024 / 1024
    print(f"✅ 输出: {splat_path} ({size_mb:.1f} MB, {final_n:,} Gaussians)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert 3DGS PLY to .splat")
    parser.add_argument("input", help="输入 PLY 文件路径")
    parser.add_argument("output", help="输出 .splat 文件路径")
    parser.add_argument(
        "--transform",
        choices=list(TRANSFORMS.keys()),
        default="x180",
        help="坐标系变换（默认 x180：绕 X 轴 180°，修正 COLMAP Y 朝下 → WebGL Y 朝上）",
    )
    parser.add_argument(
        "--no-center",
        action="store_true",
        help="不自动将场景中心平移到原点",
    )
    parser.add_argument(
        "--min-opacity",
        type=float,
        default=0.004,
        help="不透明度裁剪阈值（默认 0.004；推荐精简用 0.05~0.15）",
    )
    parser.add_argument(
        "--max-scale",
        type=float,
        default=None,
        help="单轴尺度上限，超过的视为背景噪声（推荐 0.03~0.1）",
    )
    parser.add_argument(
        "--max-distance",
        type=float,
        default=None,
        help="距场景中心最大距离，超过的视为漂浮噪点",
    )
    parser.add_argument(
        "--max-gaussians",
        type=int,
        default=None,
        help="高斯体数量硬上限，按不透明度保留 top N（如 2000000）",
    )
    args = parser.parse_args()
    convert(args.input, args.output, args.transform, center=not args.no_center,
            min_opacity=args.min_opacity, max_scale=args.max_scale,
            max_distance=args.max_distance, max_gaussians=args.max_gaussians)
