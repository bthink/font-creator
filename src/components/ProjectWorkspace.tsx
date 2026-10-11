'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Project } from '@/lib/db/projects';
import type { ProjectSummary } from '@/lib/db/projectSummary';
import type { GlyphSetEntry } from '@/lib/db/glyphSets';
import type { Build } from '@/lib/db/builds';
import type { Scan } from '@/lib/db/scans';
import type { GlyphWithChar } from '@/lib/db/glyphs';
import { GlyphSetEditor } from './GlyphSetEditor';
import { TemplateGenerator } from './TemplateGenerator';
import { ScanUploader } from './ScanUploader';
import { FontBuildPanel } from './FontBuildPanel';
import { GlyphReviewGrid } from './GlyphReviewGrid';
import { Icon } from './Icon';
import { formatDate, requestJson, errorMessage } from '@/lib/client';

const steps = ['Znaki', 'Szablon', 'Skan', 'Korekta glifów', 'Gotowy font'];
export function ProjectWorkspace({
  project,
  initialEntries,
  initialBuilds,
  scans,
  summary,
  hasTemplate,
  pageCount,
  uploadedPageIndexes,
  initialGlyphs,
  initialStep,
}: {
  project: Project;
  initialEntries: GlyphSetEntry[];
  initialBuilds: Build[];
  scans: Scan[];
  summary: ProjectSummary;
  hasTemplate: boolean;
  pageCount: number;
  uploadedPageIndexes: number[];
  initialGlyphs: GlyphWithChar[];
  initialStep?: string;
}) {
  const [step, setStep] = useState(
    initialStep && /^[1-5]$/.test(initialStep) ? Number(initialStep) - 1 : 0,
  );
  const [entries, setEntries] = useState(initialEntries);
  const [templateReady, setTemplateReady] = useState(hasTemplate);
  const [charactersChanged, setCharactersChanged] = useState(false);
  const [scanHistory, setScanHistory] = useState(scans);
  const [scanError, setScanError] = useState('');
  async function removeScan(scan: Scan) {
    if (
      !window.confirm(
        `Usunąć ${scan.originalFilename ?? `skan #${scan.id}`}? Wyodrębnione z niego glify również zostaną usunięte.`,
      )
    )
      return;
    try {
      await requestJson(`/api/projects/${project.id}/scans/${scan.id}`, {
        method: 'DELETE',
      });
      setScanHistory((current) => current.filter((s) => s.id !== scan.id));
    } catch (err) {
      setScanError(errorMessage(err));
    }
  }
  function navigate(next: number) {
    setStep(next);
    document.querySelector('.workflow-tabs')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    window.history.replaceState(null, '', `?step=${next + 1}`);
  }
  const titles = [
    'Zacznij od alfabetu.',
    'Przenieś pomysł na papier.',
    'Najpierw zbierz wszystkie strony.',
    'Twój charakter, w każdym znaku.',
    'Czas napisać coś swojego.',
  ];
  const descriptions = [
    'Wybierz gotowe zestawy lub zbuduj własną kolekcję znaków.',
    'Wydrukuj szablon i wypełnij go tak, jak lubisz pisać.',
    'Wgraj każdą stronę wypełnionego szablonu. Kolejność zostanie ustawiona automatycznie.',
    'Dopracuj odstępy i zatwierdź glify z całego szablonu.',
    'Zbuduj font z zatwierdzonych glifów i zabierz go do swoich projektów.',
  ];
  return (
    <main id="main-content" className="page">
      <Link href="/" className="back-link">
        <Icon name="back" /> Moje projekty
      </Link>
      <div className="page-heading project-heading">
        <div>
          <p className="eyebrow">PROJEKT FONTU</p>
          <h1>
            {project.name}
            <span className="heading-dot">.</span>
          </h1>
        </div>
        <span className="badge green">
          <span className="status-dot" /> Zapis lokalny
        </span>
      </div>
      <div
        className="workflow-tabs"
        role="tablist"
        aria-label="Etapy tworzenia fontu"
      >
        {steps.map((label, index) => (
          <button
            key={label}
            id={`step-${index}`}
            role="tab"
            aria-selected={step === index}
            aria-controls={`panel-${index}`}
            tabIndex={step === index ? 0 : -1}
            onKeyDown={(event) => {
              if (
                ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)
              ) {
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                  ? 4
                      : (index + (event.key === 'ArrowRight' ? 1 : 4)) % 5;
                navigate(next);
                document.getElementById(`step-${next}`)?.focus();
              }
            }}
            onClick={() => navigate(index)}
            className={step === index ? 'selected' : ''}
          >
            <span className="tab-number">0{index + 1}</span>
            {label}
          </button>
        ))}
      </div>
      <div className="workspace-layout">
        <section
          className="workspace-panel"
          role="tabpanel"
          id={`panel-${step}`}
          aria-labelledby={`step-${step}`}
        >
          <div className="workspace-title">
            <p className="eyebrow">ETAP 0{step + 1} / 05</p>
            <h2>{titles[step]}</h2>
            <p className="muted">{descriptions[step]}</p>
          </div>
          <div hidden={step !== 0}>
            <GlyphSetEditor
              projectId={project.id}
              initialEntries={initialEntries}
              onEntriesChange={(next) => {
                setEntries(next);
                setCharactersChanged(true);
                setTemplateReady(false);
              }}
            />
            <div className="panel-footer">
              <span className="muted">
                {entries.length} znaków w Twoim zestawie
              </span>
              <button
                className="button primary"
                onClick={() => navigate(1)}
                disabled={!entries.length}
              >
                Przejdź do szablonu <Icon name="arrow" />
              </button>
            </div>
          </div>
          <div hidden={step !== 1}>
            <TemplateGenerator
              projectId={project.id}
              disabled={!entries.length}
              onGenerated={() => {
                setTemplateReady(true);
                setCharactersChanged(false);
              }}
            />
            <div className="instruction-list">
              {[
                [
                  '01',
                  'Drukuj w skali 100%',
                  'Nie dopasowuj strony do obszaru wydruku. Zachowaj wszystkie znaczniki w rogach.',
                ],
                [
                  '02',
                  'Wypełnij pola ciemnym długopisem',
                  'Pisz pod literą wzorcową. Staraj się nie dotykać linii siatki.',
                ],
                [
                  '03',
                  'Zeskanuj całą stronę',
                  'Najlepiej w 300 DPI, jako PNG lub JPG. Unikaj cieni i zagięć papieru.',
                ],
              ].map(([n, title, text]) => (
                <div key={n}>
                  <span className="step-index">{n}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="panel-footer">
              <button className="button secondary" onClick={() => navigate(0)}>
                <Icon name="back" /> Znaki
              </button>
              <button
                className="button primary"
                onClick={() => navigate(2)}
                disabled={!templateReady}
              >
                Mam gotowy skan <Icon name="arrow" />
              </button>
            </div>
          </div>
          <div hidden={step !== 2}>
            {charactersChanged && (
              <p className="notice">
                Zestaw znaków został zmieniony. Wygeneruj i wypełnij nowy
                szablon przed wgraniem skanu.
              </p>
            )}
            <ScanUploader
              projectId={project.id}
              disabled={!templateReady}
              pageCount={pageCount}
              uploadedPageIndexes={uploadedPageIndexes}
              onUploaded={(scan) =>
                setScanHistory((current) => [scan, ...current])
              }
              onReview={() => navigate(3)}
            />
            {scanHistory.length > 0 && (
              <div className="scan-history">
                <h3>Poprzednie skany</h3>
                {scanError && (
                  <p className="form-error" role="alert">
                    {scanError}
                  </p>
                )}
                {scanHistory.map((scan) => (
                  <div className="history-row" key={scan.id}>
                    <Icon name="scan" />
                    <div>
                      <strong>Skan #{scan.id}</strong>
                      <small>
                        {scan.originalFilename ?? 'brak nazwy pliku'} ·{' '}
                        {formatDate(scan.uploadedAt)}
                      </small>
                    </div>
                    {scan.alignmentStatus === 'aligned' ? (
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => navigate(3)}
                      >
                        Sprawdź glify <Icon name="arrow" />
                      </button>
                    ) : (
                      <span className="badge">
                        {scan.alignmentStatus === 'failed'
                          ? 'Wgraj ponownie'
                          : 'Nieprzetworzony'}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={`Usuń skan ${scan.originalFilename ?? scan.id}`}
                      title="Usuń skan"
                      onClick={() => removeScan(scan)}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="panel-footer">
              <button className="button secondary" onClick={() => navigate(1)}>
                <Icon name="back" /> Szablon
              </button>
              <button className="button primary" onClick={() => navigate(3)}>
                Przejdź do korekty <Icon name="arrow" />
              </button>
            </div>
          </div>
          <div hidden={step !== 3}>
            <GlyphReviewGrid
              key={initialGlyphs.map((glyph) => glyph.id).join('-')}
              projectId={project.id}
              glyphs={initialGlyphs}
            />
            <div className="review-bottom">
              <button className="button primary" onClick={() => navigate(4)}>
                Przejdź do budowy fontu <Icon name="arrow" />
              </button>
            </div>
          </div>
          <div hidden={step !== 4}>
            <FontBuildPanel
              projectId={project.id}
              initialBuilds={initialBuilds}
              approvedCount={summary.approved}
            />
          </div>
        </section>
        <aside className="project-aside">
          <div className="summary-card">
            <p className="eyebrow">TWÓJ KRÓJ W LICZBACH</p>
            <span className="summary-monogram" aria-hidden="true">
              Aa
            </span>
            <dl>
              <div>
                <dt>Znaki w zestawie</dt>
                <dd>{entries.length}</dd>
              </div>
              <div>
                <dt>Zatwierdzone glify</dt>
                <dd>{summary.approved}</dd>
              </div>
              <div>
                <dt>Wgrane skany</dt>
                <dd>{summary.scans}</dd>
              </div>
            </dl>
            <div className="progress-track">
              <span
                style={{
                  width: `${entries.length ? Math.min(100, (summary.approved / entries.length) * 100) : 0}%`,
                }}
              />
            </div>
            <p className="field-hint">
              {entries.length
                ? `${summary.approved} z ${entries.length} znaków gotowych do budowy`
                : 'Dodaj znaki, by rozpocząć'}
            </p>
          </div>
          <div className="aside-tip">
            <span className="eyebrow">MAŁA PODPOWIEDŹ</span>
            <p>
              {
                [
                  'Nie musisz zaczynać od zera. Gotowe zestawy obejmują też polskie znaki i interpunkcję.',
                  'Naturalne różnice między literami nadają fontowi osobisty charakter.',
                  'Wgraj wszystkie strony szablonu, zanim przejdziesz do korekty.',
                  'Przed zatwierdzeniem sprawdź kształt każdego glifu oraz szerokość odstępu.',
                  'Na macOS otwórz pobrany plik i wybierz „Zainstaluj” w Albumie z czcionkami.',
                ][step]
              }
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
