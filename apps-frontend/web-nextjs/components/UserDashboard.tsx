'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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

const serviceActions = {
  id: [
    { href: '/orders/new?service=cuci-kiloan', icon: 'fi-rr-washer', title: 'Cuci kiloan reguler', body: 'Harian, rapi, siap dipakai lagi.' },
    { href: '/orders/new?service=premium', icon: 'fi-rr-shirt-long-sleeve', title: 'Satuan premium', body: 'Jas, gaun, dan bahan sensitif.' },
    { href: '/orders/new?service=sepatu', icon: 'fi-rr-shoe-prints', title: 'Spa sepatu', body: 'Perawatan bersih dan lembut.' },
  ],
  en: [
    { href: '/orders/new?service=cuci-kiloan', icon: 'fi-rr-washer', title: 'Regular wash', body: 'Daily garments, folded neatly.' },
    { href: '/orders/new?service=premium', icon: 'fi-rr-shirt-long-sleeve', title: 'Premium pieces', body: 'Suits, dresses, and delicate care.' },
    { href: '/orders/new?service=sepatu', icon: 'fi-rr-shoe-prints', title: 'Shoe spa', body: 'Gentle cleaning and refresh.' },
  ],
};

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

function statusSentence(order: LaundryOrder, language: 'id' | 'en') {
  const shortId = order.id.slice(0, 8).toUpperCase();
  const outlet = order.format_detail?.outlet_name;
  const pickup = order.format_detail?.pickup_time;
  const label = statusLabel(order.status_order, language).toLowerCase();

  if (language === 'en') {
    return `Order #${shortId} is ${label}${outlet ? ` at ${outlet}` : ''}${pickup ? `. Pickup ${pickup}` : ''}.`;
  }

  return `Pesanan #${shortId} sedang ${label}${outlet ? ` di ${outlet}` : ''}${pickup ? `. Pickup ${pickup}` : ''}.`;
}

function greeting(language: 'id' | 'en') {
  const hour = new Date().getHours();

  if (language === 'en') {
    if (hour < 11) return 'Good morning';
    if (hour < 15) return 'Good afternoon';
    if (hour < 18) return 'Good evening';
    return 'Good night';
  }

  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
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
  const searchParams = useSearchParams();
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

  function withCurrentContext(href: string) {
    const [path, query = ''] = href.split('?');
    const params = new URLSearchParams(query);

    ['isandroid', 'istablet', 'isdesktop', 'lang'].forEach((key) => {
      if (searchParams.has(key) && !params.has(key)) {
        params.set(key, searchParams.get(key) ?? '');
      }
    });

    const nextQuery = params.toString();
    return `${path}${nextQuery ? `?${nextQuery}` : ''}`;
  }

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
      title: `${greeting('id')}, ${profile.nama}.`,
      body: 'Ada yang bisa kami bantu segarkan hari ini?',
      concierge: 'Ungu Laundry Concierge',
      quick: 'Pilih layanan',
      active: 'Order aktif',
      pickup: 'Status pickup',
      outlet: 'Laundry pilihan',
      unpaid: 'Belum lunas',
      orderNow: 'Buat order',
      history: 'Riwayat',
      pay: 'Bayar',
      chat: 'Buka chat',
      track: 'Lacak rincian',
      noOrder: 'Belum ada order aktif',
      noOrderBody: 'Mulai dengan memilih laundry terdekat dan jadwal pickup.',
      latest: 'Order terbaru',
      loading: 'Memuat dashboard...',
      timeline: 'Perjalanan pesanan',
      estimate: 'Estimasi selesai mengikuti update outlet.',
    },
    en: {
      eyebrow: 'Customer dashboard',
      title: `${greeting('en')}, ${profile.nama}.`,
      body: 'What can we refresh for you today?',
      concierge: 'Ungu Laundry Concierge',
      quick: 'Choose a service',
      active: 'Active orders',
      pickup: 'Pickup status',
      outlet: 'Selected laundry',
      unpaid: 'Unpaid bills',
      orderNow: 'Create order',
      history: 'History',
      pay: 'Pay',
      chat: 'Open chat',
      track: 'Track details',
      noOrder: 'No active order yet',
      noOrderBody: 'Start by choosing a nearby laundry and pickup schedule.',
      latest: 'Latest order',
      loading: 'Loading dashboard...',
      timeline: 'Order journey',
      estimate: 'Finish estimate follows outlet updates.',
    },
  }[language];

  return (
    <main className="page user-dashboard-screen">
      <section className="panel soft dashboard-hero customer-concierge-hero">
        <div>
          <p className="eyebrow">{text.concierge}</p>
          <h1>{text.title}</h1>
          <p className="muted">{text.body}</p>
        </div>
        <div className="actions">
          <Link className="button primary" href={withCurrentContext('/orders/new')}>
            <i className="fi fi-rr-add-document" aria-hidden />
            {text.orderNow}
          </Link>
          <Link className="button secondary" href={withCurrentContext('/orders/history')}>
            <i className="fi fi-rr-ballot" aria-hidden />
            {text.history}
          </Link>
        </div>
      </section>

      {primaryOrder ? (
        <section className="customer-live-card">
          <div>
            <p className="eyebrow">{text.active}</p>
            <h2>{statusSentence(primaryOrder, language)}</h2>
            <span className={paymentStatusClass(primaryOrder.status_pembayaran)}>
              {paymentStatusLabel(primaryOrder.status_pembayaran)}
            </span>
          </div>
          <div className="customer-live-actions">
            <Link className="button secondary" href={withCurrentContext(`/orders/${primaryOrder.id}/chat`)}>
              <i className="fi fi-rr-comment-alt" aria-hidden />
              {text.chat}
            </Link>
            <Link className="button primary" href={withCurrentContext('/orders/history')}>
              <i className="fi fi-rr-route" aria-hidden />
              {text.track}
            </Link>
          </div>
        </section>
      ) : null}

      <section className="customer-quick-actions" aria-label={text.quick}>
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">{text.quick}</p>
            <h2>{language === 'id' ? 'Satu ketukan untuk mulai.' : 'One tap to begin.'}</h2>
          </div>
        </div>
        <div className="customer-service-grid">
          {serviceActions[language].map((service) => (
            <Link className="customer-service-pill" href={withCurrentContext(service.href)} key={service.title}>
              <span>
                <i className={`fi ${service.icon}`} aria-hidden />
              </span>
              <strong>{service.title}</strong>
              <small>{service.body}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid four dashboard-metrics customer-metrics">
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
            <p className="eyebrow">{primaryOrder ? text.timeline : text.latest}</p>
            <h2>{primaryOrder ? `#${primaryOrder.id.slice(0, 8)}` : text.noOrder}</h2>
            <p className="muted">{primaryOrder ? text.estimate : text.noOrderBody}</p>
          </div>
          {primaryOrder ? (
            <div className="actions">
              <Link className="button secondary" href={withCurrentContext(`/orders/${primaryOrder.id}/chat`)}>
                <i className="fi fi-rr-comment-alt" aria-hidden />
                {text.chat}
              </Link>
              {primaryOrder.status_pembayaran !== 'PAID' ? (
                <Link className="button primary" href={withCurrentContext('/orders/payment')}>
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
            <div className="customer-timeline" aria-label="Progress order">
              {statusSteps.map((status, index) => {
                const currentIndex = statusSteps.indexOf(primaryOrder.status_order);

                return (
                  <div className={index <= currentIndex ? 'active' : ''} key={status}>
                    <span>
                      <i className={index <= currentIndex ? 'fi fi-rr-check' : 'fi fi-rr-circle'} aria-hidden />
                    </span>
                    <p>{statusLabel(status, language)}</p>
                  </div>
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
