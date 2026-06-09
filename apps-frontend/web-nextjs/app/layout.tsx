import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import '@flaticon/flaticon-uicons/css/regular/rounded.css';
import '@flaticon/flaticon-uicons/css/solid/rounded.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ungu Laundry',
  description: 'Premium laundry SaaS B2B2C with Supabase, Midtrans, and POS printing.',
};

function AppBootFallback() {
  return (
    <div className="device-stage device-fluid">
      <div className="device-frame">
        <div className="app-shell app-boot-shell" aria-busy="true" aria-label="Memuat Ungu Laundry">
          <header className="topbar">
            <div className="brand">
              <span className="brand-mark">
                <i className="fi fi-sr-washer" aria-hidden />
              </span>
              <span>
                Ungu Laundry
                <small>perawatan premium</small>
              </span>
            </div>

            <div className="boot-nav" aria-hidden>
              <span className="skeleton boot-nav-item" />
              <span className="skeleton boot-nav-item" />
              <span className="skeleton boot-nav-item" />
            </div>
          </header>

          <main className="app-content boot-content">
            <section className="boot-hero">
              <span className="skeleton skeleton-label" />
              <span className="skeleton boot-title" />
              <span className="skeleton boot-title short" />
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-line short" />
              <div className="boot-actions">
                <span className="skeleton boot-button" />
                <span className="skeleton boot-button secondary" />
              </div>
            </section>

            <section className="boot-card-grid" aria-hidden>
              <span className="skeleton skeleton-card" />
              <span className="skeleton skeleton-card" />
              <span className="skeleton skeleton-card" />
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <Suspense fallback={<AppBootFallback />}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
