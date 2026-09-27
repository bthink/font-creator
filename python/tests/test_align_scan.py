import numpy as np
import cv2
from font_creator_tools.align_scan import find_registration_markers


def make_test_image_with_markers() -> np.ndarray:
    image = np.full((600, 400, 3), 255, dtype=np.uint8)
    marker_size = 20
    corners = [(10, 10), (370, 10), (10, 570), (370, 570)]
    for x, y in corners:
        cv2.rectangle(image, (x, y), (x + marker_size, y + marker_size), (0, 0, 0), -1)
    return image


def test_find_registration_markers_detects_four_corners():
    image = make_test_image_with_markers()
    markers = find_registration_markers(image)
    assert len(markers) == 4


import tempfile
import os
from font_creator_tools.align_scan import align_scan


def test_align_scan_writes_output_file():
    image = make_test_image_with_markers()
    with tempfile.TemporaryDirectory() as tmp_dir:
        input_path = os.path.join(tmp_dir, "input.png")
        output_path = os.path.join(tmp_dir, "output.png")
        cv2.imwrite(input_path, image)
        result = align_scan(
            input_path,
            output_path,
            page_width_pt=200,
            page_height_pt=300,
        )
        assert result["ok"] is True
        assert os.path.exists(output_path)


def test_align_scan_reports_failure_without_markers():
    blank = np.full((600, 400, 3), 255, dtype=np.uint8)
    with tempfile.TemporaryDirectory() as tmp_dir:
        input_path = os.path.join(tmp_dir, "input.png")
        output_path = os.path.join(tmp_dir, "output.png")
        cv2.imwrite(input_path, blank)
        result = align_scan(
            input_path,
            output_path,
            page_width_pt=200,
            page_height_pt=300,
        )
        assert result["ok"] is False
        assert result["error"] == "markers_not_found"
