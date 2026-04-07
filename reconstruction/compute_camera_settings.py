#!/usr/bin/env python3
"""
compute_camera_settings.py
==========================
从 COLMAP sparse/0/images.bin 和 3DGS 输出 PLY，
计算适合 buildings.json 的 cameraSettings。

用法:
  python3 compute_camera_settings.py <scene_dir> [--iterations N]

scene_dir 结构:
  <scene_dir>/sparse/0/images.bin
  <scene_dir>/output_<N>/point_cloud/iteration_<N>/point_cloud.ply

输出: 直接可以粘贴到 buildings.json 的 cameraSettings JSON。

原理:
  1. 从 images.bin 读所有相机位姿，选距离中位点最近的那个
  2. 将相机位置和 lookAt 应用与 convert_ply_to_splat.py 相同的变换：
     - 减去场景中心（top-10% 高透明度 Gaussian 的中位坐标）
     - 乘以 outdoor_arch 旋转矩阵 R = [[0,0,-1],[-1,0,0],[0,1,0]]
"""

import argparse, struct, json
import numpy as np
from pathlib import Path

try:
    from plyfile import PlyData
except ImportError:
    raise SystemExit("请先安装 plyfile: pip install plyfile")

# outdoor_arch 旋转矩阵（与 convert_ply_to_splat.py 保持一致）
R_ARCH = np.array([[0, 0, -1], [-1, 0, 0], [0, 1, 0]], dtype=float)


def read_images_bin(path: Path):
    cams = []
    with open(path, "rb") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        for _ in range(n):
            struct.unpack("<I", f.read(4))
            qw, qx, qy, qz = struct.unpack("<4d", f.read(32))
            tx, ty, tz = struct.unpack("<3d", f.read(24))
            struct.unpack("<I", f.read(4))
            name = b""
            while True:
                c = f.read(1)
                if c == b"\x00":
                    break
                name += c
            n_pts = struct.unpack("<Q", f.read(8))[0]
            f.read(n_pts * 24)
            cams.append((qw, qx, qy, qz, tx, ty, tz, name.decode()))
    return cams


def quat_to_R(qw, qx, qy, qz):
    return np.array([
        [1 - 2 * (qy**2 + qz**2), 2 * (qx*qy - qz*qw), 2 * (qx*qz + qy*qw)],
        [2 * (qx*qy + qz*qw),     1 - 2 * (qx**2 + qz**2), 2 * (qy*qz - qx*qw)],
        [2 * (qx*qz - qy*qw),     2 * (qy*qz + qx*qw), 1 - 2 * (qx**2 + qy**2)],
    ])


def scene_center_from_ply(ply_path: Path):
    ply = PlyData.read(str(ply_path))
    v = ply["vertex"]
    x, y, z = np.array(v["x"]), np.array(v["y"]), np.array(v["z"])
    opacity = 1 / (1 + np.exp(-np.array(v["opacity"])))
    mask = opacity > np.percentile(opacity, 90)
    return np.array([np.median(x[mask]), np.median(y[mask]), np.median(z[mask])])


def find_ply(scene_dir: Path, iterations: int) -> Path:
    """Find point_cloud.ply, supporting both output_10000 and output_10k naming."""
    # Try exact numeric name first
    candidate = scene_dir / f"output_{iterations}" / "point_cloud" / f"iteration_{iterations}" / "point_cloud.ply"
    if candidate.exists():
        return candidate
    # Glob for any output_* directory
    plys = sorted(scene_dir.glob("output_*/point_cloud/iteration_*/point_cloud.ply"))
    if not plys:
        raise FileNotFoundError(f"在 {scene_dir} 下找不到任何 point_cloud.ply")
    # Prefer the one with highest iteration number
    def _iter_num(p):
        try:
            return int(p.parent.name.replace("iteration_", ""))
        except ValueError:
            return 0
    return max(plys, key=_iter_num)


def compute(scene_dir: Path, iterations: int):
    images_bin = scene_dir / "sparse" / "0" / "images.bin"
    ply_path = find_ply(scene_dir, iterations)

    if not images_bin.exists():
        raise FileNotFoundError(f"找不到 {images_bin}")

    scene_center = scene_center_from_ply(ply_path)
    print(f"场景中心: {scene_center}")

    cams = read_images_bin(images_bin)
    positions_world = []
    for qw, qx, qy, qz, tx, ty, tz, _ in cams:
        R = quat_to_R(qw, qx, qy, qz)
        positions_world.append(-R.T @ np.array([tx, ty, tz]))

    # 从所有真实相机中选一个代表性位置：距所有相机位置中点最近的那个。
    # 这保证选出的是真实拍摄位置，不是合成/插值点。
    median_pos = np.median(positions_world, axis=0)
    dists = [np.linalg.norm(p - median_pos) for p in positions_world]
    idx = int(np.argmin(dists))

    qw, qx, qy, qz, tx, ty, tz, name = cams[idx]
    R = quat_to_R(qw, qx, qy, qz)
    C_world = -R.T @ np.array([tx, ty, tz])

    up_world = R.T @ np.array([0, -1, 0])   # COLMAP -Y = 物理上方

    C_splat  = R_ARCH @ (C_world - scene_center)
    up_splat = R_ARCH @ up_world

    # lookAt 固定为场景中心（origin），场景已居中到原点。
    # 不使用相机的 COLMAP 朝向，避免拍摄时相机略微偏转导致初始视角歪。
    lookAt_splat = np.array([0.0, 0.0, 0.0])

    print(f"使用相机: {name}  (距中位点 {dists[idx]:.3f})")

    settings = {
        "up":       [round(float(v), 3) for v in up_splat],
        "position": [round(float(v), 3) for v in C_splat],
        "lookAt":   [round(float(v), 3) for v in lookAt_splat],
    }
    print("\ncameraSettings (粘贴到 buildings.json):")
    print(json.dumps(settings, indent=2))
    # Machine-readable single-line output for subprocess parsing
    print(f"\n__CAMERA_JSON__={json.dumps(settings)}")
    return settings


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="从 COLMAP 位姿计算 SplatViewer 相机参数")
    parser.add_argument("scene_dir", help="场景根目录（含 sparse/0/ 和 output_N/）")
    parser.add_argument("--iterations", type=int, default=10000, help="3DGS 训练迭代数，默认 10000")
    args = parser.parse_args()
    compute(Path(args.scene_dir), args.iterations)
