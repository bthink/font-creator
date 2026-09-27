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
