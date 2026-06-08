import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import '@flaticon/flaticon-uicons/css/regular/rounded.css';
import '@flaticon/flaticon-uicons/css/solid/rounded.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'ScaleWash',
  description: 'Laundry SaaS B2B2C with Supabase, Midtrans, and POS printing.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
