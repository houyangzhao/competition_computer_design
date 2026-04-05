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

用法:
  python convert_ply_to_splat.py <input.ply> <output.splat>
"""

import sys
import struct
import numpy as np
from plyfile import PlyData
from pathlib import Path


# 球谐函数 DC 系数 → RGB 的缩放常数
SH_C0 = 0.28209479177387814


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


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
    # 3DGS 存储的是 f_dc_0/1/2，对应 R/G/B 的 SH DC 系数
    rgb = np.stack([v["f_dc_0"], v["f_dc_1"], v["f_dc_2"]], axis=1)
    rgb = 0.5 + SH_C0 * rgb          # SH DC → linear color
    rgb = np.clip(rgb, 0.0, 1.0)
    data["rgb"] = rgb.astype(np.float32)

    # 不透明度：3DGS 存储 logit(opacity)，需要 sigmoid
    data["opacity"] = sigmoid(np.array(v["opacity"])).astype(np.float32)

    # 旋转四元数（w, x, y, z），需要归一化
    rot = np.stack([v["rot_0"], v["rot_1"], v["rot_2"], v["rot_3"]], axis=1).astype(np.float32)
    norm = np.linalg.norm(rot, axis=1, keepdims=True)
    data["rotation"] = rot / (norm + 1e-8)

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

    # color: RGB float [0,1] → uint8 [0,255]
    # alpha: opacity float [0,1] → uint8 [0,255]
    color_u8 = (data["rgb"] * 255).clip(0, 255).astype(np.uint8)
    alpha_u8 = (data["opacity"] * 255).clip(0, 255).astype(np.uint8).reshape(-1, 1)
    rgba_u8 = np.concatenate([color_u8, alpha_u8], axis=1)  # (N, 4)

    # rotation: float [-1,1] → uint8 [0,255]
    rot_u8 = ((data["rotation"] * 128) + 128).clip(0, 255).astype(np.uint8)  # (N, 4)

    # 逐字段拼接，使用 numpy 结构化数组提升速度
    buf = bytearray(n * 32)
    pos   = data["xyz"].tobytes()    # N × 3 × 4 bytes
    scale = data["scale"].tobytes()  # N × 3 × 4 bytes
    color = rgba_u8.tobytes()        # N × 4 × 1 bytes
    rot   = rot_u8.tobytes()         # N × 4 × 1 bytes

    # 交错写入（每 Gaussian 32 字节）
    # 用 numpy 结构化打包更快：
    structured = np.zeros(n, dtype=[
        ("px", np.float32), ("py", np.float32), ("pz", np.float32),
        ("sx", np.float32), ("sy", np.float32), ("sz", np.float32),
        ("cr", np.uint8),   ("cg", np.uint8),   ("cb", np.uint8), ("ca", np.uint8),
        ("rw", np.uint8),   ("rx", np.uint8),   ("ry", np.uint8), ("rz", np.uint8),
        # padding to 32 bytes: 3×4 + 3×4 + 4×1 + 4×1 = 12+12+4+4 = 32 ✓
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


def convert(ply_path: str, splat_path: str) -> None:
    print(f"读取 PLY: {ply_path}")
    data = load_gaussians(ply_path)
    n = len(data["xyz"])
    print(f"  共 {n:,} 个 Gaussians")

    print("按不透明度排序...")
    data = sort_by_opacity(data)

    # 过滤极低不透明度的 Gaussian（减小文件体积，提升渲染速度）
    threshold = 1.0 / 255.0
    mask = data["opacity"] > threshold
    filtered_n = mask.sum()
    if filtered_n < n:
        print(f"  过滤低不透明度 Gaussians: {n:,} → {filtered_n:,}")
        data = {k: v[mask] for k, v in data.items()}

    print(f"打包为 .splat 格式...")
    raw = pack_splat(data)

    out = Path(splat_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(raw)

    size_mb = len(raw) / 1024 / 1024
    print(f"✅ 输出: {splat_path} ({size_mb:.1f} MB, {filtered_n:,} Gaussians)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("用法: python convert_ply_to_splat.py <input.ply> <output.splat>")
        sys.exit(1)

    convert(sys.argv[1], sys.argv[2])
