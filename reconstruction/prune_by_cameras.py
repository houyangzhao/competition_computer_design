"""
prune_by_cameras.py
===================
基于 COLMAP 相机位置对 3DGS PLY 做后处理剪枝。

原理：
  漂浮点（floaters）的特征是距离所有训练相机都很远。
  读取 COLMAP images.bin 中的相机位置，对每个 Gaussian 计算
  到最近相机的距离，移除超过阈值的点。

  相对场景中心的距离剪枝适用于单建筑，
  相机近邻剪枝适用于多建筑/非单一中心场景。

用法:
  python prune_by_cameras.py <input.ply> <images.bin> <output.ply> [--factor N]

  --factor N: 阈值 = 相机轨迹包围盒对角线长度 × N（默认 0.5）
              N 越小越激进，N 越大越保守
"""

import struct
import argparse
import numpy as np
from plyfile import PlyData, PlyElement
from pathlib import Path


# ─── COLMAP binary reader ────────────────────────────────────────────────────

def read_next_bytes(f, num_bytes, format_char_sequence, endian_character="<"):
    data = f.read(num_bytes)
    return struct.unpack(endian_character + format_char_sequence, data)


def read_images_bin(path: str) -> np.ndarray:
    """读取 COLMAP images.bin，返回世界坐标系下的相机位置 (N, 3)"""
    camera_positions = []
    with open(path, "rb") as f:
        num_images = read_next_bytes(f, 8, "Q")[0]
        for _ in range(num_images):
            # image_id, qw, qx, qy, qz, tx, ty, tz, camera_id
            props = read_next_bytes(f, 64, "idddddddi")
            qw, qx, qy, qz = props[1], props[2], props[3], props[4]
            tx, ty, tz = props[5], props[6], props[7]

            # 相机在世界坐标系的位置: C = -R^T * t
            # R 从四元数计算
            R = np.array([
                [1 - 2*(qy**2 + qz**2),     2*(qx*qy - qw*qz),     2*(qx*qz + qw*qy)],
                [    2*(qx*qy + qw*qz), 1 - 2*(qx**2 + qz**2),     2*(qy*qz - qw*qx)],
                [    2*(qx*qz - qw*qy),     2*(qy*qz + qw*qx), 1 - 2*(qx**2 + qy**2)],
            ])
            t = np.array([tx, ty, tz])
            C = -R.T @ t
            camera_positions.append(C)

            # 跳过图片名（\0 结尾字符串）
            while True:
                char = f.read(1)
                if char == b"\x00":
                    break

            # 跳过 2D 点
            num_points2D = read_next_bytes(f, 8, "Q")[0]
            f.read(24 * num_points2D)  # x, y, point3D_id: double, double, long long

    return np.array(camera_positions, dtype=np.float32)


# ─── PLY I/O ─────────────────────────────────────────────────────────────────

def load_ply(path: str) -> PlyData:
    return PlyData.read(path)


def save_ply(plydata: PlyData, vertex_mask: np.ndarray, path: str) -> None:
    v = plydata["vertex"]
    # 过滤所有 vertex 属性
    new_data = {prop.name: np.array(v[prop.name])[vertex_mask]
                for prop in v.properties}

    # 重建 PlyElement
    dtype = [(prop.name, v[prop.name].dtype) for prop in v.properties]
    new_vertex = np.zeros(vertex_mask.sum(), dtype=dtype)
    for prop in v.properties:
        new_vertex[prop.name] = new_data[prop.name]

    new_element = PlyElement.describe(new_vertex, "vertex")
    PlyData([new_element], text=False).write(path)


# ─── main ────────────────────────────────────────────────────────────────────

def prune(ply_path: str, images_bin: str, output_ply: str, factor: float) -> None:
    print(f"读取相机位置: {images_bin}")
    cam_pos = read_images_bin(images_bin)
    print(f"  共 {len(cam_pos)} 个训练视角")

    # 相机轨迹包围盒
    cam_min = cam_pos.min(axis=0)
    cam_max = cam_pos.max(axis=0)
    cam_diag = np.linalg.norm(cam_max - cam_min)
    threshold = cam_diag * factor
    print(f"  相机轨迹对角线: {cam_diag:.2f}，剪枝阈值: {threshold:.2f} (factor={factor})")

    print(f"读取 PLY: {ply_path}")
    plydata = load_ply(ply_path)
    v = plydata["vertex"]
    xyz = np.stack([v["x"], v["y"], v["z"]], axis=1).astype(np.float32)
    n = len(xyz)
    print(f"  共 {n:,} 个 Gaussians")

    # 批量计算每个 Gaussian 到最近相机的距离
    # 分批处理避免内存爆炸 (N_gauss × N_cam 矩阵)
    batch = 50000
    min_dists = np.empty(n, dtype=np.float32)
    for i in range(0, n, batch):
        chunk = xyz[i:i+batch]  # (B, 3)
        dists = np.linalg.norm(
            chunk[:, None, :] - cam_pos[None, :, :], axis=2
        )  # (B, N_cam)
        min_dists[i:i+batch] = dists.min(axis=1)

    mask = min_dists < threshold
    kept = mask.sum()
    removed = n - kept
    print(f"  移除 {removed:,} 个漂浮点 ({removed/n*100:.1f}%)")
    print(f"  保留 {kept:,} 个 Gaussians")

    print(f"保存: {output_ply}")
    Path(output_ply).parent.mkdir(parents=True, exist_ok=True)
    save_ply(plydata, mask, output_ply)
    print("✅ 完成")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input_ply", help="输入 PLY（3DGS 训练输出）")
    parser.add_argument("images_bin", help="COLMAP images.bin 路径")
    parser.add_argument("output_ply", help="输出 PLY（已剪枝）")
    parser.add_argument(
        "--factor", type=float, default=0.5,
        help="阈值 = 相机包围盒对角线 × factor（默认 0.5，越小越激进）"
    )
    args = parser.parse_args()
    prune(args.input_ply, args.images_bin, args.output_ply, args.factor)
