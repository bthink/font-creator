import argparse
import json
import os
import subprocess
import sys
import tempfile

import cv2
import numpy as np

INK_THRESHOLD = 200
MIN_INK_PIXELS = 20


def cell_has_ink(cell: np.ndarray) -> bool:
    gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
    ink_pixels = int(np.sum(gray < INK_THRESHOLD))
    return ink_pixels >= MIN_INK_PIXELS


def bbox_of_ink(cell: np.ndarray) -> tuple[int, int, int, int]:
    gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
    mask = gray < INK_THRESHOLD
    ys, xs = np.where(mask)
    x, y = int(xs.min()), int(ys.min())
    w, h = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
    return x, y, w, h


def trace_to_svg(cell: np.ndarray, svg_path: str) -> None:
    gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, INK_THRESHOLD, 255, cv2.THRESH_BINARY_INV)
    with tempfile.NamedTemporaryFile(suffix=".pbm", delete=False) as tmp_pbm:
        cv2.imwrite(tmp_pbm.name, binary)
        subprocess.run(
            ["potrace", tmp_pbm.name, "--svg", "-o", svg_path],
            check=True,
        )
    os.unlink(tmp_pbm.name)


def extract_glyphs(
    input_path: str,
    columns: int,
    rows: int,
    cell_size_px: float,
    output_dir: str,
    origin_x_px: float = 0,
    origin_y_px: float = 0,
) -> dict[str, object]:
    image = cv2.imread(input_path)
    if image is None:
        return {"ok": False, "error": "cannot_read_image"}

    os.makedirs(output_dir, exist_ok=True)
    cells: list[dict[str, object]] = []

    for row in range(rows):
        for col in range(columns):
            index = row * columns + col
            # Cells start at the grid origin (page margin), not at pixel (0,0).
            x = round(origin_x_px + col * cell_size_px)
            y = round(origin_y_px + row * cell_size_px)
            x_end = round(origin_x_px + (col + 1) * cell_size_px)
            y_end = round(origin_y_px + (row + 1) * cell_size_px)
            cell = image[y:y_end, x:x_end]
            if not cell_has_ink(cell):
                continue
            bbox = bbox_of_ink(cell)
            svg_path = os.path.join(output_dir, f"glyph-{index}.svg")
            trace_to_svg(cell, svg_path)
            cells.append({"index": index, "svg_path": svg_path, "bbox": list(bbox)})

    return {"ok": True, "cells": cells}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--columns", type=int, required=True)
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("--cell-size-px", type=float, required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--origin-x-px", type=float, default=0)
    parser.add_argument("--origin-y-px", type=float, default=0)
    args = parser.parse_args()
    result = extract_glyphs(
        args.input,
        args.columns,
        args.rows,
        args.cell_size_px,
        args.output_dir,
        args.origin_x_px,
        args.origin_y_px,
    )
    print(json.dumps(result))
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
