'use client';

import { AuthPanel } from '@/components/AuthPanel';
import { CustomerPaymentResult } from '@/components/CustomerPaymentResult';

export default function OrderPaymentResultPage() {
  return (
    <main className="page">
      <AuthPanel>{({ profile }) => <CustomerPaymentResult profile={profile} />}</AuthPanel>
    </main>
  );
}
