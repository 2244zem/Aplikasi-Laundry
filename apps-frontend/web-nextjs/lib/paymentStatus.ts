import type { LaundryOrder } from '@/lib/types';

type PaymentStatus = LaundryOrder['status_pembayaran'];

export function paymentStatusClass(status: PaymentStatus) {
  if (status === 'PAID') {
    return 'status done';
  }

  if (status === 'FAILED') {
    return 'status failed';
  }

  if (status === 'PENDING') {
    return 'status pending';
  }

  return 'status subtle';
}

export function paymentStatusLabel(status: PaymentStatus) {
  if (status === 'PAID') {
    return 'PAID';
  }

  if (status === 'PENDING') {
    return 'PENDING';
  }

  if (status === 'FAILED') {
    return 'FAILED';
  }

  if (status === 'REFUNDED') {
    return 'REFUNDED';
  }

  return 'UNPAID';
}

export function isPayableOrder(order: LaundryOrder) {
  return (order.status_pembayaran === 'UNPAID'
      || order.status_pembayaran === 'PENDING'
      || order.status_pembayaran === 'FAILED')
    && order.status_order !== 'DIBATALKAN'
    && Number(order.total_harga || 0) >= 1000;
}
