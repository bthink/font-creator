# Agent Log

- fix WinAnsi PDF encoding crash | fixed | StandardFonts only supports WinAnsi; embed Noto Sans via @pdf-lib/fontkit for Unicode chars (Polish/Icelandic/math/currency presets)
- fix glyph label bleed-through into traced SVG | fixed | label lived inside the same cell rect that extract_glyphs.py ink-thresholds; added LABEL_HEIGHT_PT strip excluded from extraction crop (shared constant between generateTemplate.ts and extract_glyphs.py --label-height-px)
- fix ligature GSUB rule crash on non-alnum components | fixed | component_chars were spliced raw into the feaLib rule instead of going through glyph_name_for_char(); punctuation components (uniXXXX glyph names) caused "missing from glyph set" compile error
