'use client';
import Link from 'next/link';
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="page">
      <div className="empty-state" role="alert">
        <h1>Chwila przerwy w pracowni.</h1>
        <p>Nie udało się otworzyć tego widoku. Spróbuj ponownie.</p>
        <button className="button primary" onClick={reset}>
          Spróbuj ponownie
        </button>
        <p>
          <Link href="/" className="text-link">
            Wróć do projektów
          </Link>
        </p>
      </div>
    </main>
  );
}
