'use client';

import { AuthPanel } from '@/components/AuthPanel';
import { CustomerOrderForm } from '@/components/CustomerOrderForm';

export default function NewOrderPage() {
  return (
    <main className="page">
      <AuthPanel>{({ profile }) => <CustomerOrderForm profile={profile} />}</AuthPanel>
    </main>
  );
}
