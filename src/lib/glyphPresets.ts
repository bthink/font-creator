export type GlyphPreset = {
  id: string;
  label: string;
  chars: string[];
};

function lowerUpper(chars: string): string[] {
  return [...chars.split(''), ...chars.toUpperCase().split('')];
}

const ENGLISH_BASE = 'abcdefghijklmnopqrstuvwxyz';
const POLISH_DIACRITICS = 'ąćęłńóśźż';
const ICELANDIC_BASE = 'aábdðeéfghiíjklmnoóprstuúvxyýþæö';

export const GLYPH_PRESETS: GlyphPreset[] = [
  {
    id: 'english',
    label: 'English',
    chars: lowerUpper(ENGLISH_BASE),
  },
  {
    id: 'polish',
    label: 'Polish',
    chars: [...lowerUpper(ENGLISH_BASE), ...lowerUpper(POLISH_DIACRITICS)],
  },
  {
    id: 'icelandic',
    label: 'Icelandic',
    chars: lowerUpper(ICELANDIC_BASE),
  },
  {
    id: 'digits',
    label: 'Digits',
    chars: '0123456789'.split(''),
  },
  {
    id: 'basic-punctuation',
    label: 'Basic punctuation',
    chars: ['.', ',', '!', '?', ';', ':', "'", '"', '-', '(', ')', '…'],
  },
  {
    id: 'basic-math',
    label: 'Basic math',
    chars: ['+', '−', '=', '<', '>', '×', '÷', '%', '±', '≠'],
  },
  {
    id: 'basic-currencies',
    label: 'Basic currencies',
    chars: ['$', '€', '£', '¥', '¢'],
  },
];
