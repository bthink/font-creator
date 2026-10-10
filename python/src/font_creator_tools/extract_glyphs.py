import argparse
import json
import os
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

import cv2
import numpy as np

MIN_INK_PIXELS = 20
MIN_COMPONENT_PIXELS = 25
INK_CONTRAST = 32


def ink_mask(cell: np.ndarray, border_inset_px: int = 0) -> np.ndarray:
    """Return handwriting pixels while compensating for uneven photo lighting."""
    gray = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY)
    # A fixed brightness threshold turns the shaded paper in a phone photo into
    # ink. Compare each pixel with its local paper background instead, which
    # keeps dark pen strokes while ignoring gradual lighting changes.
    background = cv2.GaussianBlur(gray, (0, 0), sigmaX=25, sigmaY=25)
    mask = background.astype(np.int16) - gray.astype(np.int16) >= INK_CONTRAST

    # The template border belongs to the form, not to the handwriting. It is
    # outside the label strip already removed by the caller, but remains on the
    # left, right, and bottom edges of every writing area.
    if border_inset_px:
        mask[:border_inset_px, :] = False
        mask[-border_inset_px:, :] = False
        mask[:, :border_inset_px] = False
        mask[:, -border_inset_px:] = False

    # Perspective interpolation can leave thin fragments of a grid line just
    # inside the inset. Remove only components attached to the writing area's
    # edge and isolated sensor noise; normal pen dots are much larger at 300
    # DPI and remain intact.
    component_count, labels, stats, _ = cv2.connectedComponentsWithStats(
        mask.astype(np.uint8), connectivity=8
    )
    cleaned = np.zeros_like(mask)
    height, width = mask.shape
    for label in range(1, component_count):
        x, y, component_width, component_height, area = stats[label]
        touches_edge = (
            x <= border_inset_px
            or y <= border_inset_px
            or x + component_width >= width - border_inset_px
            or y + component_height >= height - border_inset_px
        )
        if area >= MIN_COMPONENT_PIXELS and not touches_edge:
            cleaned[labels == label] = True
    return cleaned


def cell_has_ink(mask: np.ndarray) -> bool:
    ink_pixels = int(np.sum(mask))
    return ink_pixels >= MIN_INK_PIXELS


def bbox_of_ink(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(mask)
    x, y = int(xs.min()), int(ys.min())
    w, h = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
    return x, y, w, h


def trace_to_svg(cell: np.ndarray, svg_path: str, mask: np.ndarray | None = None) -> None:
    # Potrace traces black pixels. Keep the ink black and the paper white.
    if mask is None:
        mask = ink_mask(cell)
    binary = np.where(mask, 0, 255).astype(np.uint8)
    with tempfile.NamedTemporaryFile(suffix=".pbm", delete=False) as tmp_pbm:
        cv2.imwrite(tmp_pbm.name, binary)
        subprocess.run(
            ["potrace", tmp_pbm.name, "--svg", "-o", svg_path],
            check=True,
        )
    os.unlink(tmp_pbm.name)
    # FontTools does not inherit SVG group transforms. Flatten potrace's fixed
    # decipixel/y-up coordinate system into pixel/y-down paths for both consumers.
    traced = ET.parse(svg_path).getroot()
    height, width = cell.shape[:2]
    root = ET.Element("svg", {"xmlns": "http://www.w3.org/2000/svg", "viewBox": f"0 0 {width} {height}", "width": str(width), "height": str(height)})
    for element in traced.iter():
        if element.tag.endswith("}path"):
            pen = SVGPathPen(None)
            parse_path(element.attrib["d"], TransformPen(pen, (0.1, 0, 0, -0.1, 0, height)))
            ET.SubElement(root, "path", {"d": pen.getCommands()})
    ET.ElementTree(root).write(svg_path, encoding="unicode")


def extract_glyphs(
    input_path: str,
    columns: int,
    rows: int,
    cell_size_px: float,
    output_dir: str,
    origin_x_px: float = 0,
    origin_y_px: float = 0,
    label_height_px: float = 0,
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
            # The top label_height_px strip holds the printed reference glyph
            # and is excluded so it never gets traced into the glyph outline.
            x = round(origin_x_px + col * cell_size_px)
            y = round(origin_y_px + row * cell_size_px + label_height_px)
            x_end = round(origin_x_px + (col + 1) * cell_size_px)
            y_end = round(origin_y_px + (row + 1) * cell_size_px)
            cell = image[y:y_end, x:x_end]
            # Template strokes are about 4px at 300 DPI. Use a slightly wider
            # inset to account for interpolation introduced during alignment.
            border_inset_px = max(4, round(cell_size_px * 0.025))
            mask = ink_mask(cell, border_inset_px)
            if not cell_has_ink(mask):
                continue
            bbox = bbox_of_ink(mask)
            svg_path = os.path.join(output_dir, f"glyph-{index}.svg")
            trace_to_svg(cell, svg_path, mask)
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
    parser.add_argument("--label-height-px", type=float, default=0)
    args = parser.parse_args()
    result = extract_glyphs(
        args.input,
        args.columns,
        args.rows,
        args.cell_size_px,
        args.output_dir,
        args.origin_x_px,
        args.origin_y_px,
        args.label_height_px,
    )
    print(json.dumps(result))
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
