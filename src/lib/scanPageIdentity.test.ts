import { afterEach, describe, expect, it, vi } from 'vitest';
import { identifyScanPage, pageCodePayload, parsePageCode } from './scanPageIdentity';
import { runPythonTool } from './python/runPython';

vi.mock('./python/runPython', () => ({ runPythonTool: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const expected = { projectId: 12, templateVersionId: 45 };
const file = new File(['scan'], 'scan.png', { type: 'image/png' });

function codes(values: string[]) {
  vi.mocked(runPythonTool).mockResolvedValueOnce({ ok: true, codes: values });
}

describe('scan page identity', () => {
  it('round-trips identities and rejects malformed numbers', () => {
    const identity = { ...expected, pageIndex: 3 };
    expect(parsePageCode(pageCodePayload(identity))).toEqual(identity);
    for (const payload of ['FC1:0:1:0', 'FC1:1:1:-1', 'FC1:1:1:01', 'FC1:1:1:0 extra', 'FC1:999999999999999999:1:0', 'other']) {
      expect(parsePageCode(payload)).toBeNull();
    }
  });
  it('identifies arbitrary page order', async () => {
    for (const pageIndex of [3, 0, 2, 1]) {
      codes([pageCodePayload({ ...expected, pageIndex })]);
      expect(await identifyScanPage(file, expected, 4)).toBe(pageIndex);
    }
  });
  it('offers manual fallback only when no page code was read', async () => {
    codes([]);
    expect(await identifyScanPage(file, expected, 4)).toBeNull();
    codes(['https://example.com']);
    expect(await identifyScanPage(file, expected, 4)).toBeNull();
  });
  it('rejects another project, obsolete version, invalid page and conflicting codes', async () => {
    for (const [values, message] of [
      [['FC1:13:45:0'], 'innego projektu'],
      [['FC1:12:44:0'], 'wersji szablonu'],
      [['FC1:12:45:4'], 'nie pasuje'],
      [['FC1:12:45:0', 'FC1:12:45:1'], 'kilka stron'],
      [['FC1:broken'], 'uszkodzone'],
    ] as [string[], string][]) {
      codes(values);
      await expect(identifyScanPage(file, expected, 4)).rejects.toThrow(message);
    }
  });
  it('accepts repeated copies of the same code', async () => {
    codes(['FC1:12:45:0', 'FC1:12:45:0']);
    expect(await identifyScanPage(file, expected, 4)).toBe(0);
  });
  it('does not treat unreadable image data as a legacy template', async () => {
    vi.mocked(runPythonTool).mockResolvedValueOnce({ ok: false });
    await expect(identifyScanPage(file, expected, 4)).rejects.toThrow('obrazu');
  });
});
