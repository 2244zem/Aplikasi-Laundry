'use client';

import { AuthPanel } from '@/components/AuthPanel';
import { CustomerPaymentInfo } from '@/components/CustomerPaymentInfo';

export default function OrderPaymentPage() {
  return (
    <main className="page">
      <AuthPanel>{({ profile }) => <CustomerPaymentInfo profile={profile} />}</AuthPanel>
    </main>
  );
}
