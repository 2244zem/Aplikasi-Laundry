import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardList, LayoutDashboard, ReceiptText, Shirt } from 'lucide-react';
import './globals.css';

export const metadata: Metadata = {
  title: 'ScaleWash',
  description: 'Laundry SaaS B2B2C with Supabase, Midtrans, and POS printing.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <Link className="brand" href="/">
              <span className="brand-mark">
                <Shirt aria-hidden size={18} />
              </span>
              ScaleWash
            </Link>
            <nav className="nav-links" aria-label="Navigasi utama">
              <Link className="nav-link" href="/orders/new">
                <ClipboardList aria-hidden size={17} />
                Buat Order
              </Link>
              <Link className="nav-link" href="/admin/dashboard">
                <LayoutDashboard aria-hidden size={17} />
                Admin
              </Link>
              <Link className="nav-link" href="/admin/finance">
                <ReceiptText aria-hidden size={17} />
                Finance
              </Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
