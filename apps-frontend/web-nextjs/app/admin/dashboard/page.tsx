'use client';

import { AdminOrderRealtimePrint } from '@/components/AdminOrderRealtimePrint';
import { AuthPanel } from '@/components/AuthPanel';

export default function AdminDashboardPage() {
  return (
    <main className="page">
      <AuthPanel>{({ profile }) => <AdminOrderRealtimePrint profile={profile} />}</AuthPanel>
    </main>
  );
}
