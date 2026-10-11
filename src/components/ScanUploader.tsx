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
  identification: 'reading' | 'automatic' | 'manual' | 'invalid';
  replaceConfirmed?: boolean;
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

  async function stageFiles(files: FileList | File[]) {
    if (busy || disabled) return;
    setError('');
    const list = Array.from(files);
    if (list.some((file) => !['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > 30 * 1024 * 1024)) {
      setError('Każdy plik musi być PNG lub JPG o rozmiarze do 30 MB.');
      return;
    }
    const additions: StagedFile[] = list.map((file) => ({ id: `staged-${stagingCounter++}`, file, pageIndex: -1, identification: 'reading' }));
    setStaged((current) => [...current, ...additions]);
    setBusy(true);
    onBusyChange(true);
    try {
      for (const [index, entry] of additions.entries()) {
        setProgress(`Rozpoznawanie strony ${index + 1} z ${additions.length}: ${entry.file.name}`);
        try {
          const data = new FormData();
          data.append('file', entry.file);
          const result = await requestJson<{ pageIndex: number | null }>(`/api/projects/${projectId}/scans/identify`, { method: 'POST', body: data });
          setStaged((current) => current.map((item) => item.id === entry.id ? {
            ...item,
            pageIndex: result.pageIndex ?? (pageCount === 1 ? 0 : -1),
            identification: result.pageIndex === null ? 'manual' : 'automatic',
          } : item));
        } catch (err) {
          setStaged((current) => current.map((item) => item.id === entry.id ? { ...item, identification: 'invalid', error: errorMessage(err) } : item));
        }
      }
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  function updateStagedPage(id: string, pageIndex: number) {
    setStaged((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, pageIndex, error: undefined, replaceConfirmed: false } : entry)),
    );
  }

  function removeStaged(id: string) {
    setStaged((current) => current.filter((entry) => entry.id !== id));
  }

  const needsAttention = staged.some((entry) => entry.pageIndex < 0 || entry.identification === 'invalid' || entry.identification === 'reading' || (uploadedPages.includes(entry.pageIndex) && !entry.replaceConfirmed));

  async function confirmUpload() {
    if (!staged.length || busy || disabled || duplicatePages || needsAttention) return;
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
          {busy ? 'Przygotowujemy Twoje strony...' : 'Wybierz skany wypełnionego szablonu'}
        </h3>
        <p>
          {busy
            ? progress
            : 'Wybierz skany w dowolnej kolejności. Kod na każdej stronie przypisze je do właściwego miejsca.'}
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
          <h3>Twoje strony ({staged.length})</h3>
          <p className="field-hint">Strony z kodem przypiszemy automatycznie. Przy starszych wydrukach lub nieczytelnym kodzie wybierz numer widoczny na PDF.</p>
          {staged.map((entry) => (
            <div className="history-row" key={entry.id}>
              <StagedPreview file={entry.file} />
              <div>
                <strong>{entry.file.name}</strong>
                {entry.identification === 'reading' && <small role="status">Odczytujemy kod strony...</small>}
                {entry.identification === 'automatic' && <span className="badge green">Strona {entry.pageIndex + 1} z {pageCount} · rozpoznana</span>}
                {entry.identification === 'manual' && <small>Nie odczytano kodu. Sprawdź podgląd i numer na wydruku.</small>}
                {uploadedPages.includes(entry.pageIndex) && entry.identification !== 'invalid' && (
                  <label className="rescan-confirmation">
                    <input type="checkbox" checked={!!entry.replaceConfirmed} disabled={busy} onChange={(event) => setStaged((current) => current.map((item) => item.id === entry.id ? { ...item, replaceConfirmed: event.target.checked } : item))} />
                    Wgraj ponownie stronę {entry.pageIndex + 1}. Nowe glify wymagają sprawdzenia.
                  </label>
                )}
                {entry.error && <p className="form-error" role="alert">{entry.error}</p>}
              </div>
              {entry.identification === 'manual' ? (
                <label className="sr-only" htmlFor={`page-select-${entry.id}`}>
                  Strona szablonu dla pliku {entry.file.name}
                </label>
              ) : null}
              {entry.identification === 'manual' && (
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
              disabled={busy || disabled || duplicatePages || needsAttention}
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
