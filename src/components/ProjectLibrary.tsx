'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Project } from '@/lib/db/projects';
import type { ProjectSummary } from '@/lib/db/projectSummary';
import { formatDate } from '@/lib/client';
import { Icon } from './Icon';

export function ProjectLibrary({
  projects,
}: {
  projects: (Project & ProjectSummary)[];
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const visible = projects
    .filter((p) =>
      p.name.toLocaleLowerCase('pl').includes(query.toLocaleLowerCase('pl')),
    )
    .sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name, 'pl') : b.id - a.id,
    );
  return (
    <section className="library">
      <div className="section-heading library-toolbar">
        <h2>
          Twoja kolekcja <span className="count">{projects.length}</span>
        </h2>
        <div className="toolbar-controls">
          <label className="search-field">
            <Icon name="search" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj projektu..."
              aria-label="Szukaj projektu"
            />
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Kolejność projektów"
          >
            <option value="newest">Najnowsze</option>
            <option value="name">Nazwa A-Z</option>
          </select>
        </div>
      </div>
      {projects.length === 0 ? (
        <div className="empty-state">
          <span className="empty-monogram">Ag</span>
          <h3>Twój pierwszy krój czeka na Ciebie</h3>
          <p>Wystarczy kartka, długopis i odrobina własnego charakteru.</p>
          <Link href="/projects/new" className="button primary">
            <Icon name="plus" /> Utwórz pierwszy projekt
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state compact">
          <h3>Nie znaleziono projektu</h3>
          <p>Spróbuj innej nazwy lub wyczyść wyszukiwanie.</p>
          <button className="button secondary" onClick={() => setQuery('')}>
            Wyczyść filtr
          </button>
        </div>
      ) : (
        <div className="project-grid">
          {visible.map((project, index) => (
            <Link
              className="project-card"
              href={`/projects/${project.id}`}
              key={project.id}
            >
              <div className={`project-specimen tone-${index % 3}`}>
                <span className="badge">
                  {project.builds
                    ? 'Gotowy font'
                    : project.scans
                      ? 'W opracowaniu'
                      : 'Szkic'}
                </span>
                <span className="project-letters" aria-hidden="true">
                  {project.name.slice(0, 1).toUpperCase()}
                  {project.name.slice(0, 1).toLowerCase()}
                </span>
                <span className="specimen-label">PRÓBKA TYPOGRAFICZNA</span>
              </div>
              <div className="project-card-body">
                <div className="project-title">
                  <h3>{project.name}</h3>
                  <Icon name="arrow" />
                </div>
                <p>
                  {project.characters} znaków <span>·</span> {project.approved}{' '}
                  zatwierdzonych
                </p>
                <div className="project-card-bottom">
                  <span>{formatDate(project.createdAt)}</span>
                  <span>Otwórz projekt</span>
                </div>
              </div>
            </Link>
          ))}
          <Link href="/projects/new" className="new-project-card">
            <span className="plus-circle">
              <Icon name="plus" />
            </span>
            <h3>Nowy pomysł?</h3>
            <p>Dodaj kolejny charakter do kolekcji.</p>
            <span className="text-link">
              Utwórz projekt <Icon name="arrow" />
            </span>
          </Link>
        </div>
      )}
    </section>
  );
}
