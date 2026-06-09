'use client';

import { AdminChatInbox } from '@/components/AdminChatInbox';
import { AuthPanel } from '@/components/AuthPanel';

export default function AdminChatPage() {
  return (
    <main className="page">
      <AuthPanel>{({ profile }) => <AdminChatInbox profile={profile} />}</AuthPanel>
    </main>
  );
}
