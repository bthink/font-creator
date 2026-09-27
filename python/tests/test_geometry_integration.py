"""Integration test for the scan geometry contract.

This is the test that would have caught the finding where the PDF layout,
alignment, and extraction stages did not share a coordinate system. It builds a
synthetic "page" image with registration markers at their real canonical
positions, applies perspective distortion (as a real scan would have), then runs
align_scan -> extract_glyphs with matching page/grid parameters and asserts a
known ink mark placed in a specific cell is recovered at the correct index with a
sane bounding box.
"""

import os
import tempfile

import cv2
import numpy as np

from font_creator_tools.align_scan import align_scan
from font_creator_tools.extract_glyphs import extract_glyphs

# Grid geometry, mirroring src/lib/pdf/generateTemplate.ts conventions.
DPI = 300
PAGE_MARGIN_PT = 40
MARKER_MARGIN_PT = 10
MARKER_SIZE_PT = 12
COLUMNS = 3
ROWS = 4
CELL_SIZE_PT = 90

PAGE_WIDTH_PT = PAGE_MARGIN_PT * 2 + COLUMNS * CELL_SIZE_PT
PAGE_HEIGHT_PT = PAGE_MARGIN_PT * 2 + ROWS * CELL_SIZE_PT


def build_canonical_page() -> np.ndarray:
    """Render a white page at DPI with black registration markers at their
    canonical corner positions and one ink mark centered in cell index 4."""
    scale = DPI / 72
    canvas_w = round(PAGE_WIDTH_PT * scale)
    canvas_h = round(PAGE_HEIGHT_PT * scale)
    image = np.full((canvas_h, canvas_w, 3), 255, dtype=np.uint8)

    marker_size_px = round(MARKER_SIZE_PT * scale)
    margin_px = round(MARKER_MARGIN_PT * scale)
    corners = [
        (margin_px, margin_px),
        (canvas_w - margin_px - marker_size_px, margin_px),
        (margin_px, canvas_h - margin_px - marker_size_px),
        (canvas_w - margin_px - marker_size_px, canvas_h - margin_px - marker_size_px),
    ]
    for x, y in corners:
        cv2.rectangle(image, (x, y), (x + marker_size_px, y + marker_size_px), (0, 0, 0), -1)

    # Ink mark in cell index 4 (row 1, col 1), centered.
    origin_px = PAGE_MARGIN_PT * scale
    cell_px = CELL_SIZE_PT * scale
    col, row = 1, 1
    cx = origin_px + (col + 0.5) * cell_px
    cy = origin_px + (row + 0.5) * cell_px
    # Keep the ink mark clearly smaller than the registration markers so the
    # marker detector (which keeps the 4 largest dark blobs) is not confused.
    half = round(cell_px * 0.04)
    cv2.rectangle(
        image,
        (round(cx - half), round(cy - half)),
        (round(cx + half), round(cy + half)),
        (0, 0, 0),
        -1,
    )
    return image


def apply_perspective_distortion(image: np.ndarray) -> np.ndarray:
    """Warp the canonical page into a larger canvas with a mild perspective
    skew, simulating a photographed / skewed scan."""
    h, w = image.shape[:2]
    out_w, out_h = w + 120, h + 120
    src = np.array([[0, 0], [w, 0], [0, h], [w, h]], dtype=np.float32)
    dst = np.array(
        [[40, 30], [out_w - 25, 55], [20, out_h - 40], [out_w - 50, out_h - 20]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(
        image, matrix, (out_w, out_h), borderValue=(255, 255, 255)
    )


def test_align_then_extract_recovers_known_cell():
    page = build_canonical_page()
    scanned = apply_perspective_distortion(page)

    with tempfile.TemporaryDirectory() as tmp_dir:
        input_path = os.path.join(tmp_dir, "scan.png")
        aligned_path = os.path.join(tmp_dir, "aligned.png")
        output_dir = os.path.join(tmp_dir, "glyphs")
        cv2.imwrite(input_path, scanned)

        align_result = align_scan(
            input_path,
            aligned_path,
            page_width_pt=PAGE_WIDTH_PT,
            page_height_pt=PAGE_HEIGHT_PT,
            marker_margin_pt=MARKER_MARGIN_PT,
            marker_size_pt=MARKER_SIZE_PT,
            dpi=DPI,
        )
        assert align_result["ok"] is True

        scale = DPI / 72
        extract_result = extract_glyphs(
            aligned_path,
            columns=COLUMNS,
            rows=ROWS,
            cell_size_px=CELL_SIZE_PT * scale,
            output_dir=output_dir,
            origin_x_px=PAGE_MARGIN_PT * scale,
            origin_y_px=PAGE_MARGIN_PT * scale,
        )
        assert extract_result["ok"] is True

        cells = extract_result["cells"]
        indices = [c["index"] for c in cells]
        # The ink mark must be recovered in cell index 4 only.
        assert indices == [4], f"expected only cell 4 to have ink, got {indices}"

        bbox = cells[0]["bbox"]
        x, y, bw, bh = bbox
        cell_px = CELL_SIZE_PT * scale
        # The mark is ~8% of cell width and roughly square.
        assert 0.03 * cell_px < bw < 0.2 * cell_px
        assert 0.03 * cell_px < bh < 0.2 * cell_px
        # Its top-left is inset well within the cell (mark is centered).
        assert x > 0.3 * cell_px
        assert y > 0.3 * cell_px
