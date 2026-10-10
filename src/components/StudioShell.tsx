'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon';

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="studio-shell">
      <a href="#main-content" className="skip-link">
        Przejdź do treści
      </a>
      <aside className="sidebar">
        <Link
          href="/"
          className="brand"
          aria-label="Font Creator - strona główna"
        >
          <span className="brand-mark">
            f<span>.</span>
          </span>
          <span>
            font creator<small>TWOJE STUDIO PISMA</small>
          </span>
        </Link>
        <div className="sidebar-label">PRZESTRZEŃ ROBOCZA</div>
        <nav aria-label="Nawigacja główna">
          <Link
            href="/"
            className={`nav-item ${pathname !== '/projects/new' ? 'active' : ''}`}
            aria-current={pathname === '/' ? 'page' : undefined}
          >
            <Icon name="grid" /> Moje projekty
          </Link>
          <Link
            href="/projects/new"
            className={`nav-item ${pathname === '/projects/new' ? 'active' : ''}`}
            aria-current={pathname === '/projects/new' ? 'page' : undefined}
          >
            <Icon name="plus" /> Nowy projekt
          </Link>
        </nav>
        <div className="sidebar-note">
          <span className="note-symbol">Aa</span>
          <h3>Odręczne. Osobiste. Twoje.</h3>
          <p>Od pierwszej kreski na papierze do własnego kroju pisma.</p>
          <Link href="/#how-it-works">
            Jak to działa <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="local-status">
          <span className="status-dot" />
          <span>
            Zapis lokalny<small>Twoje pliki zostają na tym komputerze</small>
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>Pracownia typografii</span>
          <span className="topbar-detail">
            Z papieru na ekran <Icon name="type" />
          </span>
        </header>
        {children}
        <footer className="app-footer">
          <span>Font Creator</span>
          <span>Małe niedoskonałości. Wielki charakter.</span>
        </footer>
      </div>
    </div>
  );
}
