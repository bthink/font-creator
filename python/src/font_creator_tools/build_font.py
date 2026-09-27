import argparse
import json
import sys
from typing import Any

from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.fontBuilder import FontBuilder
from fontTools.misc.transform import Transform
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import SVGPath

UNITS_PER_EM = 1000
ASCENDER = 800
DESCENDER = -200

# Traced glyph SVGs (from potrace) use SVG's y-down coordinate space, while
# OpenType glyph outlines use a y-up coordinate space. Flip vertically and
# anchor the drawing at the font's ascender so glyphs render right-side up.
SVG_TO_FONT_UNITS = Transform(1, 0, 0, -1, 0, ASCENDER)


def glyph_name_for_char(char: str) -> str:
    if len(char) == 1 and char.isalnum():
        return char
    if len(char) == 1:
        return f"uni{ord(char):04X}"
    return f"liga.{'_'.join(str(ord(c)) for c in char)}"


def build_charstrings(glyph_specs: list[dict[str, Any]]) -> dict[str, Any]:
    charstrings: dict[str, Any] = {}
    for spec in glyph_specs:
        svg_path = SVGPath(spec["svg_path"], transform=SVG_TO_FONT_UNITS)
        pen = T2CharStringPen(spec["advance_width"], glyphSet=None)
        svg_path.draw(pen)
        charstrings[spec["glyph_name"]] = pen.getCharString()
    return charstrings


def build_glyf_glyphs(glyph_specs: list[dict[str, Any]]) -> dict[str, Any]:
    glyphs: dict[str, Any] = {}
    for spec in glyph_specs:
        pen = TTGlyphPen(glyphSet=None)
        svg_path = SVGPath(spec["svg_path"], transform=SVG_TO_FONT_UNITS)
        svg_path.draw(pen)
        glyphs[spec["glyph_name"]] = pen.glyph()
    return glyphs


def setup_ligature_substitution(fb: FontBuilder, ligature_specs: list[dict[str, Any]]) -> None:
    rules = []
    for ligature in ligature_specs:
        components = " ".join(ligature["component_chars"])
        target = glyph_name_for_char(ligature["chars"])
        rules.append(f"sub {components} by {target};")
    feature_code = "feature liga {\n" + "\n".join(rules) + "\n} liga;\n"
    addOpenTypeFeaturesFromString(fb.font, feature_code)


def build_font(
    spec: dict[str, Any],
    otf_path: str,
    ttf_path: str,
    family_name: str,
) -> dict[str, object]:
    all_glyphs = [
        {**g, "glyph_name": glyph_name_for_char(g["char"])} for g in spec["glyphs"]
    ] + [
        {**l, "glyph_name": glyph_name_for_char(l["chars"])} for l in spec.get("ligatures", [])
    ]

    single_glyphs = [g for g in all_glyphs if "char" in g]
    glyph_order = [".notdef"] + [g["glyph_name"] for g in all_glyphs]
    advance_widths = {
        ".notdef": UNITS_PER_EM // 2,
        **{g["glyph_name"]: g["advance_width"] for g in all_glyphs},
    }
    cmap = {ord(g["char"]): g["glyph_name"] for g in single_glyphs}

    fb = FontBuilder(UNITS_PER_EM, isTTF=False)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)

    notdef_pen = T2CharStringPen(UNITS_PER_EM // 2, glyphSet=None)
    charstrings = {".notdef": notdef_pen.getCharString()}
    charstrings.update(build_charstrings(all_glyphs))
    fb.setupCFF(family_name, {"FullName": family_name}, charstrings, {})

    fb.setupHorizontalMetrics({name: (advance_widths[name], 0) for name in glyph_order})
    fb.setupHorizontalHeader(ascent=ASCENDER, descent=DESCENDER)
    fb.setupNameTable({"familyName": family_name, "styleName": "Regular"})
    fb.setupOS2(
        sTypoAscender=ASCENDER,
        sTypoDescender=DESCENDER,
        usWinAscent=ASCENDER,
        usWinDescent=-DESCENDER,
    )
    fb.setupPost()

    ligature_specs = spec.get("ligatures", [])
    if ligature_specs:
        setup_ligature_substitution(fb, ligature_specs)

    fb.font.save(otf_path)

    ttf_builder = FontBuilder(UNITS_PER_EM, isTTF=True)
    ttf_builder.setupGlyphOrder(glyph_order)
    ttf_builder.setupCharacterMap(cmap)
    glyf_glyphs = {".notdef": TTGlyphPen(glyphSet=None).glyph()}
    glyf_glyphs.update(build_glyf_glyphs(all_glyphs))
    ttf_builder.setupGlyf(glyf_glyphs)
    ttf_builder.setupHorizontalMetrics({name: (advance_widths[name], 0) for name in glyph_order})
    ttf_builder.setupHorizontalHeader(ascent=ASCENDER, descent=DESCENDER)
    ttf_builder.setupNameTable({"familyName": family_name, "styleName": "Regular"})
    ttf_builder.setupOS2(
        sTypoAscender=ASCENDER,
        sTypoDescender=DESCENDER,
        usWinAscent=ASCENDER,
        usWinDescent=-DESCENDER,
    )
    ttf_builder.setupPost()

    if ligature_specs:
        setup_ligature_substitution(ttf_builder, ligature_specs)

    ttf_builder.font.save(ttf_path)

    return {"ok": True, "otf_path": otf_path, "ttf_path": ttf_path}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True)
    parser.add_argument("--output-otf", required=True)
    parser.add_argument("--output-ttf", required=True)
    parser.add_argument("--family-name", required=True)
    args = parser.parse_args()

    with open(args.spec) as handle:
        spec = json.load(handle)

    result = build_font(spec, args.output_otf, args.output_ttf, args.family_name)
    print(json.dumps(result))
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
