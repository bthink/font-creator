"""Printable page identities shared by PDF generation and scan import."""
import argparse
import base64
import json

import cv2
import numpy as np


def encode_page_code(payload: str) -> bytes:
    params = cv2.QRCodeEncoder_Params()
    params.correction_level = cv2.QRCodeEncoder_CORRECT_LEVEL_Q
    modules = cv2.QRCodeEncoder_create(params).encode(payload)
    # OpenCV supplies two border modules; extend to a four-module quiet zone.
    modules = cv2.copyMakeBorder(modules, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=255)
    image = cv2.resize(modules, None, fx=10, fy=10, interpolation=cv2.INTER_NEAREST)
    ok, png = cv2.imencode('.png', image)
    if not ok:
        raise ValueError('Cannot encode page code')
    return png.tobytes()


def read_page_codes(image: np.ndarray) -> tuple[list[str], list[np.ndarray]]:
    scale = min(1.0, 2400 / max(image.shape[:2]))
    preview = cv2.resize(image, None, fx=scale, fy=scale) if scale < 1 else image
    detector = cv2.QRCodeDetector()
    found, payloads, points, _ = detector.detectAndDecodeMulti(preview)
    if found and points is not None and any(payloads):
        return list(payloads), [polygon / scale for polygon in points]
    # The multi-code detector can miss a solitary code beside the printed grid.
    # Its single-code counterpart uses a different candidate selection path.
    payload, single_points, _ = detector.detectAndDecode(preview)
    if single_points is not None:
        return [payload], [single_points[0] / scale]
    return [], []


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--encode')
    parser.add_argument('--input')
    args = parser.parse_args()
    if args.encode:
        print(json.dumps({'ok': True, 'png': base64.b64encode(encode_page_code(args.encode)).decode()}))
        return
    image = cv2.imread(args.input)
    if image is None:
        print(json.dumps({'ok': False, 'error': 'cannot_read_image'}))
        return
    payloads, _ = read_page_codes(image)
    print(json.dumps({'ok': True, 'codes': payloads}))


if __name__ == '__main__':
    main()
