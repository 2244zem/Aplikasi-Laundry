'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ListSkeleton, MetricSkeleton } from '@/components/Skeleton';
import { paymentStatusClass, paymentStatusLabel } from '@/lib/paymentStatus';
import { supabase } from '@/lib/supabaseClient';
import type { LaundryOrder, UserProfile } from '@/lib/types';

type Props = {
  profile: UserProfile;
};

type HistoryFilter = 'ALL' | 'ACTIVE' | 'DONE';

const orderSteps: LaundryOrder['status_order'][] = ['PENDING_CONFIRMATION', 'DITERIMA', 'DICUCI', 'DISETRIKA', 'SELESAI'];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    currency: 'IDR',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Number(value || 0));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function statusLabel(status: LaundryOrder['status_order']) {
  return status === 'PENDING_CONFIRMATION' ? 'PENDING' : status;
}

function upsertOrder(currentOrders: LaundryOrder[], nextOrder: LaundryOrder) {
  const exists = currentOrders.some((order) => order.id === nextOrder.id);
  const nextOrders = exists
    ? currentOrders.map((order) => (order.id === nextOrder.id ? nextOrder : order))
    : [nextOrder, ...currentOrders];

  return nextOrders.sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function isDone(order: LaundryOrder) {
  return order.status_order === 'SELESAI' || order.status_order === 'DIBATALKAN';
}

export function CustomerOrderHistory({ profile }: Props) {
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const filteredOrders = useMemo(() => {
    if (filter === 'ACTIVE') {
      return orders.filter((order) => !isDone(order));
    }

    if (filter === 'DONE') {
      return orders.filter(isDone);
    }

    return orders;
  }, [filter, orders]);

  const stats = useMemo(() => {
    const unpaid = orders.filter((order) => order.status_pembayaran !== 'PAID').length;
    const active = orders.filter((order) => !isDone(order)).length;
    const total = orders.reduce((sum, order) => sum + Number(order.total_harga || 0), 0);

    return { active, total, unpaid };
  }, [orders]);

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
        .limit(80);

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
      .channel(`ungu-laundry:history:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          filter: `user_id=eq.${profile.id}`,
          schema: 'public',
          table: 'tabel_order',
        },
        (payload) => {
          setOrders((currentOrders) => upsertOrder(currentOrders, payload.new as LaundryOrder));
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
          setOrders((currentOrders) => upsertOrder(currentOrders, payload.new as LaundryOrder));
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [profile.id]);

  return (
    <div className="history-screen">
      <section className="panel soft">
        <div className="page-header">
          <div>
            <p className="eyebrow">Pesanan saya</p>
            <h1>Riwayat order yang live.</h1>
            <p className="muted">Semua perubahan admin masuk realtime, termasuk status kerja dan pembayaran.</p>
          </div>
          <Link className="button primary" href="/orders/new">
            <i className="fi fi-rr-add-document" aria-hidden />
            Order Baru
          </Link>
        </div>
      </section>

      <section className="grid three metric-grid">
        {loading && orders.length === 0 ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : (
          <>
            <article className="panel metric-card">
              <span>Aktif</span>
              <strong>{stats.active}</strong>
              <small>order berjalan</small>
            </article>
            <article className="panel metric-card">
              <span>Belum lunas</span>
              <strong>{stats.unpaid}</strong>
              <small>perlu bayar atau verifikasi</small>
            </article>
            <article className="panel metric-card">
              <span>Total transaksi</span>
              <strong>{formatCurrency(stats.total)}</strong>
              <small>semua order user ini</small>
            </article>
          </>
        )}
      </section>

      <section className="app-card">
        <div className="page-header">
          <div>
            <p className="eyebrow">Timeline</p>
            <h2>Daftar pesanan</h2>
          </div>
          <div className="segmented-control" role="tablist" aria-label="Filter riwayat order">
            {(['ALL', 'ACTIVE', 'DONE'] as HistoryFilter[]).map((item) => (
              <button
                aria-selected={filter === item}
                className={filter === item ? 'active' : ''}
                key={item}
                onClick={() => setFilter(item)}
                type="button"
              >
                {item === 'ALL' ? 'Semua' : item === 'ACTIVE' ? 'Aktif' : 'Selesai'}
              </button>
            ))}
          </div>
        </div>

        {message ? <div className="alert error">{message}</div> : null}
        {loading && orders.length === 0 ? <ListSkeleton count={3} /> : null}

        <div className="history-list">
          {!loading && filteredOrders.length === 0 ? (
            <div className="empty-state">
              <i className="fi fi-rr-ballot" aria-hidden />
              <strong>Belum ada pesanan</strong>
              <span>Riwayat akan muncul setelah kamu membuat order.</span>
            </div>
          ) : null}

          {filteredOrders.map((order) => {
            const detail = order.format_detail ?? {};
            const stepIndex = orderSteps.indexOf(order.status_order);
            const isCancelled = order.status_order === 'DIBATALKAN';

            return (
              <article className="history-order-card" key={order.id}>
                <div className="ticket-head">
                  <div>
                    <span className="ticket-id">#{order.id.slice(0, 8)}</span>
                    <h3>{detail.paket || 'Laundry order'}</h3>
                    <p className="muted">{formatDate(order.created_at)}</p>
                  </div>
                  <div className="ticket-status-stack">
                    <span className={`status ${order.status_order === 'SELESAI' ? 'done' : isCancelled ? 'failed' : 'pending'}`}>
                      {statusLabel(order.status_order)}
                    </span>
                    <span className={paymentStatusClass(order.status_pembayaran)}>
                      {paymentStatusLabel(order.status_pembayaran)}
                    </span>
                  </div>
                </div>

                <div className="history-detail-grid">
                  <span>
                    <i className="fi fi-rr-store-alt" aria-hidden />
                    {detail.outlet_name || 'Outlet laundry'}
                  </span>
                  <span>
                    <i className="fi fi-rr-shirt-long-sleeve" aria-hidden />
                    {detail.estimasi_pakaian ?? '-'} {detail.satuan || 'pcs'}
                  </span>
                  <span>
                    <i className="fi fi-rr-map-marker-home" aria-hidden />
                    {detail.alamat || '-'}
                  </span>
                  <span>
                    <i className="fi fi-rr-wallet" aria-hidden />
                    {formatCurrency(Number(order.total_harga || 0))}
                  </span>
                </div>

                <div className="status-rail" aria-label="Progress order">
                  {orderSteps.map((status, index) => (
                    <span className={!isCancelled && index <= stepIndex ? 'active' : ''} key={status}>
                      {statusLabel(status)}
                    </span>
                  ))}
                </div>

                <div className="actions">
                  <Link className="button secondary" href={`/orders/${order.id}/chat`}>
                    <i className="fi fi-rr-comment-alt" aria-hidden />
                    Chat & Status
                  </Link>
                  {order.status_pembayaran !== 'PAID' ? (
                    <Link className="button primary" href="/orders/payment">
                      <i className="fi fi-rr-credit-card" aria-hidden />
                      Bayar
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
