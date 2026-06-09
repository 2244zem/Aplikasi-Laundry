'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ListSkeleton, MetricSkeleton } from '@/components/Skeleton';
import { paymentStatusClass, paymentStatusLabel } from '@/lib/paymentStatus';
import { supabase } from '@/lib/supabaseClient';
import { useAppLanguage, useLocalizedNumber } from '@/lib/i18n';
import type { LaundryOrder, UserProfile } from '@/lib/types';

type Props = {
  profile: UserProfile;
};

const statusSteps: LaundryOrder['status_order'][] = ['PENDING_CONFIRMATION', 'DITERIMA', 'DICUCI', 'DISETRIKA', 'SELESAI'];

function isActiveOrder(order: LaundryOrder) {
  return order.status_order !== 'SELESAI' && order.status_order !== 'DIBATALKAN';
}

function statusLabel(status: LaundryOrder['status_order'], language: 'id' | 'en') {
  const labels = {
    id: {
      PENDING_CONFIRMATION: 'Menunggu',
      DITERIMA: 'Diterima',
      DICUCI: 'Dicuci',
      DISETRIKA: 'Disetrika',
      SELESAI: 'Selesai',
      DIBATALKAN: 'Dibatalkan',
    },
    en: {
      PENDING_CONFIRMATION: 'Pending',
      DITERIMA: 'Accepted',
      DICUCI: 'Washing',
      DISETRIKA: 'Ironing',
      SELESAI: 'Done',
      DIBATALKAN: 'Canceled',
    },
  } as const;

  return labels[language][status];
}

function upsertOrder(currentOrders: LaundryOrder[], nextOrder: LaundryOrder) {
  const exists = currentOrders.some((order) => order.id === nextOrder.id);
  const nextOrders = exists
    ? currentOrders.map((order) => (order.id === nextOrder.id ? nextOrder : order))
    : [nextOrder, ...currentOrders];

  return nextOrders.sort((left, right) => right.created_at.localeCompare(left.created_at)).slice(0, 12);
}

export function UserDashboard({ profile }: Props) {
  const language = useAppLanguage();
  const format = useLocalizedNumber();
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const activeOrders = useMemo(() => orders.filter(isActiveOrder), [orders]);
  const primaryOrder = activeOrders[0] ?? orders[0] ?? null;
  const unpaidOrders = useMemo(
    () => orders.filter((order) => order.status_pembayaran !== 'PAID' && order.status_order !== 'DIBATALKAN'),
    [orders],
  );
  const unpaidTotal = useMemo(
    () => unpaidOrders.reduce((sum, order) => sum + Number(order.total_harga || 0), 0),
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
        .limit(12);

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
      .channel(`ungu-laundry:user-dashboard:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          filter: `user_id=eq.${profile.id}`,
          schema: 'public',
          table: 'tabel_order',
        },
        (payload) => setOrders((current) => upsertOrder(current, payload.new as LaundryOrder)),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          filter: `user_id=eq.${profile.id}`,
          schema: 'public',
          table: 'tabel_order',
        },
        (payload) => setOrders((current) => upsertOrder(current, payload.new as LaundryOrder)),
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [profile.id]);

  const text = {
    id: {
      eyebrow: 'Dashboard customer',
      title: `Halo, ${profile.nama}`,
      body: 'Pantau pickup, laundry pilihan, chat, dan tagihan dari satu layar.',
      active: 'Order aktif',
      pickup: 'Status pickup',
      outlet: 'Laundry pilihan',
      unpaid: 'Belum lunas',
      orderNow: 'Buat order',
      history: 'Riwayat',
      pay: 'Bayar',
      chat: 'Buka chat',
      noOrder: 'Belum ada order aktif',
      noOrderBody: 'Mulai dengan memilih laundry terdekat dan jadwal pickup.',
      latest: 'Order terbaru',
      loading: 'Memuat dashboard...',
    },
    en: {
      eyebrow: 'Customer dashboard',
      title: `Hi, ${profile.nama}`,
      body: 'Track pickup, selected outlet, chat, and unpaid bills from one screen.',
      active: 'Active orders',
      pickup: 'Pickup status',
      outlet: 'Selected laundry',
      unpaid: 'Unpaid bills',
      orderNow: 'Create order',
      history: 'History',
      pay: 'Pay',
      chat: 'Open chat',
      noOrder: 'No active order yet',
      noOrderBody: 'Start by choosing a nearby laundry and pickup schedule.',
      latest: 'Latest order',
      loading: 'Loading dashboard...',
    },
  }[language];

  return (
    <main className="page user-dashboard-screen">
      <section className="panel soft dashboard-hero">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h1>{text.title}</h1>
          <p className="muted">{text.body}</p>
        </div>
        <div className="actions">
          <Link className="button primary" href="/orders/new">
            <i className="fi fi-rr-add-document" aria-hidden />
            {text.orderNow}
          </Link>
          <Link className="button secondary" href="/orders/history">
            <i className="fi fi-rr-ballot" aria-hidden />
            {text.history}
          </Link>
        </div>
      </section>

      <section className="grid four dashboard-metrics">
        {loading && orders.length === 0 ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : (
          <>
            <article className="panel metric-card">
              <span>{text.active}</span>
              <strong>{activeOrders.length}</strong>
              <small>{orders.length} total</small>
            </article>
            <article className="panel metric-card">
              <span>{text.pickup}</span>
              <strong>{primaryOrder ? statusLabel(primaryOrder.status_order, language) : '-'}</strong>
              <small>{primaryOrder?.format_detail?.pickup_time || 'Pickup fleksibel'}</small>
            </article>
            <article className="panel metric-card">
              <span>{text.outlet}</span>
              <strong>{primaryOrder?.format_detail?.outlet_name || '-'}</strong>
              <small>{primaryOrder?.format_detail?.paket || 'Belum ada layanan'}</small>
            </article>
            <article className="panel metric-card">
              <span>{text.unpaid}</span>
              <strong>{format.currency(unpaidTotal)}</strong>
              <small>{unpaidOrders.length} order</small>
            </article>
          </>
        )}
      </section>

      <section className="app-card dashboard-main-card">
        <div className="page-header">
          <div>
            <p className="eyebrow">{text.latest}</p>
            <h2>{primaryOrder ? `#${primaryOrder.id.slice(0, 8)}` : text.noOrder}</h2>
            <p className="muted">{primaryOrder ? format.date(primaryOrder.created_at) : text.noOrderBody}</p>
            {primaryOrder ? (
              <span className={paymentStatusClass(primaryOrder.status_pembayaran)}>
                {paymentStatusLabel(primaryOrder.status_pembayaran)}
              </span>
            ) : null}
          </div>
          {primaryOrder ? (
            <div className="actions">
              <Link className="button secondary" href={`/orders/${primaryOrder.id}/chat`}>
                <i className="fi fi-rr-comment-alt" aria-hidden />
                {text.chat}
              </Link>
              {primaryOrder.status_pembayaran !== 'PAID' ? (
                <Link className="button primary" href="/orders/payment">
                  <i className="fi fi-rr-credit-card" aria-hidden />
                  {text.pay}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        {message ? <div className="alert error">{message}</div> : null}
        {loading && orders.length === 0 ? <ListSkeleton count={2} /> : null}

        {!loading && primaryOrder ? (
          <div className="dashboard-order-focus">
            <div className="status-rail large" aria-label="Progress order">
              {statusSteps.map((status, index) => {
                const currentIndex = statusSteps.indexOf(primaryOrder.status_order);

                return (
                  <span className={index <= currentIndex ? 'active' : ''} key={status}>
                    {statusLabel(status, language)}
                  </span>
                );
              })}
            </div>
            <div className="history-detail-grid">
              <span>
                <i className="fi fi-rr-store-alt" aria-hidden />
                {primaryOrder.format_detail?.outlet_name || 'Outlet'}
              </span>
              <span>
                <i className="fi fi-rr-map-marker-home" aria-hidden />
                {primaryOrder.format_detail?.alamat || '-'}
              </span>
              <span>
                <i className="fi fi-rr-shirt-long-sleeve" aria-hidden />
                {primaryOrder.format_detail?.estimasi_pakaian ?? '-'} {primaryOrder.format_detail?.satuan || 'pcs'}
              </span>
              <span>
                <i className="fi fi-rr-wallet" aria-hidden />
                {Number(primaryOrder.total_harga || 0) >= 1000
                  ? format.currency(Number(primaryOrder.total_harga || 0))
                  : language === 'id'
                    ? 'Harga belum final'
                    : 'Final price pending'}
              </span>
            </div>
          </div>
        ) : null}

        {!loading && !primaryOrder ? (
          <div className="empty-state">
            <i className="fi fi-rr-washer" aria-hidden />
            <strong>{text.noOrder}</strong>
            <span>{text.noOrderBody}</span>
          </div>
        ) : null}
      </section>
    </main>
  );
}
