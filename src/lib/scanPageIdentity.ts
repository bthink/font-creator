import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPythonTool } from './python/runPython';

export type PageIdentity = { projectId: number; templateVersionId: number; pageIndex: number };

export function pageCodePayload(identity: PageIdentity): string {
  return `FC1:${identity.projectId}:${identity.templateVersionId}:${identity.pageIndex}`;
}

export function parsePageCode(payload: string): PageIdentity | null {
  const match = /^FC1:([1-9]\d*):([1-9]\d*):(0|[1-9]\d*)$/.exec(payload);
  if (!match) return null;
  const [projectId, templateVersionId, pageIndex] = match.slice(1).map(Number);
  if (![projectId, templateVersionId, pageIndex].every(Number.isSafeInteger)) return null;
  return { projectId, templateVersionId, pageIndex };
}

export async function identifyScanPage(file: File, expected: Omit<PageIdentity, 'pageIndex'>, pageCount: number): Promise<number | null> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'font-page-'));
  try {
    const input = path.join(dir, 'scan');
    await fs.writeFile(input, Buffer.from(await file.arrayBuffer()));
    const result = await runPythonTool('font_creator_tools.page_code', ['--input', input]);
    if (!result.ok) throw new Error('Nie można odczytać obrazu. Wybierz poprawny plik PNG lub JPG.');
    const codes = result.codes as string[];
    if (!Array.isArray(codes)) throw new Error('Nie udało się rozpoznać strony. Spróbuj ponownie.');
    const identities = codes.filter((code) => code.startsWith('FC1:')).map(parsePageCode);
    if (!identities.length) return null;
    if (identities.some((identity) => !identity)) throw new Error('Oznaczenie szablonu jest uszkodzone. Wgraj wyraźniejszy skan.');
    const unique = [...new Map(identities.map((identity) => [pageCodePayload(identity!), identity!])).values()];
    if (unique.length !== 1) throw new Error('Na obrazie rozpoznano kilka stron. Wgraj każdą kartkę jako osobny plik.');
    const identity = unique[0];
    if (identity.projectId !== expected.projectId) throw new Error('Ten skan pochodzi z innego projektu. Wybierz skan tego fontu.');
    if (identity.templateVersionId !== expected.templateVersionId) throw new Error('Ten skan pochodzi z innej wersji szablonu. Wgraj aktualną wersję.');
    if (identity.pageIndex >= pageCount) throw new Error('Oznaczenie strony nie pasuje do szablonu. Pobierz aktualny PDF.');
    return identity.pageIndex;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
