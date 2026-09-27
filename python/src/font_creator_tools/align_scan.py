import argparse
import json
import sys
from dataclasses import dataclass

import cv2
import numpy as np


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


def align_scan(input_path: str, output_path: str) -> dict[str, object]:
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
    height, width = image.shape[:2]
    dst_points = np.array(
        [[0, 0], [width, 0], [0, height], [width, height]], dtype=np.float32
    )
    matrix = cv2.getPerspectiveTransform(src_points, dst_points)
    aligned = cv2.warpPerspective(image, matrix, (width, height))
    cv2.imwrite(output_path, aligned)
    return {"ok": True, "output_path": output_path}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--marker-size-pt", type=float, default=None)
    args = parser.parse_args()
    result = align_scan(args.input, args.output)
    print(json.dumps(result))
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
