'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ListSkeleton } from '@/components/Skeleton';
import { paymentStatusClass, paymentStatusLabel } from '@/lib/paymentStatus';
import { supabase } from '@/lib/supabaseClient';
import type { LaundryOrder, UserProfile } from '@/lib/types';

type Props = {
  profile: UserProfile;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    currency: 'IDR',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Number(value || 0));
}

function resultCopy(order: LaundryOrder | null) {
  if (!order) {
    return {
      icon: 'fi-rr-search-alt',
      title: 'Mencari transaksi',
      tone: 'pending',
      body: 'Kami sedang mencocokkan halaman kembali Midtrans dengan order laundry kamu.',
    };
  }

  if (order.status_pembayaran === 'PAID') {
    return {
      icon: 'fi-rr-badge-check',
      title: 'Pembayaran berhasil',
      tone: 'done',
      body: 'Webhook Midtrans sudah mengonfirmasi pembayaran. Status ini ikut tersimpan di riwayat.',
    };
  }

  if (order.status_pembayaran === 'FAILED') {
    return {
      icon: 'fi-rr-cross-circle',
      title: 'Pembayaran gagal',
      tone: 'failed',
      body: 'Transaksi ditolak, dibatalkan, atau kedaluwarsa. Kamu bisa coba bayar lagi dari halaman Bayar.',
    };
  }

  if (order.status_pembayaran === 'PENDING') {
    return {
      icon: 'fi-rr-clock-three',
      title: 'Pembayaran pending',
      tone: 'pending',
      body: 'Midtrans sudah membuat transaksi, tetapi webhook pembayaran belum mengirim status final.',
    };
  }

  return {
    icon: 'fi-rr-wallet',
    title: 'Menunggu pembayaran',
    tone: 'pending',
    body: 'Order sudah ditemukan, tetapi belum ada transaksi pembayaran yang selesai.',
  };
}

export function CustomerPaymentResult({ profile }: Props) {
  const searchParams = useSearchParams();
  const laundryOrderId = searchParams.get('laundry_order_id') || '';
  const midtransOrderId = searchParams.get('midtrans_order_id') || searchParams.get('order_id') || '';
  const [order, setOrder] = useState<LaundryOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const copy = useMemo(() => resultCopy(order), [order]);

  useEffect(() => {
    let mounted = true;

    async function loadOrder() {
      setLoading(true);
      setMessage('');

      let request = supabase
        .from('tabel_order')
        .select('*')
        .eq('user_id', profile.id)
        .limit(1);

      if (laundryOrderId) {
        request = request.eq('id', laundryOrderId);
      } else if (midtransOrderId) {
        request = request.eq('midtrans_order_id', midtransOrderId);
      } else {
        request = request
          .neq('status_pembayaran', 'PAID')
          .order('updated_at', { ascending: false });
      }

      const { data, error } = await request;

      if (!mounted) {
        return;
      }

      setLoading(false);

      if (error) {
        setMessage(error.message);
        return;
      }

      setOrder(((data ?? [])[0] ?? null) as LaundryOrder | null);
    }

    void loadOrder();

    const channel = supabase
      .channel(`ungu-laundry:payment-result:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          filter: `user_id=eq.${profile.id}`,
          schema: 'public',
          table: 'tabel_order',
        },
        (payload) => {
          const nextOrder = payload.new as LaundryOrder;
          const matchesLaundryOrder = laundryOrderId && nextOrder.id === laundryOrderId;
          const matchesMidtransOrder = midtransOrderId && nextOrder.midtrans_order_id === midtransOrderId;

          if (matchesLaundryOrder || matchesMidtransOrder || (!laundryOrderId && !midtransOrderId)) {
            setOrder(nextOrder);
          }
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [laundryOrderId, midtransOrderId, profile.id]);

  return (
    <div className="payment-result-screen">
      <section className={`panel soft payment-result-hero ${copy.tone}`}>
        <span className="payment-result-icon">
          <i className={`fi ${copy.icon}`} aria-hidden />
        </span>
        <div>
          <p className="eyebrow">Status pembayaran</p>
          <h1>{copy.title}</h1>
          <p className="muted">{copy.body}</p>
        </div>
        {order ? <span className={paymentStatusClass(order.status_pembayaran)}>{paymentStatusLabel(order.status_pembayaran)}</span> : null}
      </section>

      <section className="app-card">
        {message ? <div className="alert error">{message}</div> : null}
        {loading ? <ListSkeleton count={2} /> : null}

        {!loading && !order ? (
          <div className="empty-state compact">
            <i className="fi fi-rr-receipt" aria-hidden />
            <strong>Order belum ditemukan</strong>
            <span>Buka Riwayat untuk memastikan order masih ada di akun ini.</span>
          </div>
        ) : null}

        {order ? (
          <div className="payment-result-detail">
            <div>
              <span>Nomor order</span>
              <strong>#{order.id.slice(0, 8)}</strong>
            </div>
            <div>
              <span>Midtrans order</span>
              <strong>{order.midtrans_order_id || '-'}</strong>
            </div>
            <div>
              <span>Total tagihan</span>
              <strong>{formatCurrency(Number(order.total_harga || 0))}</strong>
            </div>
            <div>
              <span>Outlet</span>
              <strong>{order.format_detail?.outlet_name || 'Outlet laundry'}</strong>
            </div>
          </div>
        ) : null}

        <div className="actions">
          <Link className="button primary" href="/orders/history">
            <i className="fi fi-rr-ballot" aria-hidden />
            Lihat Riwayat
          </Link>
          <Link className="button secondary" href="/orders/payment">
            <i className="fi fi-rr-credit-card" aria-hidden />
            Buka Tagihan
          </Link>
        </div>
      </section>
    </div>
  );
}
