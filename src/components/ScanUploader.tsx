'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestJson, errorMessage } from '@/lib/client';
import type { Scan } from '@/lib/db/scans';
import { Icon } from './Icon';
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
  const [fileName, setFileName] = useState('');
  const [uploadedPages, setUploadedPages] = useState(uploadedPageIndexes);
  const nextPageIndex = Array.from({ length: pageCount }, (_, index) => index).find(
    (index) => !uploadedPages.includes(index),
  );
  async function upload(file?: File) {
    if (!file || busy || disabled) return;
    setError('');
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Wybierz skan w formacie PNG lub JPG.');
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setError('Plik jest za duży. Maksymalny rozmiar to 30 MB.');
      return;
    }
    setBusy(true);
    setFileName(file.name);
    try {
      const data = new FormData();
      data.append('file', file);
      const result = await requestJson<Scan & { pageIndex: number }>(
        `/api/projects/${projectId}/scans`,
        { method: 'POST', body: data },
      );
      if (result.alignmentStatus !== 'aligned')
        throw new Error(
          'Nie udało się odczytać znaczników. Zeskanuj całą stronę bez przycinania rogów i spróbuj ponownie.',
        );
      setUploadedPages((current) =>
        current.includes(result.pageIndex)
          ? current
          : [...current, result.pageIndex].sort((a, b) => a - b),
      );
      onUploaded(result);
      router.refresh();
    } catch (error) {
      setError(errorMessage(error));
      router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <div>
      {pageCount > 1 && (
        <p className="field-hint">
          {nextPageIndex === undefined
            ? `Wgrano wszystkie ${pageCount} strony szablonu.`
            : `Teraz wgraj stronę ${nextPageIndex + 1} z ${pageCount}. Kolejność stron jest ustawiana automatycznie.`}
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
          void upload(e.dataTransfer.files[0]);
        }}
      >
        <span className="upload-icon">
          <Icon name="scan" />
        </span>
        <h3>
          {busy
            ? 'Odczytujemy Twoje pismo...'
            : 'Tu zaczyna się cyfrowa wersja'}
        </h3>
        <p>
          {busy
            ? fileName
            : 'Przeciągnij skan tutaj lub wybierz plik z komputera.'}
        </p>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => void upload(e.target.files?.[0])}
          className="sr-only"
          id="scan-file"
          disabled={disabled || busy}
        />
        <button
          className="button secondary"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          <Icon name="plus" /> Wybierz skan
        </button>
        <small>
          {disabled
            ? 'Najpierw wygeneruj szablon w poprzednim etapie.'
            : 'PNG lub JPG · do 30 MB · zalecane 300 DPI'}
        </small>
        {busy && (
          <div
            className="loading-bar"
            role="status"
            aria-label="Przetwarzanie skanu"
          />
        )}
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {nextPageIndex === undefined && (
        <div className="notice success" role="status">
          <p>Wszystkie strony zostały odczytane. Sprawdź teraz cały zestaw glifów.</p>
          <button
            type="button"
            className="button primary"
            onClick={onReview}
          >
            Przejdź do korekty <Icon name="arrow" />
          </button>
        </div>
      )}
    </div>
  );
}
