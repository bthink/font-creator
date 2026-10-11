import json
import os
import tempfile

from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from font_creator_tools.build_font import build_font

SIMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L100 0 L100 100 L0 100 Z"/></svg>'


def test_small_punctuation_scale_is_preserved_in_otf_and_ttf():
    with tempfile.TemporaryDirectory() as tmp_dir:
        svg_path = os.path.join(tmp_dir, "punctuation.svg")
        with open(svg_path, "w") as handle:
            handle.write(SIMPLE_SVG)
        spec = {"glyphs": [
            {"char": char, "svg_path": svg_path, "advance_width": 50,
             "size_scale_percent": 10}
            for char in [".", ","]
        ]}
        otf_path = os.path.join(tmp_dir, "out.otf")
        ttf_path = os.path.join(tmp_dir, "out.ttf")
        build_font(spec, otf_path, ttf_path, "Small punctuation")

        for file in [otf_path, ttf_path]:
            with TTFont(file) as font:
                glyph_set = font.getGlyphSet()
                for char in [".", ","]:
                    name = font.getBestCmap()[ord(char)]
                    pen = BoundsPen(glyph_set)
                    glyph_set[name].draw(pen)
                    assert pen.bounds == (0, 790, 10, 800)
                    assert font["hmtx"][name][0] == 50


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


def test_vertical_offset_shifts_glyph_outline_in_font_units():
    import cv2
    import numpy as np
    from font_creator_tools.extract_glyphs import trace_to_svg

    with tempfile.TemporaryDirectory() as tmp_dir:
        cell = np.full((100, 100, 3), 255, dtype=np.uint8)
        cv2.rectangle(cell, (20, 20), (40, 50), (0, 0, 0), -1)
        svg_path = os.path.join(tmp_dir, "scan.svg")
        trace_to_svg(cell, svg_path)

        base_spec = {"glyphs": [{"char": "a", "svg_path": svg_path, "advance_width": 100, "scale": 1000 / 300, "origin_x": 20}]}
        shifted_spec = {"glyphs": [{"char": "a", "svg_path": svg_path, "advance_width": 100, "scale": 1000 / 300, "origin_x": 20, "vertical_offset": 40}]}

        base_otf, base_ttf = os.path.join(tmp_dir, "base.otf"), os.path.join(tmp_dir, "base.ttf")
        shifted_otf, shifted_ttf = os.path.join(tmp_dir, "shifted.otf"), os.path.join(tmp_dir, "shifted.ttf")

        build_font(base_spec, base_otf, base_ttf, "Base test")
        build_font(shifted_spec, shifted_otf, shifted_ttf, "Shifted test")

        base_glyph = TTFont(base_ttf)["glyf"]["a"]
        shifted_glyph = TTFont(shifted_ttf)["glyf"]["a"]

        assert shifted_glyph.yMin - base_glyph.yMin == 40
        assert shifted_glyph.yMax - base_glyph.yMax == 40
        assert shifted_glyph.xMin == base_glyph.xMin
        assert shifted_glyph.xMax == base_glyph.xMax


def test_size_scale_percent_scales_glyph_outline_around_top_left_anchor():
    import cv2
    import numpy as np
    from font_creator_tools.extract_glyphs import trace_to_svg

    with tempfile.TemporaryDirectory() as tmp_dir:
        cell = np.full((100, 100, 3), 255, dtype=np.uint8)
        cv2.rectangle(cell, (20, 20), (40, 50), (0, 0, 0), -1)
        svg_path = os.path.join(tmp_dir, "scan.svg")
        trace_to_svg(cell, svg_path)

        base_spec = {"glyphs": [{"char": "a", "svg_path": svg_path, "advance_width": 100, "scale": 1000 / 300, "origin_x": 20}]}
        scaled_spec = {"glyphs": [{"char": "a", "svg_path": svg_path, "advance_width": 100, "scale": 1000 / 300, "origin_x": 20, "size_scale_percent": 200}]}

        base_otf, base_ttf = os.path.join(tmp_dir, "base.otf"), os.path.join(tmp_dir, "base.ttf")
        scaled_otf, scaled_ttf = os.path.join(tmp_dir, "scaled.otf"), os.path.join(tmp_dir, "scaled.ttf")

        build_font(base_spec, base_otf, base_ttf, "Base test")
        build_font(scaled_spec, scaled_otf, scaled_ttf, "Scaled test")

        base_glyph = TTFont(base_ttf)["glyf"]["a"]
        scaled_glyph = TTFont(scaled_ttf)["glyf"]["a"]

        # origin_x maps to xMin=0 regardless of scale (left edge anchor unchanged).
        assert base_glyph.xMin == 0
        assert scaled_glyph.xMin == 0
        # The cell's top edge (SVG y=0) maps to font y=ASCENDER regardless of
        # scale (top anchor unchanged); yMax is close to ASCENDER for both,
        # and doubling the scale roughly doubles the outline's width and height.
        assert scaled_glyph.xMax == 2 * base_glyph.xMax
        base_height = base_glyph.yMax - base_glyph.yMin
        scaled_height = scaled_glyph.yMax - scaled_glyph.yMin
        # Cu2Qu curve conversion may introduce ±1 unit rounding in y coordinates.
        assert abs(scaled_height - 2 * base_height) <= 1
