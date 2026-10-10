'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { requestJson, errorMessage } from '@/lib/client';
import { Icon } from './Icon';
export function ScanUploader({
  projectId,
  disabled,
  pageCount,
}: {
  projectId: number;
  disabled?: boolean;
  pageCount: number;
}) {
  const router = useRouter();
  const [pageIndex, setPageIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [reviewId, setReviewId] = useState<number | null>(null);
  async function upload(file?: File) {
    if (!file || busy || disabled) return;
    setError('');
    setReviewId(null);
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
      data.append('pageIndex', String(pageIndex));
      const result = await requestJson<{ id: number; alignmentStatus: string }>(
        `/api/projects/${projectId}/scans`,
        { method: 'POST', body: data },
      );
      if (result.alignmentStatus !== 'aligned')
        throw new Error(
          'Nie udało się odczytać znaczników. Zeskanuj całą stronę bez przycinania rogów i spróbuj ponownie.',
        );
      setReviewId(result.id);
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
        <label className="field-label">
          Którą stronę szablonu wgrywasz?
          <select
            className="page-select"
            value={pageIndex}
            onChange={(e) => setPageIndex(Number(e.target.value))}
            disabled={busy || disabled}
          >
            {Array.from({ length: pageCount }, (_, index) => (
              <option value={index} key={index}>
                Strona {index + 1} z {pageCount}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Wgraj każdą stronę osobno, wybierając jej numer z PDF.
          </span>
        </label>
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
      {reviewId !== null && (
        <div className="notice success" role="status">
          <p>Skan został odczytany. Sprawdź wyodrębnione glify.</p>
          <Link
            className="button primary"
            href={`/projects/${projectId}/review?scanId=${reviewId}`}
          >
            Przejdź do korekty <Icon name="arrow" />
          </Link>
        </div>
      )}
    </div>
  );
}
