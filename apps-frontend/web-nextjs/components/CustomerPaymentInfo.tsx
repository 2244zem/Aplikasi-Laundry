'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ListSkeleton } from '@/components/Skeleton';
import { supabase } from '@/lib/supabaseClient';
import type { LaundryOrder, UserProfile } from '@/lib/types';

type Props = {
  profile: UserProfile;
};

const paymentMethods = [
  {
    account: '083823223372',
    accent: '#6f49d8',
    bank: 'DANA',
    holder: 'Ungu Laundry',
    id: 'dana',
  },
  {
    account: '4373160311',
    accent: '#1a0f3c',
    bank: 'BCA',
    holder: 'Ungu Laundry',
    id: 'bca',
  },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    currency: 'IDR',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Number(value || 0));
}

function PaymentCard({ method }: { method: (typeof paymentMethods)[number] }) {
  const [copied, setCopied] = useState(false);

  async function copyAccount() {
    await navigator.clipboard.writeText(method.account);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article className="payment-card" style={{ '--payment-accent': method.accent } as CSSProperties}>
      <div className="payment-card-head">
        <span>
          <i className="fi fi-rr-credit-card" aria-hidden />
        </span>
        <strong>{method.bank}</strong>
      </div>
      <small>Nomor rekening / wallet</small>
      <p>{method.account}</p>
      <div>
        <span>Atas nama {method.holder}</span>
        <button onClick={copyAccount} type="button">
          <i className={`fi ${copied ? 'fi-sr-badge-check' : 'fi-rr-copy'}`} aria-hidden />
          {copied ? 'Tersalin' : 'Salin'}
        </button>
      </div>
    </article>
  );
}

export function CustomerPaymentInfo({ profile }: Props) {
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingOrderId, setPayingOrderId] = useState('');
  const [message, setMessage] = useState('');

  const unpaidOrders = useMemo(
    () => orders.filter((order) => order.status_pembayaran !== 'PAID' && order.status_order !== 'DIBATALKAN'),
    [orders],
  );
  const unpaidTotal = useMemo(
    () => unpaidOrders.reduce((sum, order) => sum + Number(order.total_harga || order.format_detail?.estimasi_harga || 0), 0),
    [unpaidOrders],
  );

  useEffect(() => {
    let mounted = true;

    async function loadOrders() {
      setLoading(true);
      setMessage('');

      const { data, error } = await supabase
        .from('tabel_order')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(40);

      if (!mounted) {
        return;
      }

      setLoading(false);

      if (error) {
        setMessage(error.message);
        return;
      }

      setOrders((data ?? []) as LaundryOrder[]);
    }

    void loadOrders();

    const channel = supabase
      .channel(`ungu-laundry:payment:${profile.id}`)
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
          setOrders((currentOrders) =>
            currentOrders.map((order) => (order.id === nextOrder.id ? nextOrder : order)),
          );
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [profile.id]);

  async function payWithMidtrans(order: LaundryOrder) {
    const bffBaseUrl = process.env.NEXT_PUBLIC_BFF_BASE_URL;

    if (!bffBaseUrl) {
      setMessage('NEXT_PUBLIC_BFF_BASE_URL belum diisi. Gunakan transfer manual lalu upload bukti di chat.');
      return;
    }

    setPayingOrderId(order.id);
    setMessage('');

    try {
      const response = await fetch(`${bffBaseUrl}/api/v1/payment/create-laundry-order-transaction`, {
        body: JSON.stringify({ orderId: order.id }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Gagal membuat transaksi Midtrans.');
      }

      window.location.href = payload.redirect_url;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `${error.message} Transfer manual tetap bisa dipakai.`
          : 'Gagal membuka Midtrans. Transfer manual tetap bisa dipakai.',
      );
    } finally {
      setPayingOrderId('');
    }
  }

  return (
    <div className="payment-screen">
      <section className="panel soft">
        <div className="page-header">
          <div>
            <p className="eyebrow">Pembayaran</p>
            <h1>Transfer cepat, konfirmasi lewat chat.</h1>
            <p className="muted">Upload bukti transfer di chat order supaya admin bisa update status pembayaran.</p>
          </div>
          <span className="status pending">{unpaidOrders.length} belum lunas</span>
        </div>
      </section>

      <section className="grid two payment-grid">
        {paymentMethods.map((method) => (
          <PaymentCard key={method.id} method={method} />
        ))}
      </section>

      <section className="app-card">
        <div className="page-header">
          <div>
            <p className="eyebrow">Tagihan aktif</p>
            <h2>{formatCurrency(unpaidTotal)}</h2>
            <p className="muted">Total dari order yang belum lunas.</p>
          </div>
          <Link className="button secondary" href="/orders/history">
            <i className="fi fi-rr-ballot" aria-hidden />
            Riwayat
          </Link>
        </div>

        {message ? <div className="alert error">{message}</div> : null}
        {loading && orders.length === 0 ? <ListSkeleton count={2} /> : null}

        <div className="bill-list">
          {!loading && unpaidOrders.length === 0 ? (
            <div className="empty-state compact">
              <i className="fi fi-rr-badge-check" aria-hidden />
              <strong>Tidak ada tagihan aktif</strong>
              <span>Order lunas atau selesai akan tetap bisa dilihat di riwayat.</span>
            </div>
          ) : null}

          {unpaidOrders.map((order) => (
            <article className="bill-card" key={order.id}>
              <div>
                <strong>#{order.id.slice(0, 8)}</strong>
                <span>{order.format_detail?.paket || 'Laundry order'} - {order.format_detail?.outlet_name || 'Outlet'}</span>
              </div>
              <strong>{formatCurrency(Number(order.total_harga || order.format_detail?.estimasi_harga || 0))}</strong>
              <button className="button primary" disabled={payingOrderId === order.id} onClick={() => payWithMidtrans(order)} type="button">
                <i className="fi fi-rr-credit-card" aria-hidden />
                {payingOrderId === order.id ? 'Membuka...' : 'Bayar Sekarang'}
              </button>
              <Link className="button secondary" href={`/orders/${order.id}/chat`}>
                <i className="fi fi-rr-upload" aria-hidden />
                Upload Bukti
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="panel instructions-panel">
        <p className="eyebrow">Cara bayar</p>
        {[
          'Transfer sesuai total tagihan yang muncul pada order.',
          'Tulis ID order pada catatan transfer jika tersedia.',
          'Buka chat order, kirim foto bukti transfer, lalu tunggu admin memverifikasi.',
          'Status pembayaran berubah realtime saat admin mengupdate dashboard.',
        ].map((item, index) => (
          <div className="instruction-step" key={item}>
            <span>{index + 1}</span>
            <p>{item}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
