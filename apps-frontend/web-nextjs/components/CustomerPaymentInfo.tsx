'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ListSkeleton } from '@/components/Skeleton';
import { supabase } from '@/lib/supabaseClient';
import { getValidatedAuthSession } from '@/lib/authSession';
import type { LaundryOrder, UserProfile } from '@/lib/types';

type Props = {
  profile: UserProfile;
};

type BffStatus = 'checking' | 'missing' | 'offline' | 'ready';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    currency: 'IDR',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Number(value || 0));
}

function readPaymentError(payload: unknown, status: number) {
  if (payload && typeof payload === 'object') {
    const code = (payload as { auth_code?: unknown }).auth_code;
    const suffix = typeof code === 'string' ? ` (${code})` : '';
    const error = (payload as { error?: unknown }).error;

    if (typeof error === 'string') {
      return `${error}${suffix}`;
    }

    if (error && typeof error === 'object') {
      const message = (error as { message?: unknown }).message;

      if (typeof message === 'string') {
        return `${message}${suffix}`;
      }

      return JSON.stringify(error);
    }
  }

  return `BFF menolak transaksi (${status}). Coba login ulang lalu bayar lagi.`;
}

export function CustomerPaymentInfo({ profile }: Props) {
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingOrderId, setPayingOrderId] = useState('');
  const [message, setMessage] = useState('');
  const [authChecked, setAuthChecked] = useState(false);
  const [hasPaymentSession, setHasPaymentSession] = useState(false);
  const [bffStatus, setBffStatus] = useState<BffStatus>(
    process.env.NEXT_PUBLIC_BFF_BASE_URL ? 'checking' : 'missing',
  );

  const unpaidOrders = useMemo(
    () => orders.filter((order) => order.status_pembayaran !== 'PAID' && order.status_order !== 'DIBATALKAN'),
    [orders],
  );
  const unpaidTotal = useMemo(
    () => unpaidOrders.reduce((sum, order) => sum + Number(order.total_harga || order.format_detail?.estimasi_harga || 0), 0),
    [unpaidOrders],
  );
  const paymentReady = Boolean(process.env.NEXT_PUBLIC_BFF_BASE_URL)
    && bffStatus === 'ready'
    && authChecked
    && hasPaymentSession;
  const bffLabel = {
    checking: 'BFF dicek',
    missing: 'BFF belum diisi',
    offline: 'BFF offline',
    ready: 'BFF aktif',
  }[bffStatus];

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
          event: 'INSERT',
          filter: `user_id=eq.${profile.id}`,
          schema: 'public',
          table: 'tabel_order',
        },
        (payload) => {
          const nextOrder = payload.new as LaundryOrder;
          setOrders((currentOrders) => [nextOrder, ...currentOrders].slice(0, 40));
        },
      )
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

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const { session } = await getValidatedAuthSession();

      if (!mounted) {
        return;
      }

      setHasPaymentSession(Boolean(session?.access_token));
      setAuthChecked(true);
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setHasPaymentSession(false);
        setAuthChecked(true);
        return;
      }

      void checkSession();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const bffBaseUrl = process.env.NEXT_PUBLIC_BFF_BASE_URL;

    if (!bffBaseUrl) {
      setBffStatus('missing');
      return;
    }

    let mounted = true;
    const controller = new AbortController();

    async function checkBff() {
      setBffStatus('checking');

      try {
        const response = await fetch(`${bffBaseUrl}/health`, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (mounted) {
          setBffStatus(response.ok ? 'ready' : 'offline');
        }
      } catch (_error) {
        if (mounted && !controller.signal.aborted) {
          setBffStatus('offline');
        }
      }
    }

    void checkBff();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  async function payWithMidtrans(order: LaundryOrder) {
    const bffBaseUrl = process.env.NEXT_PUBLIC_BFF_BASE_URL;

    if (!bffBaseUrl) {
      setMessage('NEXT_PUBLIC_BFF_BASE_URL belum diisi. Hubungkan BFF agar tombol Midtrans bisa dipakai.');
      return;
    }

    if (bffStatus !== 'ready') {
      setMessage('BFF pembayaran belum aktif. Jalankan BFF di port 8080 lalu refresh halaman.');
      return;
    }

    const { session: freshSession, errorMessage } = await getValidatedAuthSession();

    if (!freshSession?.access_token) {
      setHasPaymentSession(false);
      setAuthChecked(true);
      setMessage(errorMessage ?? 'Sesi login belum siap. Login ulang, lalu buka halaman Bayar dari menu aplikasi.');
      return;
    }

    setHasPaymentSession(true);
    setAuthChecked(true);
    setPayingOrderId(order.id);
    setMessage('');

    try {
      const response = await fetch(`${bffBaseUrl}/api/v1/payment/create-laundry-order-transaction`, {
        body: JSON.stringify({ orderId: order.id }),
        headers: {
          Authorization: `Bearer ${freshSession.access_token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok) {
        throw new Error(readPaymentError(payload, response.status));
      }

      window.location.href = payload.redirect_url;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Gagal membuka Midtrans. Coba lagi beberapa saat lagi.',
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
            <h1>Bayar order lewat Midtrans.</h1>
            <p className="muted">Klik Bayar Sekarang, selesaikan pembayaran, lalu status berubah realtime dari webhook.</p>
            <div className="actions payment-readiness">
              <span className={`status ${bffStatus === 'ready' ? 'done' : bffStatus === 'offline' ? 'failed' : 'pending'}`}>
                <i className="fi fi-rr-router" aria-hidden />
                {bffLabel}
              </span>
              <span className={`status ${hasPaymentSession ? 'done' : authChecked ? 'failed' : 'pending'}`}>
                <i className="fi fi-rr-user-check" aria-hidden />
                {hasPaymentSession ? 'Session siap' : authChecked ? 'Login ulang' : 'Cek session'}
              </span>
            </div>
          </div>
          <span className="status pending">{unpaidOrders.length} belum lunas</span>
        </div>
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
              <button className="button primary" disabled={!paymentReady || payingOrderId === order.id} onClick={() => payWithMidtrans(order)} type="button">
                <i className="fi fi-rr-credit-card" aria-hidden />
                {payingOrderId === order.id
                  ? 'Membuka...'
                  : !authChecked
                    ? 'Cek Session'
                    : !hasPaymentSession
                      ? 'Login Ulang'
                      : bffStatus !== 'ready'
                        ? 'BFF Belum Siap'
                        : 'Bayar Sekarang'}
              </button>
              <Link className="button secondary" href={`/orders/${order.id}/chat`}>
                <i className="fi fi-rr-comment-alt" aria-hidden />
                Chat Order
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="panel instructions-panel">
        <p className="eyebrow">Cara bayar</p>
        {[
          'Tekan Bayar Sekarang pada tagihan yang dipilih.',
          'Selesaikan pembayaran di halaman Midtrans.',
          'Webhook Midtrans mengubah status pembayaran menjadi PAID atau FAILED.',
          'Halaman ini menerima update realtime tanpa refresh.',
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
