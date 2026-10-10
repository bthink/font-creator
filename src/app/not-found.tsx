import Link from 'next/link';
import { Icon } from '@/components/Icon';
export default function NotFound() {
  return (
    <main id="main-content" className="page">
      <div className="empty-state">
        <span className="empty-monogram">?</span>
        <h1>Ten szkic zaginął.</h1>
        <p>Nie znaleziono projektu lub skanu. Wróć do swojej kolekcji.</p>
        <Link href="/" className="button primary">
          <Icon name="back" /> Moje projekty
        </Link>
      </div>
    </main>
  );
}
