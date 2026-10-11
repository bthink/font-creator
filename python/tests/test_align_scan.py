import numpy as np
import cv2
import pytest
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


def test_find_registration_markers_ignores_large_page_contour():
    image = make_test_image_with_markers()
    cv2.rectangle(image, (80, 80), (320, 520), (0, 0, 0), -1)
    markers = find_registration_markers(image)
    assert len(markers) == 4
    assert all(marker.area < 1000 for marker in markers)


@pytest.mark.parametrize('turns', [0, 1, 2, 3])
@pytest.mark.parametrize('resolution', [1, 5])
def test_markers_on_dark_desk_touching_paper_edge(turns, resolution):
    image = np.full((800, 600, 3), 75, dtype=np.uint8)
    cv2.rectangle(image, (50, 50), (550, 750), (210, 210, 210), -1)
    corners = [(90, 90), (538, 90), (538, 690), (90, 690)]
    for x, y in corners:
        # The right squares extend beyond the paper and join the desk contour.
        cv2.rectangle(image, (x, y), (x + 24, y + 24), (15, 15, 15), -1)
    # Hollow grid cells must not be ranked ahead of the filled marks.
    for x in [130, 250, 370]:
        cv2.rectangle(image, (x, 160), (x + 100, 260), (35, 35, 35), 2)
    image = np.rot90(image, turns).copy()
    image = cv2.resize(image, None, fx=resolution, fy=resolution)
    markers = find_registration_markers(image)
    assert len(markers) == 4
    expected = np.zeros((800, 600), np.uint8)
    for x, y in corners:
        expected[y + 12, x + 12] = 1
    ys, xs = np.where(np.rot90(expected, turns))
    for x, y in zip(xs, ys):
        assert min(np.hypot(marker.center_x / resolution - x, marker.center_y / resolution - y) for marker in markers) < 3


def test_missing_edge_marker_is_not_replaced_by_grid_cell():
    image = make_test_image_with_markers()
    image[565:600, 365:400] = 255
    cv2.rectangle(image, (200, 300), (260, 360), (0, 0, 0), 2)
    assert len(find_registration_markers(image)) == 3


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
