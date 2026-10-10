import type { Metadata } from 'next';
import { StudioShell } from '@/components/StudioShell';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Font Creator | Twoje studio pisma',
    template: '%s | Font Creator',
  },
  description:
    'Zamień swoje odręczne pismo we własny font. Wybierz znaki, zeskanuj szablon i dopracuj każdy glif.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pl">
      <body>
        <StudioShell>{children}</StudioShell>
      </body>
    </html>
  );
}
