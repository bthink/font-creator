def test_imports():
    import cv2
    from fontTools.ttLib import TTFont
    assert cv2.__version__
    assert TTFont
