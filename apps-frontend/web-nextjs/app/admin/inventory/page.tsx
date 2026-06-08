'use client';

import { AdminInventoryPanel } from '@/components/AdminInventoryPanel';
import { AuthPanel } from '@/components/AuthPanel';

export default function AdminInventoryPage() {
  return (
    <main className="page">
      <AuthPanel>{({ profile }) => <AdminInventoryPanel profile={profile} />}</AuthPanel>
    </main>
  );
}
