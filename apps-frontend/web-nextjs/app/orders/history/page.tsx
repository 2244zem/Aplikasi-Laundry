'use client';

import { AuthPanel } from '@/components/AuthPanel';
import { CustomerOrderHistory } from '@/components/CustomerOrderHistory';

export default function OrderHistoryPage() {
  return (
    <main className="page">
      <AuthPanel>{({ profile }) => <CustomerOrderHistory profile={profile} />}</AuthPanel>
    </main>
  );
}
