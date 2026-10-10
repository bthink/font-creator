import json
import os
import tempfile

from fontTools.ttLib import TTFont
from font_creator_tools.build_font import build_font

SIMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L100 0 L100 100 L0 100 Z"/></svg>'


def test_build_font_creates_valid_otf_with_expected_glyphs():
    with tempfile.TemporaryDirectory() as tmp_dir:
        svg_path = os.path.join(tmp_dir, "a.svg")
        with open(svg_path, "w") as handle:
            handle.write(SIMPLE_SVG)

        spec = {
            "glyphs": [{"char": "a", "svg_path": svg_path, "advance_width": 600}],
            "ligatures": [],
        }
        otf_path = os.path.join(tmp_dir, "out.otf")
        ttf_path = os.path.join(tmp_dir, "out.ttf")

        result = build_font(spec, otf_path, ttf_path, family_name="Test Hand")

        assert result["ok"] is True
        assert os.path.exists(otf_path)
        assert os.path.exists(ttf_path)

        font = TTFont(otf_path)
        assert "a" in font.getGlyphOrder() or "uni0061" in font.getGlyphOrder()
        hmtx = font["hmtx"]
        glyph_name = font.getBestCmap()[ord("a")]
        advance_width, _ = hmtx[glyph_name]
        assert advance_width == 600


def test_build_font_with_non_alnum_ligature_component():
    with tempfile.TemporaryDirectory() as tmp_dir:
        svg_path = os.path.join(tmp_dir, "a.svg")
        with open(svg_path, "w") as handle:
            handle.write(SIMPLE_SVG)

        spec = {
            "glyphs": [
                {"char": "a", "svg_path": svg_path, "advance_width": 600},
                {"char": ".", "svg_path": svg_path, "advance_width": 600},
            ],
            "ligatures": [
                {
                    "chars": "a.",
                    "component_chars": "a.",
                    "svg_path": svg_path,
                    "advance_width": 600,
                },
            ],
        }
        otf_path = os.path.join(tmp_dir, "out.otf")
        ttf_path = os.path.join(tmp_dir, "out.ttf")

        result = build_font(spec, otf_path, ttf_path, family_name="Test Hand")

        assert result["ok"] is True
        font = TTFont(otf_path)
        assert "GSUB" in font


def test_build_font_migrates_legacy_multicharacter_glyph_to_ligature():
    with tempfile.TemporaryDirectory() as tmp_dir:
        svg_path = os.path.join(tmp_dir, "glyph.svg")
        with open(svg_path, "w") as handle:
            handle.write(SIMPLE_SVG)

        spec = {
            "glyphs": [
                {"char": "f", "svg_path": svg_path, "advance_width": 600},
                {"char": "fff", "svg_path": svg_path, "advance_width": 1200},
            ],
        }
        otf_path = os.path.join(tmp_dir, "out.otf")
        ttf_path = os.path.join(tmp_dir, "out.ttf")

        result = build_font(spec, otf_path, ttf_path, family_name="Legacy Hand")

        assert result["ok"] is True
        assert "GSUB" in TTFont(otf_path)


def test_traced_scan_uses_font_units_and_correct_orientation():
    import cv2
    import numpy as np
    from font_creator_tools.extract_glyphs import trace_to_svg

    with tempfile.TemporaryDirectory() as tmp_dir:
        cell = np.full((100, 100, 3), 255, dtype=np.uint8)
        cv2.rectangle(cell, (20, 20), (40, 50), (0, 0, 0), -1)
        svg_path = os.path.join(tmp_dir, "scan.svg")
        trace_to_svg(cell, svg_path)
        spec = {"glyphs": [{"char": "a", "svg_path": svg_path, "advance_width": 100, "scale": 1000 / 300, "origin_x": 20}]}
        otf_path, ttf_path = os.path.join(tmp_dir, "out.otf"), os.path.join(tmp_dir, "out.ttf")
        build_font(spec, otf_path, ttf_path, "Scan test")
        glyph = TTFont(ttf_path)["glyf"]["a"]
        assert abs(glyph.xMin) <= 1
        assert 68 <= glyph.xMax <= 72
        assert 628 <= glyph.yMin <= 632
        assert 731 <= glyph.yMax <= 735


def test_unicode_family_and_characters_with_curved_outlines():
    with tempfile.TemporaryDirectory() as tmp_dir:
        svg_path = os.path.join(tmp_dir, "a.svg")
        with open(svg_path, "w") as handle:
            handle.write('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 C0 100 100 100 100 0 Z"/></svg>')
        spec = {"glyphs": [{"char": "ą", "svg_path": svg_path, "advance_width": 600}]}
        otf_path, ttf_path = os.path.join(tmp_dir, "out.otf"), os.path.join(tmp_dir, "out.ttf")
        build_font(spec, otf_path, ttf_path, "Listy z podróży")
        for file in [otf_path, ttf_path]:
            font = TTFont(file)
            assert ord("ą") in font.getBestCmap()
            assert font["name"].getDebugName(1) == "Listy z podróży"
            assert font["name"].getDebugName(6).isascii()
        glyph = TTFont(ttf_path)["glyf"]["uni0105"]
        assert not any(flag & 128 for flag in glyph.flags)  # standard quadratic TrueType outlines
