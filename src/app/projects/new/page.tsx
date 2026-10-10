'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { requestJson, errorMessage } from '@/lib/client';
import { Icon } from '@/components/Icon';

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const project = await requestJson<{ id: number }>('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      router.push(`/projects/${project.id}`);
      router.refresh();
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  return (
    <main id="main-content" className="page">
      <Link href="/" className="back-link">
        <Icon name="back" /> Moje projekty
      </Link>
      <div className="create-layout">
        <div className="create-form">
          <p className="eyebrow">POCZĄTEK CZEGOŚ OSOBISTEGO</p>
          <h1>
            Nadaj mu imię<span className="heading-dot">.</span>
          </h1>
          <p className="intro muted">
            Każdy krój ma swoją historię. Twoja zaczyna się tutaj.
          </p>
          <form onSubmit={handleSubmit}>
            <label htmlFor="project-name" className="field-label">
              Nazwa projektu
            </label>
            <input
              id="project-name"
              className="text-input large-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Listy z podróży"
              maxLength={80}
              required
              autoFocus
              autoComplete="off"
              aria-describedby="name-help"
            />
            <p id="name-help" className="field-hint">
              Ta nazwa będzie również nazwą Twojego fontu.
            </p>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="button primary"
            >
              {busy ? 'Tworzenie projektu...' : 'Utwórz projekt'}
              <Icon name="arrow" />
            </button>
          </form>
          <div className="quiet-note">
            <Icon name="file" />
            <p>
              W następnym kroku wybierzesz alfabet i pobierzesz szablon do
              wypełnienia.
            </p>
          </div>
        </div>
        <div className="create-specimen">
          <span className="eyebrow">MIEJSCE NA TWÓJ CHARAKTER</span>
          <span className="create-letters" aria-hidden="true">
            Abc.
          </span>
          <span className="create-name">
            {name.trim() || 'Twój przyszły font'}
          </span>
          <span className="muted">Pisane po swojemu.</span>
        </div>
      </div>
    </main>
  );
}
