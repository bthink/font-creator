import argparse
import json
import sys
from dataclasses import dataclass

import cv2
import numpy as np

# Canonical raster resolution shared across the scan pipeline. MUST be kept in
# sync with `TEMPLATE_DPI` in src/lib/pdf/generateTemplate.ts — there is no
# cross-language shared-config mechanism in this stack, so this code comment is
# the pragmatic guard.
DPI = 300


@dataclass
class Marker:
    center_x: float
    center_y: float
    area: float


def find_registration_markers(image: np.ndarray) -> list[Marker]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates: list[Marker] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < 50:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        aspect_ratio = w / h if h else 0
        if 0.7 <= aspect_ratio <= 1.3:
            candidates.append(Marker(center_x=x + w / 2, center_y=y + h / 2, area=area))

    candidates.sort(key=lambda marker: marker.area, reverse=True)
    return candidates[:4]


def order_markers_clockwise(markers: list[Marker]) -> list[Marker]:
    center_x = sum(marker.center_x for marker in markers) / len(markers)
    center_y = sum(marker.center_y for marker in markers) / len(markers)

    def quadrant_key(marker: Marker) -> tuple[int, float]:
        is_top = marker.center_y < center_y
        is_left = marker.center_x < center_x
        if is_top and is_left:
            return (0, 0)
        if is_top and not is_left:
            return (1, 0)
        if not is_top and not is_left:
            return (2, 0)
        return (3, 0)

    return sorted(markers, key=quadrant_key)


def align_scan(
    input_path: str,
    output_path: str,
    page_width_pt: float,
    page_height_pt: float,
    marker_margin_pt: float = 10,
    marker_size_pt: float = 12,
    dpi: int = DPI,
) -> dict[str, object]:
    image = cv2.imread(input_path)
    if image is None:
        return {"ok": False, "error": "cannot_read_image"}

    markers = find_registration_markers(image)
    if len(markers) != 4:
        return {"ok": False, "error": "markers_not_found", "found": len(markers)}

    ordered = order_markers_clockwise(markers)
    src_points = np.array(
        [[marker.center_x, marker.center_y] for marker in ordered], dtype=np.float32
    )

    # Warp detected markers to their known canonical pixel positions on a full-page
    # canvas at `dpi`, rather than to the input image's own corners. Each marker's
    # center is a fixed physical distance `d` from its nearest page edges; this is
    # a physical measurement, so it is independent of PDF's y-up vs. image y-down.
    scale = dpi / 72
    canvas_w = round(page_width_pt * scale)
    canvas_h = round(page_height_pt * scale)
    d = (marker_margin_pt + marker_size_pt / 2) * scale
    # order_markers_clockwise returns TRUE clockwise order: TL, TR, BR, BL.
    # (Its quadrant_key assigns 0=TL, 1=TR, 2=BR, 3=BL — note bottom-RIGHT before
    # bottom-LEFT. The dst points below MUST follow that same order.)
    dst_points = np.array(
        [
            [d, d],
            [canvas_w - d, d],
            [canvas_w - d, canvas_h - d],
            [d, canvas_h - d],
        ],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(src_points, dst_points)
    aligned = cv2.warpPerspective(image, matrix, (canvas_w, canvas_h))
    cv2.imwrite(output_path, aligned)
    return {"ok": True, "output_path": output_path}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--page-width-pt", type=float, required=True)
    parser.add_argument("--page-height-pt", type=float, required=True)
    parser.add_argument("--marker-margin-pt", type=float, default=10)
    parser.add_argument("--marker-size-pt", type=float, default=12)
    parser.add_argument("--dpi", type=int, default=DPI)
    args = parser.parse_args()
    result = align_scan(
        args.input,
        args.output,
        args.page_width_pt,
        args.page_height_pt,
        args.marker_margin_pt,
        args.marker_size_pt,
        args.dpi,
    )
    print(json.dumps(result))
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
