'use client';

import { AdminFinancePanel } from '@/components/AdminFinancePanel';
import { AuthPanel } from '@/components/AuthPanel';

export default function AdminFinancePage() {
  return (
    <main className="page">
      <AuthPanel>{({ profile }) => <AdminFinancePanel profile={profile} />}</AuthPanel>
    </main>
  );
}
