"""
filter_images.py
================
从大规模无人机数据集（如 CULTURE3D 故宫）中，按 GPS 坐标范围
筛选特定建筑区域的图像子集，输出到新目录供 COLMAP + 3DGS 使用。

用法:
  # 按 GPS 范围筛选（推荐）
  python filter_images.py \\
    --src  /root/data/forbidden_city_raw/images \\
    --dst  /root/data/taihedian/input \\
    --lat-min 39.9155 --lat-max 39.9175 \\
    --lon-min 116.3960 --lon-max 116.3990 \\
    --limit 300

  # 不知道 GPS 范围时：先只扫描 EXIF，打印统计信息
  python filter_images.py \\
    --src /root/data/forbidden_city_raw/images \\
    --scan-only

太和殿大致 GPS 范围（参考值，可根据实际微调）:
  纬度: 39.9155 ~ 39.9175
  经度: 116.3960 ~ 116.3990
"""

import argparse
import shutil
from pathlib import Path

try:
    from PIL import Image
    from PIL.ExifTags import TAGS, GPSTAGS
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("警告: 未安装 Pillow，无法读取 GPS EXIF。pip install Pillow")


def get_gps(image_path: Path):
    """从 JPEG EXIF 中提取 GPS 坐标，返回 (lat, lon) 或 None"""
    if not HAS_PIL:
        return None
    try:
        img = Image.open(image_path)
        exif_data = img._getexif()
        if not exif_data:
            return None
        gps_info = {}
        for tag_id, value in exif_data.items():
            tag = TAGS.get(tag_id, tag_id)
            if tag == "GPSInfo":
                for gps_tag_id, gps_val in value.items():
                    gps_tag = GPSTAGS.get(gps_tag_id, gps_tag_id)
                    gps_info[gps_tag] = gps_val

        def to_decimal(dms, ref):
            d, m, s = dms
            val = float(d) + float(m) / 60 + float(s) / 3600
            if ref in ("S", "W"):
                val = -val
            return val

        if "GPSLatitude" in gps_info and "GPSLongitude" in gps_info:
            lat = to_decimal(gps_info["GPSLatitude"],  gps_info.get("GPSLatitudeRef", "N"))
            lon = to_decimal(gps_info["GPSLongitude"], gps_info.get("GPSLongitudeRef", "E"))
            return (lat, lon)
    except Exception:
        pass
    return None


def scan_gps(src_dir: Path):
    """扫描所有图像的 GPS，打印统计信息帮助确定范围"""
    images = sorted(src_dir.glob("**/*.[jJ][pP][gG]")) + \
             sorted(src_dir.glob("**/*.[pP][nN][gG]"))
    print(f"扫描 {len(images)} 张图像 GPS...")

    lats, lons = [], []
    no_gps = 0
    for i, p in enumerate(images):
        if i % 100 == 0:
            print(f"  {i}/{len(images)}...", end="\r")
        coords = get_gps(p)
        if coords:
            lats.append(coords[0])
            lons.append(coords[1])
        else:
            no_gps += 1

    print(f"\n有 GPS: {len(lats)} 张 | 无 GPS: {no_gps} 张")
    if lats:
        print(f"纬度范围: {min(lats):.6f} ~ {max(lats):.6f}")
        print(f"经度范围: {min(lons):.6f} ~ {max(lons):.6f}")
        print("\n提示：太和殿约在纬度 39.9155~39.9175, 经度 116.3960~116.3990")
        print("根据上面的范围，调整 --lat-min/max --lon-min/max 参数")


def filter_by_gps(src_dir: Path, dst_dir: Path,
                  lat_min: float, lat_max: float,
                  lon_min: float, lon_max: float,
                  limit: int):
    """按 GPS 范围过滤图像并复制到目标目录"""
    dst_dir.mkdir(parents=True, exist_ok=True)
    images = sorted(src_dir.glob("**/*.[jJ][pP][gG]")) + \
             sorted(src_dir.glob("**/*.[pP][nN][gG]"))
    print(f"共 {len(images)} 张图像，按 GPS 范围筛选...")

    matched = []
    for p in images:
        coords = get_gps(p)
        if coords and lat_min <= coords[0] <= lat_max \
                   and lon_min <= coords[1] <= lon_max:
            matched.append(p)

    print(f"GPS 范围内: {len(matched)} 张")

    if len(matched) > limit:
        # 均匀采样：从 matched 中每隔 step 取一张
        step = len(matched) // limit
        matched = matched[::step][:limit]
        print(f"均匀采样至 {len(matched)} 张（limit={limit}）")

    for p in matched:
        shutil.copy2(p, dst_dir / p.name)

    print(f"✅ 已复制 {len(matched)} 张图像到 {dst_dir}")
    return len(matched)


def main():
    parser = argparse.ArgumentParser(description="按 GPS 过滤故宫图像子集")
    parser.add_argument("--src", required=True, help="原始图像目录")
    parser.add_argument("--dst", help="输出目录（筛选后的图像）")
    parser.add_argument("--scan-only", action="store_true", help="只扫描 GPS 范围，不复制")
    parser.add_argument("--lat-min", type=float, default=39.9155)
    parser.add_argument("--lat-max", type=float, default=39.9175)
    parser.add_argument("--lon-min", type=float, default=116.3960)
    parser.add_argument("--lon-max", type=float, default=116.3990)
    parser.add_argument("--limit",   type=int,   default=300,
                        help="最多保留图像数（均匀采样），默认 300")
    args = parser.parse_args()

    src = Path(args.src)
    if not src.exists():
        print(f"❌ 目录不存在: {src}")
        return

    if args.scan_only:
        scan_gps(src)
        return

    if not args.dst:
        print("❌ 请指定 --dst 输出目录")
        return

    # 如果图像没有 GPS EXIF（部分相机不写），直接按数量均匀采样
    if not HAS_PIL:
        print("⚠️ 无法读取 GPS，改为均匀采样所有图像...")
        images = sorted(src.glob("**/*.[jJ][pP][gG]")) + \
                 sorted(src.glob("**/*.[pP][nN][gG]"))
        dst = Path(args.dst)
        dst.mkdir(parents=True, exist_ok=True)
        step = max(1, len(images) // args.limit)
        selected = images[::step][:args.limit]
        for p in selected:
            shutil.copy2(p, dst / p.name)
        print(f"✅ 均匀采样 {len(selected)} 张图像到 {dst}")
        return

    filter_by_gps(
        src, Path(args.dst),
        args.lat_min, args.lat_max,
        args.lon_min, args.lon_max,
        args.limit,
    )


if __name__ == "__main__":
    main()
