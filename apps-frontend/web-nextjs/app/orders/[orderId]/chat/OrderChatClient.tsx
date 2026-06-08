'use client';

import { AuthPanel } from '@/components/AuthPanel';
import { InteractiveChatLaundry } from '@/components/InteractiveChatLaundry';

type Props = {
  orderId: string;
};

export function OrderChatClient({ orderId }: Props) {
  return (
    <main className="page">
      <AuthPanel>{({ profile }) => <InteractiveChatLaundry orderId={orderId} profile={profile} />}</AuthPanel>
    </main>
  );
}
