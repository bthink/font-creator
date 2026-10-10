'use client';
import { useState } from 'react';
import { errorMessage } from '@/lib/client';
import { Icon } from './Icon';
export function TemplateGenerator({
  projectId,
  disabled,
  onGenerated,
}: {
  projectId: number;
  disabled?: boolean;
  onGenerated?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  async function generate() {
    setBusy(true);
    setError('');
    setDone(false);
    try {
      const response = await fetch(`/api/projects/${projectId}/templates`, {
        method: 'POST',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? 'Nie udało się wygenerować szablonu.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `szablon-${projectId}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDone(true);
      onGenerated?.();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="download-template">
        <div className="paper-preview" aria-hidden="true">
          <span>Twój alfabet</span>
          <div>
            {'AaBbCcDdEeFf'.split('').map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </div>
        </div>
        <div>
          <span className="eyebrow">SZABLON DO DRUKU</span>
          <h3>Trochę papieru. Dużo Ciebie.</h3>
          <p>
            Siatka znaków ze znacznikami do automatycznego wyrównania skanu.
          </p>
          <button
            type="button"
            className="button primary"
            onClick={generate}
            disabled={disabled || busy}
          >
            <Icon name="download" />
            {busy ? 'Przygotowywanie PDF...' : 'Pobierz szablon PDF'}
          </button>
          {disabled && (
            <p className="field-hint">
              Najpierw dodaj znaki w pierwszym etapie.
            </p>
          )}
        </div>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div role="status">
        {done && (
          <p className="notice success">
            Szablon jest gotowy. Wypełnij właśnie pobraną wersję przed wgraniem
            skanu.
          </p>
        )}
      </div>
    </div>
  );
}
