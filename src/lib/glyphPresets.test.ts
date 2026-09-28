import { describe, it, expect } from 'vitest';
import { GLYPH_PRESETS } from './glyphPresets';

describe('glyphPresets', () => {
  it('has no duplicate preset ids', () => {
    const ids = GLYPH_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate chars within any single preset', () => {
    for (const preset of GLYPH_PRESETS) {
      expect(new Set(preset.chars).size).toBe(preset.chars.length);
    }
  });

  it('every char is exactly one Unicode code point', () => {
    for (const preset of GLYPH_PRESETS) {
      for (const char of preset.chars) {
        expect(Array.from(char)).toHaveLength(1);
      }
    }
  });

  it('includes the expected preset ids', () => {
    const ids = GLYPH_PRESETS.map((preset) => preset.id);
    expect(ids).toEqual([
      'english',
      'polish',
      'icelandic',
      'digits',
      'basic-punctuation',
      'basic-math',
      'basic-currencies',
    ]);
  });

  it('polish preset includes Polish diacritics in both cases', () => {
    const polish = GLYPH_PRESETS.find((preset) => preset.id === 'polish')!;
    expect(polish.chars).toContain('ł');
    expect(polish.chars).toContain('Ł');
    expect(polish.chars).toContain('ż');
    expect(polish.chars).toContain('Ż');
  });

  it('icelandic preset includes thorn and eth in both cases', () => {
    const icelandic = GLYPH_PRESETS.find((preset) => preset.id === 'icelandic')!;
    expect(icelandic.chars).toContain('þ');
    expect(icelandic.chars).toContain('Þ');
    expect(icelandic.chars).toContain('ð');
    expect(icelandic.chars).toContain('Ð');
  });

  it('digits preset is 0-9', () => {
    const digits = GLYPH_PRESETS.find((preset) => preset.id === 'digits')!;
    expect(digits.chars).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });
});
