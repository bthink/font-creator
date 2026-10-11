'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestJson, errorMessage } from '@/lib/client';
import { Icon } from './Icon';

type StagedFile = {
  id: string;
  file: File;
  pageIndex: number;
  error?: string;
};

let stagingCounter = 0;

export function ScanUploader({
  projectId,
  disabled,
  pageCount,
  uploadedPageIndexes,
  onBusyChange,
}: {
  projectId: number;
  disabled?: boolean;
  pageCount: number;
  uploadedPageIndexes: number[];
  onBusyChange: (busy: boolean) => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const uploadedPages = uploadedPageIndexes;
  const [progress, setProgress] = useState('');
  const assignedPages = staged.filter((entry) => entry.pageIndex >= 0).map((entry) => entry.pageIndex);
  const duplicatePages = new Set(assignedPages).size !== assignedPages.length;
  const pageIndexes = Array.from({ length: pageCount }, (_, index) => index);
  const nextPageIndex = pageIndexes.find((index) => !uploadedPages.includes(index));

  function firstFreePageIndex(taken: number[]): number {
    return pageIndexes.find((index) => !taken.includes(index)) ?? -1;
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
      current.map((entry) => (entry.id === id ? { ...entry, pageIndex, error: undefined } : entry)),
    );
  }

  function removeStaged(id: string) {
    setStaged((current) => current.filter((entry) => entry.id !== id));
  }

  async function confirmUpload() {
    if (!staged.length || busy || disabled || duplicatePages || staged.some((entry) => entry.pageIndex < 0)) return;
    setBusy(true);
    onBusyChange(true);
    setError('');
    const failed: string[] = [];
    for (const [index, entry] of staged.entries()) {
      setProgress(`Przetwarzanie ${index + 1} z ${staged.length}: ${entry.file.name}`);
      try {
        const data = new FormData();
        data.append('file', entry.file);
        data.append('pageIndex', String(entry.pageIndex));
        const result = await requestJson<{ alignmentStatus: string; pageIndex: number }>(
          `/api/projects/${projectId}/scans`,
          { method: 'POST', body: data },
        );
        if (result.alignmentStatus !== 'aligned') {
          throw new Error(
            'Nie udało się odczytać znaczników. Zeskanuj całą stronę bez przycinania rogów.',
          );
        }
        setStaged((current) => current.filter((s) => s.id !== entry.id));
      } catch (err) {
        const message = errorMessage(err);
        failed.push(`${entry.file.name}: ${message}`);
        setStaged((current) => current.map((item) => item.id === entry.id ? { ...item, error: message } : item));
      }
    }
    if (failed.length) setError(failed.join(' · '));
    router.refresh();
    setBusy(false);
    onBusyChange(false);
    if (input.current) input.current.value = '';
  }

  return (
    <div>
      {!disabled && (
        <p className="field-hint">
          {nextPageIndex === undefined
            ? `Wgrano wszystkie ${pageCount} strony szablonu.`
            : `Zostało do wgrania ${pageCount - uploadedPages.length} z ${pageCount} stron. Brakujące strony: ${pageIndexes.filter((index) => !uploadedPages.includes(index)).map((index) => index + 1).join(', ')}.`}
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
          {busy ? 'Wgrywamy Twoje strony...' : 'Wybierz skany wypełnionego szablonu'}
        </h3>
        <p>
          {busy
            ? progress
            : 'Przeciągnij jeden lub kilka skanów tutaj, albo wybierz pliki z komputera.'}
        </p>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          onChange={(e) => {
            if (e.target.files?.length) stageFiles(e.target.files);
            e.target.value = '';
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
          <h3>Sprawdź strony przed wysłaniem ({staged.length})</h3>
          <p className="field-hint">Numer musi odpowiadać stronie wydrukowanego PDF. Program nie rozpoznaje numerów stron ze skanu.</p>
          {staged.map((entry) => (
            <div className="history-row" key={entry.id}>
              <StagedPreview file={entry.file} />
              <div>
                <strong>{entry.file.name}</strong>
                {uploadedPages.includes(entry.pageIndex) && <small>Wgrywasz ponownie tę stronę. Nowe glify będą wymagały sprawdzenia.</small>}
                {entry.error && <p className="form-error" role="alert">{entry.error}</p>}
              </div>
              {pageCount > 1 || entry.pageIndex < 0 ? (
                <label className="sr-only" htmlFor={`page-select-${entry.id}`}>
                  Strona szablonu dla pliku {entry.file.name}
                </label>
              ) : null}
              {(pageCount > 1 || entry.pageIndex < 0) && (
                <select
                  id={`page-select-${entry.id}`}
                  value={entry.pageIndex}
                  disabled={busy}
                  onChange={(e) =>
                    updateStagedPage(entry.id, Number(e.target.value))
                  }
                >
                  <option value={-1}>Wybierz stronę</option>
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
              disabled={busy || disabled || duplicatePages || staged.some((entry) => entry.pageIndex < 0)}
              onClick={() => void confirmUpload()}
            >
              {busy ? 'Przetwarzanie' : 'Wgraj i odczytaj'} ({staged.length}){' '}
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
      {duplicatePages && <p role="alert" className="notice error">Każdy plik musi mieć inny numer strony. Usuń nadmiarowy plik lub zmień przypisanie.</p>}
    </div>
  );
}

function StagedPreview({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (image.current) image.current.src = url;
    if (link.current) link.current.href = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  // Local files are previewed before they reach the server.
  return (
    <a ref={link} target="_blank" rel="noopener noreferrer" aria-label={`Otwórz podgląd ${file.name}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={image} className="scan-thumbnail" alt={`Podgląd ${file.name}`} />
    </a>
  );
}
