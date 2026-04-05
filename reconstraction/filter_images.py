"""
Lightweight image preprocessing for reconstruction input.

Current behavior:
- scan JPEG/PNG files from source directory
- if GPS metadata exists and a range is provided, keep matched files
- if nothing matches or GPS is absent, fall back to uniform sampling
- copy selected images into destination directory
"""

import argparse
import shutil
from pathlib import Path

try:
    from PIL import Image
    from PIL.ExifTags import GPSTAGS, TAGS
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


def image_files(src_dir: Path) -> list[Path]:
    return sorted(src_dir.glob("**/*.[jJ][pP][gG]")) + sorted(src_dir.glob("**/*.[pP][nN][gG]"))


def get_gps(image_path: Path):
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
            value = float(d) + float(m) / 60 + float(s) / 3600
            if ref in ("S", "W"):
                value = -value
            return value

        if "GPSLatitude" in gps_info and "GPSLongitude" in gps_info:
            lat = to_decimal(gps_info["GPSLatitude"], gps_info.get("GPSLatitudeRef", "N"))
            lon = to_decimal(gps_info["GPSLongitude"], gps_info.get("GPSLongitudeRef", "E"))
            return lat, lon
    except Exception:
        return None
    return None


def uniform_sample(images: list[Path], limit: int) -> list[Path]:
    if len(images) <= limit:
        return images
    step = max(1, len(images) // limit)
    return images[::step][:limit]


def filter_by_gps(src_dir: Path, dst_dir: Path, lat_min: float, lat_max: float, lon_min: float, lon_max: float, limit: int):
    images = image_files(src_dir)
    dst_dir.mkdir(parents=True, exist_ok=True)

    matched: list[Path] = []
    for image in images:
        coords = get_gps(image)
        if coords and lat_min <= coords[0] <= lat_max and lon_min <= coords[1] <= lon_max:
            matched.append(image)

    if not matched:
        matched = uniform_sample(images, limit)
    else:
        matched = uniform_sample(matched, limit)

    for image in matched:
        shutil.copy2(image, dst_dir / image.name)

    print(f"selected {len(matched)} images -> {dst_dir}")
    return len(matched)


def main():
    parser = argparse.ArgumentParser(description="Filter reconstruction input images")
    parser.add_argument("--src", required=True)
    parser.add_argument("--dst", required=True)
    parser.add_argument("--lat-min", type=float, default=0.0)
    parser.add_argument("--lat-max", type=float, default=90.0)
    parser.add_argument("--lon-min", type=float, default=-180.0)
    parser.add_argument("--lon-max", type=float, default=180.0)
    parser.add_argument("--limit", type=int, default=300)
    args = parser.parse_args()

    src = Path(args.src)
    dst = Path(args.dst)
    if not src.exists():
        raise SystemExit(f"source directory not found: {src}")

    filter_by_gps(src, dst, args.lat_min, args.lat_max, args.lon_min, args.lon_max, args.limit)


if __name__ == "__main__":
    main()
