import Link from 'next/link';
import { listProjects } from '@/lib/db/projects';
import { getProjectSummary } from '@/lib/db/projectSummary';
import { ProjectLibrary } from '@/components/ProjectLibrary';
import { Icon } from '@/components/Icon';

export const dynamic = 'force-dynamic';
export default function HomePage() {
  const projects = listProjects().map((project) => ({
    ...project,
    ...getProjectSummary(project.id),
  }));
  return (
    <main id="main-content" className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">TWOJE PISMO, NOWE MOŻLIWOŚCI</p>
          <h1>
            Moje projekty<span className="heading-dot">.</span>
          </h1>
          <p className="muted">
            Miejsce, w którym charakter pisma staje się krojem.
          </p>
        </div>
        <Link href="/projects/new" className="button primary">
          <Icon name="plus" /> Nowy projekt
        </Link>
      </div>
      <section className="hero-card" aria-label="Twoje odręczne pismo">
        <div className="hero-copy">
          <span className="eyebrow">OD KARTKI DO WŁASNEGO FONTU</span>
          <h2>
            Dobry krój zaczyna się
            <br />
            od Twojej ręki.
          </h2>
          <p>
            Wybierz znaki, wypełnij szablon i nadaj swoim
            <br className="desktop-break" /> słowom niepowtarzalny charakter.
          </p>
          <Link href="/projects/new" className="text-link">
            Stwórz coś swojego <Icon name="arrow" />
          </Link>
        </div>
        <div className="type-specimen" aria-hidden="true">
          <span className="specimen-caption">STUDIUM LITERY / 01</span>
          <span className="specimen-letters">
            Aa<span className="specimen-dot">.</span>
          </span>
          <span className="specimen-baseline" />
          <span className="specimen-foot">Każda kreska ma znaczenie.</span>
        </div>
      </section>
      <ProjectLibrary projects={projects} />
      <section id="how-it-works" className="how-section">
        <div className="section-heading">
          <h2>Od pomysłu do pierwszego słowa</h2>
          <span className="muted">Cztery proste etapy</span>
        </div>
        <div className="how-grid">
          {[
            [
              '01',
              'Wybierz znaki',
              'Zacznij od gotowego alfabetu i dodaj własne ligatury.',
            ],
            [
              '02',
              'Chwyć za długopis',
              'Pobierz PDF, wydrukuj go i wypełnij pola swoim pismem.',
            ],
            [
              '03',
              'Dopracuj detale',
              'Wgraj skan, sprawdź glify i ustaw odstępy między znakami.',
            ],
            [
              '04',
              'Pisz po swojemu',
              'Zbuduj font i zainstaluj plik OTF lub TTF na komputerze.',
            ],
          ].map(([number, title, text]) => (
            <article key={number}>
              <span className="step-index">{number}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
