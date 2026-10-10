import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';

describe('generateTemplatePdf', () => {
  it('creates one page with a cell per character, wrapping to new pages when full', async () => {
    const { generateTemplatePdf } = await import('./generateTemplate');
    const entries = Array.from({ length: 5 }, (_, index) => ({
      id: index,
      projectId: 1,
      charValue: String.fromCharCode(97 + index),
      type: 'single' as const,
      componentChars: null,
      sortOrder: index,
    }));
    const bytes = await generateTemplatePdf(entries, {
      columns: 2,
      rows: 2,
      cellSizePt: 100,
      markerSizePt: 10,
    });
    const doc = await PDFDocument.load(bytes);
    // 5 chars, 4 cells per page -> 2 pages
    expect(doc.getPageCount()).toBe(2);
  });

  it('renders non-WinAnsi characters (Polish, Icelandic, math, currency) without throwing', async () => {
    const { generateTemplatePdf } = await import('./generateTemplate');
    const chars = ['ą', 'ł', 'ż', 'þ', 'ð', '×', '≠', '€'];
    const entries = chars.map((charValue, index) => ({
      id: index,
      projectId: 1,
      charValue,
      type: 'single' as const,
      componentChars: null,
      sortOrder: index,
    }));
    const bytes = await generateTemplatePdf(entries, {
      columns: 4,
      rows: 2,
      cellSizePt: 100,
      markerSizePt: 10,
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
