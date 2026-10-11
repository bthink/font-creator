import argparse
import json
import sys
from dataclasses import dataclass

import cv2
import numpy as np

from font_creator_tools.page_code import read_page_codes

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
    # Work at a bounded resolution so the local window and opening have the
    # same physical effect for a phone photo and a scanner image. Return centers
    # in the original coordinate system for the perspective transform.
    scale = min(1.0, 2400 / max(image.shape[:2]))
    reduced = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else image
    gray = cv2.cvtColor(reduced, cv2.COLOR_BGR2GRAY)
    longest_side = max(gray.shape)
    window = max(31, round(longest_side * 0.05)) | 1
    thresh = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, window, 40
    )
    # Marks touching the paper edge can be connected to its shadow. Remove the
    # thin connection without removing the filled square. RETR_LIST also finds
    # marks enclosed by a dark desk contour, which RETR_EXTERNAL skips entirely.
    opening_size = max(1, round(longest_side * 0.00375)) | 1
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, np.ones((opening_size, opening_size), np.uint8))
    contours, _ = cv2.findContours(thresh, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    # The page itself, its shadow, and the grid can also form large contours in
    # a phone photo. A registration marker is deliberately small, so discard
    # contours that could not possibly be one before ranking candidates. Without
    # this guard a page contour can replace a real corner marker and produce a
    # wildly distorted perspective transform.
    max_marker_area = gray.shape[0] * gray.shape[1] * 0.02
    candidates: list[Marker] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < 50 or area > max_marker_area:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        aspect_ratio = w / h if h else 0
        if not 0.7 <= aspect_ratio <= 1.3 or area / (w * h) < 0.7:
            continue
        inset = max(1, min(w, h) // 5)
        interior = thresh[y + inset:y + h - inset, x + inset:x + w - inset]
        # Grid cells and outlined squares are not registration marks.
        if np.mean(interior > 0) < 0.9:
            continue
        candidates.append(Marker(center_x=(x + w / 2) / scale, center_y=(y + h / 2) / scale, area=area / scale**2))

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

    payloads, polygons = read_page_codes(image)
    # QR finder patterns are square too. Exclude the entire code from marker
    # detection while preserving the original pixels for the output image.
    marker_image = image.copy()
    for polygon in polygons:
        center = polygon.mean(axis=0)
        expanded = center + (polygon - center) * 1.25
        cv2.fillConvexPoly(marker_image, expanded.astype(np.int32), (255, 255, 255))
    markers = find_registration_markers(marker_image)
    if len(markers) != 4:
        return {"ok": False, "error": "markers_not_found", "found": len(markers)}

    ordered = order_markers_clockwise(markers)
    polygon = np.array([[marker.center_x, marker.center_y] for marker in ordered], dtype=np.float32)
    if not cv2.isContourConvex(polygon.astype(np.int32)) or abs(cv2.contourArea(polygon)) < image.shape[0] * image.shape[1] * 0.15:
        return {"ok": False, "error": "invalid_marker_geometry"}
    # The QR corner order follows the code's orientation. Rotate the marker
    # correspondence for sideways/upside-down pages instead of swapping glyphs.
    for payload, code_polygon in zip(payloads, polygons):
        if payload.startswith('FC1:'):
            edge = code_polygon[1] - code_polygon[0]
            quarter_turns = int(round(np.arctan2(edge[1], edge[0]) / (np.pi / 2))) % 4
            ordered = ordered[quarter_turns:] + ordered[:quarter_turns]
            break
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
