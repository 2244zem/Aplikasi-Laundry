'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ListSkeleton } from '@/components/Skeleton';
import { supabase } from '@/lib/supabaseClient';
import { getValidatedAuthSession } from '@/lib/authSession';
import { isPayableOrder, paymentStatusClass, paymentStatusLabel } from '@/lib/paymentStatus';
import type { LaundryOrder, UserProfile } from '@/lib/types';

type Props = {
  profile: UserProfile;
};

type BffStatus = 'checking' | 'missing' | 'offline' | 'ready';
type PaymentEnvironment = 'production' | 'sandbox' | 'unknown';
type MidtransReadiness = {
  keyMatchesEnvironment: boolean;
  productionReady: boolean;
  serverKeyMode: PaymentEnvironment;
  warnings: string[];
  webhookHttpsReady: boolean;
  webhookUrlConfigured: boolean;
};

const qrisSandboxSimulatorUrl = 'https://simulator.sandbox.midtrans.com/qris/index';

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
  const [paymentEnvironment, setPaymentEnvironment] = useState<PaymentEnvironment>('unknown');
  const [midtransReadiness, setMidtransReadiness] = useState<MidtransReadiness>({
    keyMatchesEnvironment: false,
    productionReady: false,
    serverKeyMode: 'unknown',
    warnings: [],
    webhookHttpsReady: false,
    webhookUrlConfigured: false,
  });
  const [bffStatus, setBffStatus] = useState<BffStatus>(
    process.env.NEXT_PUBLIC_BFF_BASE_URL ? 'checking' : 'missing',
  );

  const unpaidOrders = useMemo(
    () => orders.filter((order) => order.status_pembayaran !== 'PAID' && order.status_order !== 'DIBATALKAN'),
    [orders],
  );
  const unpaidTotal = useMemo(
    () => unpaidOrders.reduce((sum, order) => sum + Number(order.total_harga || 0), 0),
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
      setPaymentEnvironment('unknown');
      setMidtransReadiness((currentReadiness) => ({
        ...currentReadiness,
        warnings: ['NEXT_PUBLIC_BFF_BASE_URL belum diisi.'],
      }));
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
        const payload = await response.json().catch(() => ({}));
        const nextEnvironment = payload?.midtrans?.environment === 'production' || payload?.midtrans_environment === 'production'
          ? 'production'
          : 'sandbox';
        const nextServerKeyMode =
          payload?.midtrans?.server_key_mode === 'production' || payload?.midtrans?.server_key_mode === 'sandbox'
            ? payload.midtrans.server_key_mode
            : 'unknown';

        if (mounted) {
          setBffStatus(response.ok ? 'ready' : 'offline');
          setPaymentEnvironment(response.ok ? nextEnvironment : 'unknown');
          setMidtransReadiness({
            keyMatchesEnvironment: Boolean(payload?.midtrans?.key_matches_environment),
            productionReady: Boolean(payload?.midtrans?.production_ready),
            serverKeyMode: nextServerKeyMode,
            warnings: Array.isArray(payload?.midtrans?.warnings) ? payload.midtrans.warnings : [],
            webhookHttpsReady: Boolean(payload?.midtrans?.webhook_https_ready),
            webhookUrlConfigured: Boolean(payload?.midtrans?.webhook_url_configured),
          });
        }
      } catch (_error) {
        if (mounted && !controller.signal.aborted) {
          setBffStatus('offline');
          setPaymentEnvironment('unknown');
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
              <span className={`status ${paymentEnvironment === 'production' ? 'done' : 'pending'}`}>
                <i className="fi fi-rr-shield-check" aria-hidden />
                {paymentEnvironment === 'production'
                  ? 'Midtrans production'
                  : paymentEnvironment === 'sandbox'
                    ? 'Midtrans sandbox'
                    : 'Mode dicek'}
              </span>
            </div>
          </div>
          <span className="status pending">{unpaidOrders.length} belum lunas</span>
        </div>
      </section>

      <section className="app-card production-readiness-card">
        <div className="page-header compact">
          <div>
            <p className="eyebrow">Production readiness</p>
            <h2>{paymentEnvironment === 'production' ? 'Mode production dicek.' : 'Masih mode sandbox.'}</h2>
            <p className="muted">Checklist ini mencegah QRIS real dipakai saat key/webhook belum siap.</p>
          </div>
          <span className={`status ${paymentEnvironment === 'production' && midtransReadiness.productionReady ? 'done' : 'pending'}`}>
            {paymentEnvironment === 'production' && midtransReadiness.productionReady ? 'READY' : 'CHECK'}
          </span>
        </div>
        <div className="readiness-list">
          <span className={paymentEnvironment !== 'unknown' ? 'ready' : ''}>
            <i className="fi fi-rr-settings" aria-hidden />
            MIDTRANS_IS_PRODUCTION: {paymentEnvironment === 'production' ? 'true' : paymentEnvironment === 'sandbox' ? 'false' : 'dicek'}
          </span>
          <span className={midtransReadiness.keyMatchesEnvironment ? 'ready' : ''}>
            <i className="fi fi-rr-key" aria-hidden />
            Server key: {midtransReadiness.serverKeyMode === 'unknown' ? 'prefix tidak dikenali' : midtransReadiness.serverKeyMode}
          </span>
          <span className={paymentEnvironment !== 'production' || midtransReadiness.webhookHttpsReady ? 'ready' : ''}>
            <i className="fi fi-rr-link" aria-hidden />
            Webhook HTTPS: {midtransReadiness.webhookUrlConfigured ? (midtransReadiness.webhookHttpsReady ? 'siap' : 'belum HTTPS') : 'belum diisi'}
          </span>
        </div>
        {midtransReadiness.warnings.length > 0 ? (
          <div className="readiness-warnings">
            {midtransReadiness.warnings.map((warning) => (
              <small key={warning}>{warning}</small>
            ))}
          </div>
        ) : null}
      </section>

      {paymentEnvironment === 'sandbox' ? (
        <section className="alert info payment-sandbox-note">
          <div>
            <strong>QRIS sandbox tidak bisa discan pakai GoPay asli.</strong>
            <span>
              Untuk testing, buka QRIS Simulator Midtrans lalu masukkan URL gambar QR dari halaman Snap. QR real baru
              valid setelah memakai production key dan mode production.
            </span>
          </div>
          <a className="button secondary" href={qrisSandboxSimulatorUrl} rel="noreferrer" target="_blank">
            <i className="fi fi-rr-link-alt" aria-hidden />
            Buka Simulator
          </a>
        </section>
      ) : null}

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
                <span className={paymentStatusClass(order.status_pembayaran)}>
                  {paymentStatusLabel(order.status_pembayaran)}
                </span>
              </div>
              <strong>
                {Number(order.total_harga || 0) >= 1000
                  ? formatCurrency(Number(order.total_harga || 0))
                  : 'Harga belum final'}
              </strong>
              <button className="button primary" disabled={!paymentReady || !isPayableOrder(order) || payingOrderId === order.id} onClick={() => payWithMidtrans(order)} type="button">
                <i className="fi fi-rr-credit-card" aria-hidden />
                {payingOrderId === order.id
                  ? 'Membuka...'
                  : !authChecked
                    ? 'Cek Session'
                    : !hasPaymentSession
                      ? 'Login Ulang'
                      : bffStatus !== 'ready'
                        ? 'BFF Belum Siap'
                        : !isPayableOrder(order)
                          ? 'Menunggu Harga'
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
          paymentEnvironment === 'sandbox'
            ? 'Untuk QRIS sandbox, gunakan QRIS Simulator Midtrans, bukan aplikasi GoPay asli.'
            : 'Selesaikan pembayaran di halaman Midtrans.',
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
