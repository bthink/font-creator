import numpy as np
import cv2
import tempfile
import os
from font_creator_tools.extract_glyphs import extract_glyphs


def make_grid_image(columns: int, rows: int, cell_size: int) -> np.ndarray:
    width = columns * cell_size
    height = rows * cell_size
    image = np.full((height, width, 3), 255, dtype=np.uint8)
    # Draw a black square inside cell (0, 0) to simulate a handwritten stroke
    cv2.rectangle(image, (20, 20), (40, 40), (0, 0, 0), -1)
    return image


def test_extract_glyphs_produces_one_svg_per_cell_with_content():
    image = make_grid_image(columns=2, rows=2, cell_size=100)
    with tempfile.TemporaryDirectory() as tmp_dir:
        input_path = os.path.join(tmp_dir, "aligned.png")
        cv2.imwrite(input_path, image)
        output_dir = os.path.join(tmp_dir, "glyphs")
        result = extract_glyphs(
            input_path,
            columns=2,
            rows=2,
            cell_size_px=100,
            output_dir=output_dir,
            origin_x_px=0,
            origin_y_px=0,
        )
        assert result["ok"] is True
        # Only cell (0,0) has ink; empty cells should be skipped
        assert len(result["cells"]) == 1
        assert result["cells"][0]["index"] == 0
        assert os.path.exists(result["cells"][0]["svg_path"])


def test_extract_glyphs_ignores_ink_in_label_strip():
    # Ink only in the top 15px (the label strip) of cell (0, 0); none in the
    # writing area below it.
    width = height = 100
    image = np.full((height, width, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (5, 2), (12, 10), (0, 0, 0), -1)
    with tempfile.TemporaryDirectory() as tmp_dir:
        input_path = os.path.join(tmp_dir, "aligned.png")
        cv2.imwrite(input_path, image)
        output_dir = os.path.join(tmp_dir, "glyphs")
        result = extract_glyphs(
            input_path,
            columns=1,
            rows=1,
            cell_size_px=100,
            output_dir=output_dir,
            origin_x_px=0,
            origin_y_px=0,
            label_height_px=15,
        )
        assert result["ok"] is True
        assert len(result["cells"]) == 0
