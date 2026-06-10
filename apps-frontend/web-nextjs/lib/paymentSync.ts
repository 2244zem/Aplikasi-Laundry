import { getValidatedAuthSession } from '@/lib/authSession';
import type { LaundryOrder } from '@/lib/types';

type SyncPaymentResult = {
  midtrans_status?: string | null;
  order?: LaundryOrder;
  payment_status?: LaundryOrder['status_pembayaran'];
  updated?: boolean;
};

function readSyncError(payload: unknown, status: number) {
  if (payload && typeof payload === 'object') {
    const error = (payload as { error?: unknown }).error;

    if (typeof error === 'string') {
      return error;
    }
  }

  return `Gagal sinkron status pembayaran (${status}).`;
}

export async function syncLaundryPaymentStatus(orderId: string): Promise<SyncPaymentResult> {
  const bffBaseUrl = process.env.NEXT_PUBLIC_BFF_BASE_URL;

  if (!bffBaseUrl) {
    throw new Error('NEXT_PUBLIC_BFF_BASE_URL belum diisi.');
  }

  const { session, errorMessage } = await getValidatedAuthSession();

  if (!session?.access_token) {
    throw new Error(errorMessage ?? 'Sesi login belum siap. Login ulang lalu coba lagi.');
  }

  const response = await fetch(`${bffBaseUrl}/api/v1/payment/sync-laundry-order-status`, {
    body: JSON.stringify({ orderId }),
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.ok) {
    throw new Error(readSyncError(payload, response.status));
  }

  return payload as SyncPaymentResult;
}
