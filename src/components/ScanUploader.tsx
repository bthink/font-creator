'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestJson, errorMessage } from '@/lib/client';
import type { Scan } from '@/lib/db/scans';
import { Icon } from './Icon';

type StagedFile = {
  id: string;
  file: File;
  pageIndex: number;
};

let stagingCounter = 0;

export function ScanUploader({
  projectId,
  disabled,
  pageCount,
  uploadedPageIndexes,
  onUploaded,
  onReview,
}: {
  projectId: number;
  disabled?: boolean;
  pageCount: number;
  uploadedPageIndexes: number[];
  onUploaded: (scan: Scan & { pageIndex: number }) => void;
  onReview: () => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [uploadedPages, setUploadedPages] = useState(uploadedPageIndexes);
  const pageIndexes = Array.from({ length: pageCount }, (_, index) => index);
  const nextPageIndex = pageIndexes.find((index) => !uploadedPages.includes(index));

  function firstFreePageIndex(taken: number[]): number {
    return pageIndexes.find((index) => !taken.includes(index)) ?? 0;
  }

  function stageFiles(files: FileList | File[]) {
    setError('');
    const list = Array.from(files);
    const invalid = list.find(
      (file) =>
        !['image/png', 'image/jpeg'].includes(file.type) ||
        file.size > 30 * 1024 * 1024,
    );
    if (invalid) {
      setError('Każdy plik musi być PNG lub JPG o rozmiarze do 30 MB.');
      return;
    }
    setStaged((current) => {
      const taken = [...uploadedPages, ...current.map((s) => s.pageIndex)];
      const additions = list.map((file) => {
        const pageIndex = firstFreePageIndex(taken);
        taken.push(pageIndex);
        return { id: `staged-${stagingCounter++}`, file, pageIndex };
      });
      return [...current, ...additions];
    });
  }

  function updateStagedPage(id: string, pageIndex: number) {
    setStaged((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, pageIndex } : entry)),
    );
  }

  function removeStaged(id: string) {
    setStaged((current) => current.filter((entry) => entry.id !== id));
  }

  async function confirmUpload() {
    if (!staged.length || busy || disabled) return;
    setBusy(true);
    setError('');
    const failed: string[] = [];
    for (const entry of staged) {
      try {
        const data = new FormData();
        data.append('file', entry.file);
        data.append('pageIndex', String(entry.pageIndex));
        const result = await requestJson<Scan & { pageIndex: number }>(
          `/api/projects/${projectId}/scans`,
          { method: 'POST', body: data },
        );
        if (result.alignmentStatus !== 'aligned') {
          throw new Error(
            'Nie udało się odczytać znaczników. Zeskanuj całą stronę bez przycinania rogów.',
          );
        }
        setUploadedPages((current) =>
          current.includes(result.pageIndex)
            ? current
            : [...current, result.pageIndex].sort((a, b) => a - b),
        );
        onUploaded(result);
        setStaged((current) => current.filter((s) => s.id !== entry.id));
      } catch (err) {
        failed.push(`${entry.file.name}: ${errorMessage(err)}`);
      }
    }
    if (failed.length) setError(failed.join(' · '));
    router.refresh();
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  return (
    <div>
      {pageCount > 1 && (
        <p className="field-hint">
          {nextPageIndex === undefined
            ? `Wgrano wszystkie ${pageCount} strony szablonu.`
            : `Zostało do wgrania ${pageCount - uploadedPages.length} z ${pageCount} stron. Dla każdego pliku wybierz, której strony dotyczy.`}
        </p>
      )}
      <div
        className={`upload-zone ${dragging ? 'dragging' : ''} ${disabled ? 'is-disabled' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled && !busy) stageFiles(e.dataTransfer.files);
        }}
      >
        <span className="upload-icon">
          <Icon name="scan" />
        </span>
        <h3>
          {busy ? 'Wgrywamy Twoje strony...' : 'Tu zaczyna się cyfrowa wersja'}
        </h3>
        <p>
          {busy
            ? 'Przetwarzamy skany po kolei.'
            : 'Przeciągnij jeden lub kilka skanów tutaj, albo wybierz pliki z komputera.'}
        </p>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          onChange={(e) => {
            if (e.target.files?.length) stageFiles(e.target.files);
          }}
          className="sr-only"
          id="scan-file"
          disabled={disabled || busy}
        />
        <button
          className="button secondary"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          <Icon name="plus" /> Wybierz skany
        </button>
        <small>
          {disabled
            ? 'Najpierw wygeneruj szablon w poprzednim etapie.'
            : 'PNG lub JPG · do 30 MB każdy · zalecane 300 DPI'}
        </small>
        {busy && (
          <div
            className="loading-bar"
            role="status"
            aria-label="Przetwarzanie skanów"
          />
        )}
      </div>
      {staged.length > 0 && (
        <div className="scan-history">
          <h3>Do wgrania ({staged.length})</h3>
          {staged.map((entry) => (
            <div className="history-row" key={entry.id}>
              <Icon name="scan" />
              <div>
                <strong>{entry.file.name}</strong>
              </div>
              {pageCount > 1 ? (
                <label className="sr-only" htmlFor={`page-select-${entry.id}`}>
                  Strona szablonu dla pliku {entry.file.name}
                </label>
              ) : null}
              {pageCount > 1 && (
                <select
                  id={`page-select-${entry.id}`}
                  value={entry.pageIndex}
                  disabled={busy}
                  onChange={(e) =>
                    updateStagedPage(entry.id, Number(e.target.value))
                  }
                >
                  {pageIndexes.map((index) => (
                    <option key={index} value={index}>
                      Strona {index + 1} z {pageCount}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                aria-label={`Usuń ${entry.file.name} z listy`}
                title="Usuń z listy"
                disabled={busy}
                onClick={() => removeStaged(entry.id)}
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
          <div className="panel-footer">
            <span />
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => void confirmUpload()}
            >
              Wgraj {staged.length > 1 ? `${staged.length} plików` : 'plik'}{' '}
              <Icon name="arrow" />
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {nextPageIndex === undefined && (
        <div className="notice success" role="status">
          <p>Wszystkie strony zostały odczytane. Sprawdź teraz cały zestaw glifów.</p>
          <button type="button" className="button primary" onClick={onReview}>
            Przejdź do korekty <Icon name="arrow" />
          </button>
        </div>
      )}
    </div>
  );
}
