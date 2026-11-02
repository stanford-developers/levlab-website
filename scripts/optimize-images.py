#!/usr/bin/env python3
"""Regenerate the committed responsive image copies without changing originals.

Optional authoring tool, not part of the normal website build. Use Python 3 with
Pillow 13 installed, then run this script from any directory. For example:
    python -m pip install 'Pillow==13.0.0'
    python scripts/optimize-images.py

The normal Node build reads data/optimized-images.json and the committed WebP
files; it does not require Python, Pillow, or an image download.
"""

from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
TARGET_WIDTHS = (240, 480, 640, 960, 1440, 1920)
SOURCES = {
    "/images/cavity.jpg": "chamber",
    "/images/dy-banner.png": "dysprosium",
    "/images/cavmat-apparatus-clean.png": "cavmat",
    "/sites/default/files/Screenshot 2026-09-19 at 12.40.18\u202fPM.png": "news-associative-report",
    "/sites/default/files/LevAssocMem2025.png": "news-associative-memory",
    "/sites/default/files/BenLev2024_0.png": "news-ben-chair",
    "/sites/default/files/LevLabCavMat.png": "news-cavmat",
    "/sites/default/files/LevCastiHeadShot2.png": "news-castilleja",
}


def digest(content):
    return sha256(content).hexdigest()


def generate():
    output = PUBLIC / "images" / "optimized"
    output.mkdir(parents=True, exist_ok=True)
    manifest = {}
    original_bytes = 0
    derivative_bytes = 0
    for source, slug in SOURCES.items():
        original = (PUBLIC / source.lstrip("/")).read_bytes()
        original_bytes += len(original)
        with Image.open(BytesIO(original)) as opened:
            # Match browser-visible orientation; never crop or upscale a source.
            image = ImageOps.exif_transpose(opened)
            icc_profile = image.info.get("icc_profile")
            has_alpha = "A" in image.getbands() or "transparency" in image.info
            image = image.convert("RGBA" if has_alpha else "RGB")
            width, height = image.size
            variants = []
            for target in sorted({min(width, value) for value in (*TARGET_WIDTHS, width)}):
                target_height = max(1, round(height * target / width))
                resized = image if target == width else image.resize(
                    (target, target_height), Image.Resampling.LANCZOS,
                )
                filename = f"{slug}-{target}.webp"
                destination = output / filename
                options = {
                    "format": "WEBP",
                    "quality": 90 if slug == "chamber" else 92,
                    "method": 6,
                    "exact": True,
                }
                if icc_profile:
                    options["icc_profile"] = icc_profile
                resized.save(destination, **options)
                encoded = destination.read_bytes()
                with Image.open(BytesIO(encoded)) as decoded:
                    decoded.load()
                    assert decoded.size == (target, target_height), filename
                    # WebP can omit an entirely opaque alpha channel. Compare
                    # the actual alpha pixels rather than the storage mode.
                    assert decoded.convert("RGBA").getchannel("A").tobytes() == (
                        resized.convert("RGBA").getchannel("A").tobytes()
                    ), filename
                    assert decoded.info.get("icc_profile") == icc_profile, filename
                # Resampling preserves the full frame, with at most half a pixel
                # of height rounding when a source ratio is not integral.
                assert abs(target_height - height * target / width) <= 0.5
                derivative_bytes += len(encoded)
                variants.append({
                    "src": f"/images/optimized/{filename}",
                    "width": target,
                    "height": target_height,
                    "bytes": len(encoded),
                    "sha256": digest(encoded),
                })
            manifest[source] = {
                "sourceSha256": digest(original),
                "width": width,
                "height": height,
                "variants": variants,
            }
            print(f"{slug}: {len(original):,} source bytes; "
                  f"{len(variants)} copies; "
                  f"{variants[-1]['bytes']:,} native WebP bytes")
        assert (PUBLIC / source.lstrip("/")).read_bytes() == original, source
    (ROOT / "data" / "optimized-images.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
    )
    print(f"Total: {original_bytes:,} original bytes; "
          f"{derivative_bytes:,} bytes across all committed responsive copies")


if __name__ == "__main__":
    generate()
