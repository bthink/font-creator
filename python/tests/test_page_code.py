import cv2
import numpy as np
import pytest

from font_creator_tools.page_code import encode_page_code, read_page_codes
from font_creator_tools.align_scan import align_scan
from font_creator_tools.extract_glyphs import extract_glyphs


def coded_page(payload='FC1:12:45:3'):
    scale = 300 / 72
    width, height = round(530 * scale), round(692 * scale)
    image = np.full((height, width, 3), 255, dtype=np.uint8)
    margin, size = round(10 * scale), round(12 * scale)
    for x, y in [(margin, margin), (width - margin - size, margin), (width - margin - size, height - margin - size), (margin, height - margin - size)]:
        cv2.rectangle(image, (x, y), (x + size, y + size), (0, 0, 0), -1)
    qr = cv2.imdecode(np.frombuffer(encode_page_code(payload), np.uint8), cv2.IMREAD_COLOR)
    qr = cv2.resize(qr, (round(64 * scale), round(64 * scale)), interpolation=cv2.INTER_NEAREST)
    x, y = round((530 - 40 - 64) * scale), round((692 - 32 - 64) * scale)
    image[y:y + qr.shape[0], x:x + qr.shape[1]] = qr
    # Asymmetric handwritten shape in the first cell, smaller than corner markers.
    cv2.line(image, (290, 310), (315, 350), (0, 0, 0), 8)
    cv2.line(image, (315, 350), (300, 350), (0, 0, 0), 8)
    return image


@pytest.mark.parametrize('turns', [0, 1, 2, 3])
def test_coded_pages_align_and_extract_in_every_orientation(tmp_path, turns):
    image = np.rot90(coded_page(), turns).copy()
    payloads, _ = read_page_codes(image)
    assert payloads == ['FC1:12:45:3']
    source, aligned = str(tmp_path / 'scan.png'), str(tmp_path / 'aligned.png')
    cv2.imwrite(source, image)
    result = align_scan(source, aligned, 530, 692, marker_size_pt=12)
    assert result['ok'], result
    extraction = extract_glyphs(aligned, 5, 6, 90 * 300 / 72, str(tmp_path / 'glyphs'), 40 * 300 / 72, 40 * 300 / 72, 14 * 300 / 72)
    assert [cell['index'] for cell in extraction['cells']] == [0]
    assert extraction['cells'][0]['bbox'][2] < 50


def test_blank_page_has_no_code():
    assert read_page_codes(np.full((600, 400, 3), 255, dtype=np.uint8))[0] == []
